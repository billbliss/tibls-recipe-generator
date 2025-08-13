import { beforeEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { mockClient } from 'aws-sdk-client-mock';

let app: any;
let s3Mock: any;
let GetObjectCommand: any;
let HeadObjectCommand: any;
let S3Client: any;
let HeadBucketCommand: any;
let ListObjectsV2Command: any;
let PutObjectCommand: any;
let ListBucketsCommand: any;
let GetBucketLocationCommand: any;

// Minimal helper to satisfy Node streaming body with transformToString
function sdkStreamFromString(json: string): any {
  const { Readable } = require('node:stream');
  const stream: any = Readable.from([json]);
  // Smithy mixin methods used by AWS SDK helpers
  stream.transformToString = async () => json;
  stream.transformToByteArray = async () => Buffer.from(json, 'utf-8');
  return stream;
}

beforeEach(async () => {
  vi.resetModules();

  // Force server.ts to choose the R2 store
  process.env.RECIPE_STORE_TYPE = 'r2';
  // Bucket/env don’t matter to the mock, but some code probes them:
  process.env.R2_BUCKET = process.env.R2_BUCKET || 'tibls-recipes-dev';
  process.env.R2_REGION = process.env.R2_REGION || 'auto';
  process.env.R2_ENDPOINT = process.env.R2_ENDPOINT || 'https://example.invalid';

  // BEFORE importing the server (so the stub is in place when the store is constructed)
  // Hardwire the R2RecipeStore recipeCollectionId for automated testing purposes
  const { R2RecipeStore } = await import('../../services/r2RecipeStore');
  vi.spyOn(R2RecipeStore.prototype, 'initialize').mockImplementation(async function (this: any) {
    // Bypass catalog.json + all S3 during init; make the store ready
    this.recipeCollectionId = 'test-collection';
    this.prefix = `collections/${this.recipeCollectionId}`;
    // no-op
  });

  ({
    GetObjectCommand,
    HeadObjectCommand,
    S3Client,
    HeadBucketCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    ListBucketsCommand,
    GetBucketLocationCommand
  } = await import('@aws-sdk/client-s3'));

  s3Mock = mockClient(S3Client);
  s3Mock.reset();

  // --- Minimal S3 mocks ---
  // Basic probes some SDKs do
  s3Mock.on(ListBucketsCommand).resolves({ Buckets: [{ Name: process.env.R2_BUCKET }] });
  s3Mock.on(GetBucketLocationCommand).resolves({});
  s3Mock.on(HeadBucketCommand).resolves({});
  s3Mock.on(PutObjectCommand).resolves({});
  if (HeadObjectCommand) s3Mock.on(HeadObjectCommand).resolves({});

  // Helpers
  const makeStream = (obj: any) => sdkStreamFromString(JSON.stringify(obj));
  const RECIPE_NAME = 'ValidRecipe-01-Jan-2024.json';

  // ListObjectsV2: return just the collection manifest and our recipe under whatever Prefix was asked for
  s3Mock.on(ListObjectsV2Command).callsFake((input: any) => {
    const prefix = (input?.Prefix || 'collections/test-collection').toString().replace(/\/+$/, '');
    return {
      Contents: [{ Key: `${prefix}/collection.json` }, { Key: `${prefix}/${RECIPE_NAME}` }],
      IsTruncated: false
    } as any;
  });

  // GetObject: serve catalog, collection, or the recipe, and 404 everything else
  s3Mock.on(GetObjectCommand).callsFake((input: any) => {
    const key = input?.Key as string | undefined;

    if (!key || key.endsWith('catalog.json')) {
      return {
        Body: makeStream({
          lastUsedCollectionId: 'test-collection',
          collections: [{ id: 'test-collection', name: 'Test Collection' }]
        })
      } as any;
    }

    if (/\/(collection)\.json$/.test(key)) {
      const prefix = key.replace(/\/(collection)\.json$/, '');
      const recipeFull = `${prefix}/${RECIPE_NAME}`;
      return {
        Body: makeStream({
          id: prefix.split('/').pop(),
          name: 'Test Collection',
          updated: 1,
          items: [RECIPE_NAME, recipeFull, { key: recipeFull, name: 'ValidRecipe' }],
          files: [{ key: recipeFull, name: 'ValidRecipe' }, RECIPE_NAME],
          recipes: [RECIPE_NAME]
        })
      } as any;
    }

    if (key.endsWith(`/${RECIPE_NAME}`) || key === RECIPE_NAME) {
      return {
        Body: makeStream({
          '@type': 'application/tibls+json',
          itemListElement: [
            {
              '@type': 'https://tibls.app/types/recipe',
              id: 'r1',
              name: 'ValidRecipe',
              ingredients: [{ text: '1 cup flour', sectionHeader: '' }],
              steps: [{ text: 'Mix.', sectionHeader: '' }]
            }
          ]
        })
      } as any;
    }

    const err: any = new Error('NoSuchKey');
    err.name = 'NoSuchKey';
    err.$metadata = { httpStatusCode: 404 };
    throw err;
  });

  // Import AFTER mocks so store initialization hits the mock
  ({ app } = await import('../../server')) as any;

  // Optional: dump routes (handy when debugging)
  // const routes: string[] = [];
  // app._router?.stack?.forEach((layer: any) => {
  //   if (layer.route?.path) {
  //     const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
  //     routes.push(`${methods} ${layer.route.path}`);
  //   }
  // });
  // console.log('ROUTES:\n' + routes.join('\n'));
});

describe('R2 store webhook tests', () => {
  it('fetches ValidRecipe JSON file and verifies its content', async () => {
    // Use agent so any server-side state (cookies/session) persists
    const agent = request.agent(app);

    // // Simulate UI selecting the collection (if the server uses that to resolve prefix)
    await agent.get('/recipe-collection/test-collection');

    // Now request the recipe by basename (server/Store decides full key using its prefix)
    const res = await agent
      .get(`/recipe-file/${encodeURIComponent('ValidRecipe-01-Jan-2024.json')}`)
      .timeout({ response: 3000, deadline: 5000 });

    if (res.status !== 200) {
      console.log('STATUS:', res.status, 'TEXT:', res.text);
    }

    expect(res.status).toBe(200);
    expect(res.type).toMatch(/json/);
    expect(res.body?.itemListElement?.[0]?.name).toEqual('ValidRecipe');
  });
});
