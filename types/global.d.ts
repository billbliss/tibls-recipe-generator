// Force TypeScript to load custom module shims for npm packages without type definitions.
//
// Normally, these would be discovered via `typeRoots`, but we removed `typeRoots`
// from tsconfig.json to make Vitest type resolution work correctly.
//
// This file is explicitly included in tsconfig.json via the `files` property
// so that both tsc and ts-node always see these module declarations.
/// <reference path="./json-diff.d.ts" />
/// <reference path="./pdf-parse.d.ts" />
