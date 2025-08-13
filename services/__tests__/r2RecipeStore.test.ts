// test/unit/r2RecipeStore.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  S3Client,
  GetObjectCommand,
  // PutObjectCommand, // not currently tested
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

const makeStream = (json: any, withTransform = true) => {
  const data = typeof json === 'string' ? json : JSON.stringify(json);
  const { Readable } = require('node:stream');
  const chunks = [withTransform ? data : Buffer.from(data)];
  const stream: any = Readable.from(chunks);
  if (withTransform) {
    stream.transformToString = async () => data;
  }
  return stream;
};

describe('R2RecipeStore', () => {
  let s3Mock: any;
  let R2RecipeStore: any;

  beforeEach(async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.R2_DEV_BUCKET = 'bucket';
    process.env.R2_DEV_ACCESS_KEY_ID = 'id';
    process.env.R2_DEV_SECRET_ACCESS_KEY = 'secret';
    process.env.R2_ENDPOINT = 'http://example.invalid';

    s3Mock = mockClient(S3Client).reset();

    // Default catalog mock
    s3Mock.on(GetObjectCommand).callsFake((input: any) => {
      const key = input?.Key;
      if (key === 'catalog.json') {
        return {
          Body: makeStream({
            lastUsedCollectionId: 'test-collection',
            collections: [{ id: 'test-collection' }]
          })
        };
      }
      const err: any = new Error('NoSuchKey');
      err.name = 'NoSuchKey';
      err.$metadata = { httpStatusCode: 404 };
      throw err;
    });

    R2RecipeStore = (await import('../../services/r2RecipeStore')).R2RecipeStore;
  });

  it('initialize() sets prefix from lastUsedCollectionId', async () => {
    const store = new R2RecipeStore(); // no override
    await store.initialize();
    expect(store['prefix']).toBe('collections/test-collection');
  });

  it('initialize() validates override exists', async () => {
    const store = new R2RecipeStore('test-collection');
    await store.initialize();
    expect(store['prefix']).toBe('collections/test-collection');
  });

  it('initialize() throws if override not in catalog', async () => {
    const store = new R2RecipeStore('missing');
    await expect(store.initialize()).rejects.toThrow(/does not exist/i);
  });

  it('loadJsonKey uses transformToString when present, else stream fallback', async () => {
    const store = new R2RecipeStore('test-collection');
    await store.initialize();

    // transformToString case
    s3Mock.on(GetObjectCommand).callsFake((input: any) => {
      if (input.Key === 'foo.json') return { Body: makeStream({ ok: 1 }, true) };
      return {
        Body: makeStream({
          lastUsedCollectionId: 'test-collection',
          collections: [{ id: 'test-collection' }]
        })
      };
    });
    const v1 = await store['loadJsonKey']('foo.json');
    expect(v1.ok).toBe(1);

    // streamToString fallback
    s3Mock.on(GetObjectCommand).callsFake((input: any) => {
      if (input.Key === 'bar.json') return { Body: makeStream({ ok: 2 }, false) };
      return {
        Body: makeStream({
          lastUsedCollectionId: 'test-collection',
          collections: [{ id: 'test-collection' }]
        })
      };
    });
    const v2 = await store['loadJsonKey']('bar.json');
    expect(v2.ok).toBe(2);
  });

  it('loadJsonKey returns null on 404 / NoSuchKey', async () => {
    const store = new R2RecipeStore('test-collection');
    await store.initialize();
    s3Mock.on(GetObjectCommand).callsFake((input: any) => {
      if (input.Key === 'x.json') {
        const err: any = new Error('NoSuchKey');
        err.name = 'NoSuchKey';
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      return {
        Body: makeStream({
          lastUsedCollectionId: 'test-collection',
          collections: [{ id: 'test-collection' }]
        })
      };
    });
    const v = await store['loadJsonKey']('x.json');
    expect(v).toBeNull();
  });

  it('loadRecipe normalizes keys and returns Tibls only if valid', async () => {
    const store = new R2RecipeStore('test-collection');
    await store.initialize();

    const tibls = {
      '@type': 'application/tibls+json',
      itemListElement: [
        {
          '@type': 'https://tibls.app/types/recipe',
          id: 'r',
          name: 'A',
          ingredients: [{ text: 'x', sectionHeader: '' }],
          steps: [{ text: 'y', sectionHeader: '' }]
        }
      ]
    };

    s3Mock.on(GetObjectCommand).callsFake((input: any) => {
      if (input.Key?.endsWith('/Recipe.json')) return { Body: makeStream(tibls) };
      return {
        Body: makeStream({
          lastUsedCollectionId: 'test-collection',
          collections: [{ id: 'test-collection' }]
        })
      };
    });

    expect(await store.loadRecipe('Recipe.json')).toBeTruthy();
    expect(await store.loadRecipe('/Recipe.json')).toBeTruthy();
    expect(await store.loadRecipe('collections/test-collection/Recipe.json')).toBeTruthy();

    // Invalid Tibls → null
    s3Mock.on(GetObjectCommand).callsFake((input: any) => {
      if (input.Key?.endsWith('/Recipe.json')) return { Body: makeStream({ not: 'tibls' }) };
      return {
        Body: makeStream({
          lastUsedCollectionId: 'test-collection',
          collections: [{ id: 'test-collection' }]
        })
      };
    });
    expect(await store.loadRecipe('Recipe.json')).toBeNull();
  });

  it('loadAllRecipes paginates, filters .json and maps', async () => {
    const store = new R2RecipeStore('test-collection');
    await store.initialize();

    s3Mock.on(ListObjectsV2Command).callsFake((input: any) => {
      if (!input?.ContinuationToken) {
        return {
          Contents: [
            { Key: 'collections/test-collection/RecipeA.json' },
            { Key: 'collections/test-collection/ignore.txt' }
          ],
          IsTruncated: true,
          NextContinuationToken: 't2'
        };
      }
      if (input.ContinuationToken === 't2') {
        return {
          Contents: [{ Key: 'collections/test-collection/RecipeB.json' }],
          IsTruncated: false
        };
      }
      // (optional) unexpected token → empty page
      return { Contents: [], IsTruncated: false };
    });

    // data for A/B
    s3Mock.on(GetObjectCommand).callsFake((input: any) => {
      const key = input.Key;
      if (key?.endsWith('RecipeA.json')) {
        return {
          Body: makeStream({
            '@type': 'application/tibls+json',
            itemListElement: [
              {
                '@type': 'https://tibls.app/types/recipe',
                id: 'ra',
                name: 'RecipeA',
                ingredients: [{ text: 'x', sectionHeader: '' }],
                steps: [{ text: 'y', sectionHeader: '' }]
              }
            ]
          })
        };
      }
      if (key?.endsWith('RecipeB.json')) {
        return {
          Body: makeStream({
            '@type': 'application/tibls+json',
            itemListElement: [
              {
                '@type': 'https://tibls.app/types/recipe',
                id: 'rb',
                name: 'RecipeB',
                ingredients: [{ text: 'x', sectionHeader: '' }],
                steps: [{ text: 'y', sectionHeader: '' }]
              }
            ]
          })
        };
      }
      return {
        Body: makeStream({
          lastUsedCollectionId: 'test-collection',
          collections: [{ id: 'test-collection' }]
        })
      };
    });

    const recs = await store.loadAllRecipes('http://base');

    // Basic shape check
    expect(Array.isArray(recs)).toBe(true);
    expect(recs.length).toBe(2);
  });

  it('saveRecipe short-circuits in NODE_ENV=test', async () => {
    const store = new R2RecipeStore('test-collection');
    await store.initialize();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const tibls = {
      '@type': 'application/tibls+json',
      itemListElement: [
        {
          '@type': 'https://tibls.app/types/recipe',
          id: 'r',
          name: 'ValidRecipe',
          ingredients: [{ text: 'x', sectionHeader: '' }],
          steps: [{ text: 'y', sectionHeader: '' }]
        }
      ]
    };
    const filename = await store.saveRecipe(tibls as any);
    expect(filename).toBe('ValidRecipe-01-Jan-2024.json');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('getEnvVar throws when missing', async () => {
    delete process.env.R2_DEV_ACCESS_KEY_ID;
    const ctor = () => new R2RecipeStore('test-collection');
    expect(ctor).toThrow(/R2_DEV_ACCESS_KEY_ID/);
  });

  it('touchCollectionUpdated() updates timestamp and saves (happy path)', async () => {
    const store = new R2RecipeStore('test-collection');

    const loadSpy = vi
      .spyOn(store as any, 'loadCollection')
      .mockResolvedValue({ name: 'Demo', updated: '2000-01-01T00:00:00.000Z' });
    const saveSpy = vi.spyOn(store as any, 'saveCollection').mockResolvedValue(undefined);

    // call private via bracket access
    await (store as any)['touchCollectionUpdated']();

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledTimes(1);

    // Verify updated field set to an ISO string and not the old value
    type Collection = { name: string; updated: string };
    const savedArg = saveSpy.mock.calls[0][0] as Collection;
    expect(typeof savedArg.updated).toBe('string');
    expect(() => new Date(savedArg.updated).toISOString()).not.toThrow();
    expect(savedArg.updated).not.toBe('2000-01-01T00:00:00.000Z');
  });

  it('touchCollectionUpdated() no-ops when collection is null', async () => {
    const store = new R2RecipeStore('test-collection');

    const loadSpy = vi.spyOn(store as any, 'loadCollection').mockResolvedValue(null);
    const saveSpy = vi.spyOn(store as any, 'saveCollection').mockResolvedValue(undefined);

    await (store as any)['touchCollectionUpdated']();

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('touchCollectionUpdated() catches errors and warns', async () => {
    const store = new R2RecipeStore('test-collection');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loadSpy = vi.spyOn(store as any, 'loadCollection').mockRejectedValue(new Error('boom'));
    const saveSpy = vi.spyOn(store as any, 'saveCollection');

    await (store as any)['touchCollectionUpdated']();

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();

    // Clean up
    warnSpy.mockRestore();
  });
});
