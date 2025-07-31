import { describe, it, expect, vi } from 'vitest';
import {
  getBaseUrl,
  sleep,
  isUrl,
  fetchWithRetry,
  loadGoogleCredentialsFromBase64
} from '../core-utils';
import axios from 'axios';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

afterEach(() => {
  vi.resetAllMocks();
});

describe('core-utils', () => {
  describe('getBaseUrl', () => {
    it('returns base URL from request object', () => {
      const mockReq = {
        protocol: 'https',
        get: (header: string) => (header === 'host' ? 'example.com' : '')
      } as any;

      const result = getBaseUrl(mockReq);
      expect(result).toBe('https://example.com');
    });
  });

  describe('sleep', () => {
    it('waits at least the specified time', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(50);
    });
  });

  describe('isUrl', () => {
    it('detects valid URLs', () => {
      expect(isUrl('https://example.com')).toBe(true);
      expect(isUrl('http://example.com')).toBe(true);
      expect(isUrl('ftp://example.com')).toBe(false);
    });

    it('rejects invalid URLs', () => {
      expect(isUrl('just-a-string')).toBe(false);
      expect(isUrl('')).toBe(false);
      expect(isUrl('   ')).toBe(false);
    });
  });
});

describe('fetchWithRetry', () => {
  it('succeeds on first try', async () => {
    mockedAxios.mockResolvedValue({ data: 'ok' });

    const result = await fetchWithRetry('http://example.com', {}, 3);
    expect(result.data).toBe('ok');
    expect(mockedAxios).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    mockedAxios.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce({ data: 'success' });

    const result = await fetchWithRetry('http://example.com', {}, 2);
    expect(result.data).toBe('success');
    expect(mockedAxios).toHaveBeenCalledTimes(2);
  });
});

describe('loadGoogleCredentialsFromBase64', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('writes decoded credentials to tmp and returns path', async () => {
    const creds = { client_email: 'test@example.com', private_key: 'abc' };
    const encoded = Buffer.from(JSON.stringify(creds)).toString('base64');
    process.env.GOOGLE_CLOUD_CREDENTIALS_BASE64 = encoded;

    const path = await loadGoogleCredentialsFromBase64();
    expect(path).toBeDefined();
    expect(path).toContain('tmp/gvision-creds.json');
  });
});
