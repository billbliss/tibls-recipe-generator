// types/json-diff.d.ts
declare module 'json-diff' {
  export function diff(
    lhs: any,
    rhs: any,
    options?: {
      color?: boolean;
      full?: boolean;
      keysOnly?: boolean;
      outputKeys?: boolean;
    }
  ): string | null;

  export function diffString(
    lhs: any,
    rhs: any,
    options?: {
      color?: boolean;
      full?: boolean;
      keysOnly?: boolean;
      outputKeys?: boolean;
    }
  ): string;

  export function diffPatch(lhs: any, rhs: any): any;
}