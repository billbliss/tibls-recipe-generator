import * as fs from 'fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePdfFile } from '../pdfService';
import * as fileUtils from '../../utils/file-utils';

// Mock fs (no real file I/O)
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => Buffer.from('fakeimage'))
  };
});

// Mock file-utils functions
vi.mock('../../utils/file-utils', () => ({
  extractTextFromPdf: vi.fn(),
  extractEmbeddedImageFromPdf: vi.fn()
}));

// Mock ImageMagick execFileAsync via util.promisify
vi.mock('util', () => {
  const actual = vi.importActual<typeof import('util')>('util');
  return {
    ...actual,
    promisify: () => vi.fn().mockImplementation(() => Promise.resolve())
  };
});

const mockTextDetection = vi.fn().mockResolvedValue([
  {
    textAnnotations: [{ description: 'OCR extracted text\n' }]
  }
]);

vi.mock('@google-cloud/vision', () => ({
  __esModule: true,
  default: {
    ImageAnnotatorClient: vi.fn(() => ({
      textDetection: mockTextDetection
    }))
  }
}));

describe('handlePdfFile', () => {
  const baseUrl = 'http://localhost:3000';
  const fakePdfBuffer = Buffer.from('%PDF-1.4\nfakepdf');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns text & ogImageUrl when PDF has significant text and an embedded image', async () => {
    vi.mocked(fileUtils.extractTextFromPdf).mockResolvedValue(
      'This is a very long fake PDF text that exceeds the threshold...'
    );
    vi.mocked(fileUtils.extractEmbeddedImageFromPdf).mockResolvedValue(
      'http://localhost/image.jpg'
    );

    const result = await handlePdfFile(fakePdfBuffer, baseUrl);

    expect(result.text).toMatch(/very long fake PDF/);
    expect(result.ogImageUrl).toBe('http://localhost/image.jpg');
  });

  it('returns text with ogImageUrl = null when PDF has significant text but no image', async () => {
    vi.mocked(fileUtils.extractTextFromPdf).mockResolvedValue(
      'This is another long PDF text with enough characters to pass threshold'
    );
    vi.mocked(fileUtils.extractEmbeddedImageFromPdf).mockResolvedValue(null);

    const result = await handlePdfFile(fakePdfBuffer, baseUrl);

    expect(result.text).toMatch(/enough characters/);
    expect(result.ogImageUrl).toBeNull();
  });

  it('falls back to OCR if PDF has insufficient text', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345);
    require('fs').writeFileSync('/tmp/page1-12345.png', 'fakeimage');

    // Mock short text to force OCR path
    vi.mocked(fileUtils.extractTextFromPdf).mockResolvedValue('short');

    mockTextDetection.mockResolvedValue([
      {
        textAnnotations: [{ description: 'OCR extracted text' }]
      }
    ]);

    vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('fakeimage'));

    const result = await handlePdfFile(fakePdfBuffer, baseUrl);

    expect(result.text).toBe('OCR extracted text');
    expect(result.ogImageUrl).toBeUndefined();
  });

  it('throws if OCR returns no text', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345);
    require('fs').writeFileSync('/tmp/page1-12345.png', 'fakeimage');

    vi.mocked(fileUtils.extractTextFromPdf).mockResolvedValue('short');

    mockTextDetection.mockResolvedValue([
      {
        textAnnotations: []
      }
    ]);

    vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('fakeimage'));
    await expect(handlePdfFile(fakePdfBuffer, baseUrl)).rejects.toThrow(
      /No text detected in the provided image/
    );
  });
});
