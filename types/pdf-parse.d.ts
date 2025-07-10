// types/pdf-parse.d.ts
// There's no NPM package for pdf-parse types, so we need to declare the types ourselves.

declare module 'pdf-parse' {
  import { Buffer } from 'buffer';

  interface PDFInfo {
    numpages: number;
    numrender: number;
    info: Record<string, any>;
    metadata: any;
    text: string;
    version: string;
  }

  interface PDFParseOptions {
    max?: number;
    version?: string;
    pagerender?: (pageData: any) => string;
  }

  function pdf(dataBuffer: Buffer | Uint8Array, options?: PDFParseOptions): Promise<PDFInfo>;

  export = pdf;
}