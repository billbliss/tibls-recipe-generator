import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

// Attempt to suppress noisy warnings from pdf-parse during tests
export default async () => {
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (args?.[0]?.includes?.('TT: undefined function')) return;
    originalWarn(...args);
  };
};
