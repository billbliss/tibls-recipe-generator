// test/setup/s3.mock.ts
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import type { SdkStreamMixin } from '@smithy/types';

function sdkStreamFromString(json: string): Readable & SdkStreamMixin {
  const stream = Readable.from([json]) as Readable & Partial<SdkStreamMixin>;
  (stream as any).transformToString = async () => json;
  (stream as any).transformToByteArray = async () => Buffer.from(json, 'utf-8');
  (stream as any).transformToWebStream = () => undefined as any;
  return stream as Readable & SdkStreamMixin;
}

// single mock instance across tests
export const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();

  s3Mock.on(GetObjectCommand, { Key: 'catalog.json' }).resolves({
    Body: sdkStreamFromString(
      JSON.stringify({
        lastUsedCollectionId: 'test-collection',
        collections: [{ id: 'test-collection', name: 'Test Collection' }]
      })
    )
  });

  s3Mock.on(GetObjectCommand, { Key: 'collections/test-collection/collection.json' }).resolves({
    Body: sdkStreamFromString(
      JSON.stringify({ id: 'test-collection', name: 'Test Collection', updated: 1 })
    )
  });

  s3Mock
    .on(GetObjectCommand, { Key: 'collections/test-collection/ValidRecipe-01-Jan-2024.json' })
    .resolves({
      Body: sdkStreamFromString(
        JSON.stringify({
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
      )
    });

  // writes succeed
  s3Mock.on(PutObjectCommand).resolves({});

  // If we missed mocking something, fail fast with a clear error.
  s3Mock.onAnyCommand().rejects(new Error('Unexpected S3 command (not mocked)'));
});
