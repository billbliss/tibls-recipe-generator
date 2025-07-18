import { describe, it, expect } from 'vitest';
import vision from '@google-cloud/vision';
import { loadGoogleCredentialsFromBase64 } from '../../utils/core-utils';

describe('Google Vision credentials sanity check', () => {
  it('initializes the Vision client and retrieves project ID', async () => {
    // Load credentials from environment/base64
    loadGoogleCredentialsFromBase64();

    const client = new vision.ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });

    // This will make a quick call to Google's IAM API to validate credentials
    const projectId = await client.getProjectId();
    expect(typeof projectId).toBe('string');
    expect(projectId.length).toBeGreaterThan(0);
  });
});
