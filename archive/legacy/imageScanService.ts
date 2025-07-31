import sharp from 'sharp';
import cvInit from 'opencv-js-wasm';
let cvPromise: Promise<any> | null = null;

const DEFAULT_DEBUG = process.env.IMAGE_SCAN_DEBUG === 'true';

async function loadCV(): Promise<any> {
  if (!cvPromise) {
    // opencv-js-wasm resolves with ready-to-use cv, no need for onRuntimeInitialized
    cvPromise = cvInit();
  }
  return cvPromise;
}

// Utility: buffer to base64
export function bufferToBase64(buffer: Buffer): string {
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

// Convert sharp buffer -> OpenCV.js Mat
function bufferToMat(cv: any, buffer: Buffer): any {
  const img = sharp(buffer);
  try {
    return img
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => {
        console.log('bufferToMat info:', info);
        const { width, height, channels } = info;
        const safeChannels = channels === 3 || channels === 4 ? channels : 4;
        if (channels !== 3 && channels !== 4) {
          console.warn(`Unexpected channel count ${channels}, forcing RGBA`);
        }
        const mat = new cv.Mat(height, width, safeChannels === 3 ? cv.CV_8UC3 : cv.CV_8UC4);
        mat.data.set(data);
        return mat;
      });
  } catch (err) {
    console.error('bufferToMat failed:', err);
    throw new Error(`bufferToMat failed: ${err}`);
  }
}

// Helper: order corners TL, TR, BR, BL
function orderCorners(points: number[][]): number[][] {
  points.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  const [tl, br] = [points[0], points[3]];
  const [tr, bl] = points[1][1] < points[2][1] ? [points[1], points[2]] : [points[2], points[1]];
  return [tl, tr, br, bl];
}

// Helper: get warp size + dst points
function getWarpSize(cv: any, pts: number[][]) {
  const [tl, tr, br, bl] = pts;
  const widthA = Math.hypot(br[0] - bl[0], br[1] - bl[1]);
  const widthB = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
  const maxWidth = Math.max(widthA, widthB);

  const heightA = Math.hypot(tr[0] - br[0], tr[1] - br[1]);
  const heightB = Math.hypot(tl[0] - bl[0], tl[1] - bl[1]);
  const maxHeight = Math.max(heightA, heightB);

  const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    maxWidth - 1,
    0,
    maxWidth - 1,
    maxHeight - 1,
    0,
    maxHeight - 1
  ]);

  return { width: Math.round(maxWidth), height: Math.round(maxHeight), dstPoints };
}

// Helper: compress and resize debug images to avoid huge payloads
async function compressDebugImage(buffer: Buffer): Promise<string> {
  const resized = await sharp(buffer)
    .resize({ width: 800, withoutEnlargement: true })
    .jpeg({ quality: 60 })
    .toBuffer();
  return `data:image/jpeg;base64,${resized.toString('base64')}`;
}

// Convert Mat to compressed/resized base64 for debug images
async function matToDebugBase64(mat: any): Promise<string> {
  const imgBuffer = Buffer.from(mat.data);
  const image = sharp(imgBuffer, {
    raw: {
      width: mat.cols,
      height: mat.rows,
      channels: mat.channels() || 4
    }
  });
  const pngBuffer = await image.png().toBuffer();
  return compressDebugImage(pngBuffer);
}

// --- Core Document Scan Logic ---
export async function scanImageBuffer(
  buffer: Buffer,
  debug = DEFAULT_DEBUG // See top of module for default value
): Promise<{
  success: boolean;
  reason?: string;
  corners?: number[][];
  scannedImage?: string;
  debugImages?: { [step: string]: string };
}> {
  console.log('[scanImageBuffer] loading OpenCV...');
  const cv = await loadCV();
  console.log('[scanImageBuffer] OpenCV loaded.');
  try {
    const debugImages: Record<string, string> = {};

    // Step 1: auto-rotate based on EXIF
    const rotatedBuffer = await sharp(buffer).rotate().toBuffer();

    // Step 2: read into OpenCV.js Mat
    const srcMat = await bufferToMat(cv, rotatedBuffer);
    const totalArea = srcMat.rows * srcMat.cols;
    const minContourArea = totalArea * 0.05;

    const gray = new cv.Mat();
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY, 0);
    if (debug) {
      debugImages['gray'] = await matToDebugBase64(gray);
    }

    // Step 3: Edge detection
    const blurred = new cv.Mat();
    const edges = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    if (debug) {
      debugImages['blurred'] = await matToDebugBase64(blurred);
    }
    cv.Canny(blurred, edges, 50, 150); // slightly more forgiving thresholds
    if (debug) {
      debugImages['edges'] = await matToDebugBase64(edges);
    }

    // Step 4: find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    if (debug) {
      const contourVis = srcMat.clone();
      cv.drawContours(contourVis, contours, -1, new cv.Scalar(0, 255, 0, 255), 2);
      debugImages['all_contours'] = await matToDebugBase64(contourVis);
      contourVis.delete();
    }

    if (contours.size() === 0) {
      srcMat.delete();
      gray.delete();
      blurred.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();
      return { success: false, reason: 'no_contours_detected', ...(debug ? { debugImages } : {}) };
    }

    // Find the largest contour by area
    let largestContourIdx = -1;
    let largestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const area = cv.contourArea(contours.get(i));
      if (area > largestArea) {
        largestArea = area;
        largestContourIdx = i;
      }
    }

    console.log('largestArea:', largestArea, 'min required:', minContourArea);
    let ordered: number[][];
    if (largestArea < minContourArea) {
      console.warn('[scanImageBuffer] No large contour found, falling back to full image bounds');
      ordered = [
        [0, 0],
        [srcMat.cols - 1, 0],
        [srcMat.cols - 1, srcMat.rows - 1],
        [0, srcMat.rows - 1]
      ];
      // draw fallback rectangle if debug
      if (debug) {
        const fallbackVis = srcMat.clone();
        cv.rectangle(
          fallbackVis,
          new cv.Point(0, 0),
          new cv.Point(srcMat.cols - 1, srcMat.rows - 1),
          new cv.Scalar(255, 0, 0, 255),
          3
        );
        debugImages['fallback_full_image'] = await matToDebugBase64(fallbackVis);
        fallbackVis.delete();
      }
    } else {
      const largestContour = contours.get(largestContourIdx);
      const peri = cv.arcLength(largestContour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(largestContour, approx, 0.05 * peri, true); // more forgiving

      if (approx.rows === 4) {
        // Normal case: we got a quadrilateral
        const points: number[][] = [];
        for (let i = 0; i < approx.rows; i++) {
          points.push([approx.intPtr(i, 0)[0], approx.intPtr(i, 0)[1]]);
        }
        ordered = orderCorners(points);
      } else {
        // Fallback: use minAreaRect to get best-fit rectangle
        console.warn(
          '[scanImageBuffer] approxPolyDP did not return 4 points, using minAreaRect fallback'
        );
        const rect = cv.minAreaRect(largestContour);
        if (!rect || !rect.size || rect.size.width === 0 || rect.size.height === 0) {
          // Fallback failed, generate asymmetric fallback rectangle using image bounds and margin
          const margin = Math.round(0.05 * srcMat.rows);
          const left = 0;
          const right = srcMat.cols - 1;
          const top = margin;
          const bottom = srcMat.rows - margin;
          ordered = [
            [left, top], // TL
            [right, top], // TR
            [right, bottom], // BR
            [left, bottom] // BL
          ];
        } else {
          const rectPoints = cv.RotatedRect.points(rect); // returns 4 points
          ordered = orderCorners(rectPoints.map((p: any) => [p.x, p.y]));
        }
      }
      approx.delete();
    }

    // Get warp matrix & warp
    const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      ordered[0][0],
      ordered[0][1],
      ordered[1][0],
      ordered[1][1],
      ordered[2][0],
      ordered[2][1],
      ordered[3][0],
      ordered[3][1]
    ]);

    const dstSize = getWarpSize(cv, ordered);
    const M = cv.getPerspectiveTransform(srcPoints, dstSize.dstPoints);
    const warped = new cv.Mat();
    cv.warpPerspective(srcMat, warped, M, new cv.Size(dstSize.width, dstSize.height));
    if (debug) {
      debugImages['warped'] = await matToDebugBase64(warped);
    }

    // Ensure warped has safe RGBA channels for sharp
    let safeWarped: any = new cv.Mat();
    if (warped.channels() === 1) {
      cv.cvtColor(warped, safeWarped, cv.COLOR_GRAY2RGBA);
    } else if (warped.channels() === 3) {
      cv.cvtColor(warped, safeWarped, cv.COLOR_RGB2RGBA);
    } else {
      safeWarped = warped.clone();
    }

    const warpedBuffer = Buffer.from(safeWarped.data);
    const warpedImage = sharp(warpedBuffer, {
      raw: {
        width: safeWarped.cols,
        height: safeWarped.rows,
        channels: safeWarped.channels()
      }
    });
    const outputBuffer = await warpedImage.jpeg().toBuffer();
    safeWarped.delete();

    // Cleanup
    srcMat.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
    warped.delete();
    srcPoints.delete();
    dstSize.dstPoints.delete();
    M.delete();

    return {
      success: true,
      corners: ordered,
      scannedImage: `data:image/jpeg;base64,${outputBuffer.toString('base64')}`,
      ...(debug ? { debugImages } : {})
    };
    // Note: max response size only enforced when debug=false to avoid truncating diagnostic data
  } catch (err: any) {
    console.error('Unexpected scan error:', err);
    // Ensure debugImages is always defined before referencing in return object
    const debugImagesSafe = debug ? {} : undefined;
    return {
      success: false,
      reason: 'internal_error',
      ...(debug && debugImagesSafe ? { debugImages: debugImagesSafe } : {})
    };
  }
}
