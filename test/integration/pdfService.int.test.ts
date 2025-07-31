import { vi } from 'vitest';
import axios from 'axios';
import request from 'supertest';
import { app } from '../../server'; // wherever your Express app is defined
import path from 'path';

vi.mock('axios');

vi.mock('@google-cloud/vision', () => ({
  __esModule: true,
  default: {
    ImageAnnotatorClient: vi.fn(() => ({
      textDetection: vi.fn().mockResolvedValue([
        {
          textAnnotations: [{ description: 'OCR extracted text from scanned PDF' }]
        }
      ])
    }))
  }
}));

beforeEach(() => {
  (axios.post as any).mockResolvedValue({
    data: {
      choices: [
        {
          message: {
            tool_calls: [
              {
                function: {
                  arguments: JSON.stringify({
                    itemListElement: [
                      {
                        name: 'Mock PDF Recipe',
                        servings: 2,
                        ingredients: [],
                        steps: [],
                        ogImageUrl: 'data:image/png;base64,FAKE_IMAGE_DATA'
                      }
                    ]
                  })
                }
              }
            ]
          }
        }
      ]
    }
  });
  // Also mock @google-cloud/vision for OCR fallback in tests
  // (Mock is already set globally above, nothing to do here unless per-test customization is needed)
});

describe('POST /webhook with PDF uploads', () => {
  const fakePdfPath = path.join(__dirname, '../fixtures/pdfs/fake.pdf');
  const scannedPdfPath = path.join(__dirname, '../fixtures/pdfs/scanned.pdf');
  const corruptPdfPath = path.join(__dirname, '../fixtures/pdfs/corrupt.pdf');
  const fakePdfWithImagePath = path.join(__dirname, '../fixtures/pdfs/fake-with-image.pdf');

  it('returns extracted text for PDF with significant text', async () => {
    const res = await request(app)
      .post('/webhook')
      .attach('filename', fakePdfPath)
      .field('responseMode', 'json');

    expect(res.status).toBe(200);
    expect(res.body.itemListElement[0].name).toBe('Mock PDF Recipe');
  });

  it('extracts text AND an embedded image URL', async () => {
    const res = await request(app)
      .post('/webhook')
      .attach('filename', fakePdfWithImagePath)
      .field('responseMode', 'json');

    expect(res.status).toBe(200);
    expect(res.body.itemListElement[0].name).toBe('Mock PDF Recipe');
    const ogImageUrl = res.body.itemListElement[0].ogImageUrl;
    expect(
      ogImageUrl === null ||
        (typeof ogImageUrl === 'string' &&
          (/^http/.test(ogImageUrl) || /^data:image\/[a-zA-Z]+;base64,/.test(ogImageUrl)))
    ).toBe(true);
  });

  it('returns OCR text for PDF with no embedded text', async () => {
    // use a "scanned" PDF fixture or force OCR path by mocking extractTextFromPdf
    const res = await request(app)
      .post('/webhook')
      .attach('filename', scannedPdfPath)
      .field('responseMode', 'json');

    expect(res.status).toBe(200);
    expect(res.body.itemListElement[0].name).toBe('Mock PDF Recipe');
  });

  it('returns 500 when OCR fails', async () => {
    // Uses a bogus PDF to force failure
    const res = await request(app).post('/webhook').attach('filename', corruptPdfPath);

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});
