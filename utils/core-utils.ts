// File: utils/utility-functions.ts - Utility functions for Tibls Recipe Generator

import fs from 'fs';
import { createWriteStream } from 'fs';
import path from 'path';
import { Request } from 'express';
import axios from 'axios';

// Returns the base URL of the request, used for generating absolute URLs
// This is useful for generating links to uploaded files or viewer pages
// Example: if the request is made to http://localhost:3000/webhook, this function will return "http://localhost:3000"
// This function is used in the webhook handler to generate the URL for the uploaded file or viewer
export function getBaseUrl(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

// Utility function to pause execution for a given number of milliseconds
// This is useful for rate limiting or waiting for server responses
// Example: await sleep(1000); // pauses for 1 second
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Loads Google Cloud credentials from a base64-encoded source.
 * - In production: reads from process.env.GOOGLE_CLOUD_CREDENTIALS_BASE64
 * - In development: falls back to config/tibls-pdf-ocr-7d90a9009aac.base64
 * Writes the decoded JSON to /tmp/gvision-creds.json and sets GOOGLE_APPLICATION_CREDENTIALS.
 */
export function loadGoogleCredentialsFromBase64() {
  let b64 = process.env.GOOGLE_CLOUD_CREDENTIALS_BASE64;

  if (!b64 && process.env.NODE_ENV !== 'production') {
    if (!process.env.GOOGLE_CLOUD_CREDENTIALS_BASE64_FILE) {
      throw new Error('GOOGLE_CLOUD_CREDENTIALS_BASE64_FILE is not set in development mode');
    }
    const fallbackPath = path.join(
      __dirname,
      String(process.env.GOOGLE_CLOUD_CREDENTIALS_BASE64_FILE)
    );
    if (fs.existsSync(fallbackPath)) {
      b64 = fs.readFileSync(fallbackPath, 'utf8');
    }
  }

  if (!b64) {
    throw new Error(
      'Missing GOOGLE_CLOUD_CREDENTIALS_BASE64 and no fallback JSON file GOOGLE_CLOUD_CREDENTIALS_BASE64_FILE found.'
    );
  }

  const json = Buffer.from(b64, 'base64').toString('utf-8');
  const credPath = '/tmp/gvision-creds.json';
  fs.writeFileSync(credPath, json);

  process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
}

// Checks if a string is a valid URL
// This is used to validate URLs before processing them
// It uses the URL constructor to parse the string and checks if the protocol is http or https
// Returns true if the string is a valid URL, false otherwise
// Example: isUrl('https://example.com') returns true, isUrl('invalid-url') returns false
// Note: This function trims the input string before validation to handle leading/trailing whitespace
export function isUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Creates a simple logger that writes messages to a file and console
// This is useful for debugging and tracking the execution of the application
// The logger writes messages to a specified log file and also outputs them to the console
// Example usage:
// const logger = createLogger('app.log');
// logger.log('This is a log message');
// logger.close(); // Call this when done to close the file stream
export function createLogger(logFile = 'default-log.txt') {
  const logsDir = 'logs'; // Directory where log files will be stored, <project root>/logs
  fs.mkdirSync(logsDir, { recursive: true });

  const resolvedPath = path.isAbsolute(logFile) ? logFile : path.join(logsDir, logFile);

  const stream = createWriteStream(resolvedPath, { flags: 'a' });

  const log = (message: string) => {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${message}\n`;
    stream.write(entry);
    console.log(message);
  };

  const originalConsoleError = console.error;

  const error = (...args: any[]) => {
    const timestamp = new Date().toISOString();
    const message = args
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg, null, 2)))
      .join(' ');
    const entry = `[${timestamp}] ❌ ${message}\n`;
    stream.write(entry);
    originalConsoleError(...args);
  };

  const close = () => stream.end();

  console.error = error;

  return { log, error, close };
}

// Fetches from (or POSTs to) a URL with retry logic
// This function attempts to fetches a URL up to maxRetries times with exponential backoff
export async function fetchWithRetry(
  url: string,
  options: any = {},
  maxRetries = 3,
  initialDelay = 1000
): Promise<any> {
  let attempt = 0;
  let delay = initialDelay;

  while (attempt < maxRetries) {
    try {
      const response = await axios(url, options);
      return response;
    } catch (err: any) {
      attempt++;

      const status = err?.response?.status;
      const statusText = err?.response?.statusText;

      if (status) {
        console.error(
          `❌ Received ${status} ${statusText || ''} from ${url} on attempt ${attempt}`
        );
      } else {
        console.error(`❌ Exception on attempt ${attempt} fetching ${url}:`, err.message || err);
      }

      if (attempt >= maxRetries) throw err;

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}
