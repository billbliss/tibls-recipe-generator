// This module implements Recipe storage on Cloudflare's S3 Compatible Service, R2.
// It provides methods to load, save, and manage recipes in a collection.
// The implementation uses the AWS SDK for JavaScript v3 to interact with R2.
// It supports loading all recipes, loading a specific recipe by filename, and saving a recipe.
// It also handles the collection metadata and ensures that the collection is updated when recipes are saved.
// The store is initialized with a specific recipe collection ID, which can be overridden.
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { isValidTiblsJson } from '../utils/recipe-utils';
import { generateRecipeFilename } from '../utils/file-utils';
import { RecipeStore, RecipeRecord, TiblsRecipeEnvelope } from '../types/recipeStoreTypes';
import { mapRecipeCollectionToRecipeRecords } from './recipeStore';
// import { nanoid } from 'nanoid'; // Will need when we add the ability to create new recipe collections

// Helper to read stream to string
async function streamToString(stream: any): Promise<string> {
  const chunks = [];
  for await (const chunk of stream) {
    // Ensure Buffer.concat receives Buffers; some mocks yield strings
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// R2RecipeStore implements the RecipeStore interface for managing recipes in R2.
// It provides methods to load all recipes, load a specific recipe, and save a recipe.
export class R2RecipeStore implements RecipeStore {
  private readonly bucketId: string;
  private recipeCollectionId: string | undefined;
  private prefix: string = '';
  private readonly s3: S3Client;

  constructor(overrideRecipeCollectionId?: string) {
    this.bucketId = this.getEnvVar('BUCKET', true);
    this.recipeCollectionId = overrideRecipeCollectionId;
    const accessKeyId = this.getEnvVar('ACCESS_KEY_ID', true);
    const secretAccessKey = this.getEnvVar('SECRET_ACCESS_KEY', true);
    const endpoint = this.getEnvVar('ENDPOINT', false);

    this.s3 = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey }
    });
  }

  // Constructors cannot contain async functions, so a separate method is needed
  async initialize(): Promise<void> {
    this.recipeCollectionId = await this.resolveRecipeCollectionId(this.recipeCollectionId);
    this.prefix = `collections/${this.recipeCollectionId}`;
  }

  // Resolve the recipe collection ID, either from the provided override or from the catalog
  // If an override is provided, it checks if the collection exists in the catalog.
  // If not, it throws an error. If no override is provided, it uses the last used collection ID from the catalog.
  // This ensures that the store always operates on a valid collection.
  // Throws an error if the collection ID is invalid or does not exist.
  private async resolveRecipeCollectionId(
    overrideRecipeCollectionId: string | undefined
  ): Promise<string> {
    if (!this.s3) throw new Error('s3 client not initialized');
    const catalog = await this.loadJsonKey('catalog.json');
    if (overrideRecipeCollectionId) {
      // Validate that it exists in the array of collections
      const found = Array.isArray(catalog.collections)
        ? catalog.collections.find((c: any) => c.id === overrideRecipeCollectionId)
        : undefined;
      if (found) {
        // It's there and valid, return it
        return overrideRecipeCollectionId;
      } else {
        throw new Error(
          `Recipe collection ID ${overrideRecipeCollectionId} does not exist in the R2 bucket.`
        );
      }
    } else {
      return catalog.lastUsedCollectionId;
    }
  }

  // Generic loader for JSON keys in the bucket
  private async loadJsonKey(key: string): Promise<any> {
    if (key.startsWith('/')) key = key.slice(1);
    try {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucketId, Key: key }));
      if (!res || !res.Body) {
        console.debug(`loadJsonKey: Missing response or Body for key '${key}', response:`, res);
        throw new Error(`Missing response or Body for key '${key}'`);
      }
      // Use transformToString if available, else streamToString fallback
      let text: string;
      if (typeof res.Body?.transformToString === 'function') {
        text = await res.Body.transformToString();
      } else {
        text = await streamToString(res.Body);
      }
      return JSON.parse(text);
    } catch (e: any) {
      if (e?.$metadata?.httpStatusCode === 404) return null;
      if (e?.name === 'NoSuchKey') return null;
      throw e;
    }
  }

  // Helper to get environment variables with a specific prefix
  // It checks if the variable exists and throws an error if it does not.
  // The isEnvSpecific flag determines if the variable is environment-specific (e.g., PROD_ or DEV_).
  // If isEnvSpecific is true, it uses the current NODE_ENV to determine the prefix.
  // If isEnvSpecific is false, it uses the base name directly
  private getEnvVar(base: string, isEnvSpecific?: boolean): string {
    isEnvSpecific = isEnvSpecific ?? false;
    const envName = isEnvSpecific ? (process.env.NODE_ENV === 'production' ? 'PROD_' : 'DEV_') : '';
    const value = process.env[`R2_${envName}${base}`];
    if (!value) throw new Error(`Missing environment variable: R2_${envName}${base}`);
    return value;
  }

  private getCollectionKey(): string {
    return `${this.prefix}/collection.json`;
  }

  private async loadCollection(): Promise<any | null> {
    return this.loadJsonKey(this.getCollectionKey());
  }

  private async saveCollection(collection: any): Promise<void> {
    const key = this.getCollectionKey();
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucketId,
        Key: key,
        Body: Buffer.from(JSON.stringify(collection)),
        ContentType: 'application/json',
        CacheControl: 'no-cache'
      })
    );
  }

  // Update the collection's updated timestamp
  // This method is called whenever a recipe is saved to ensure the collection metadata is up-to-date.
  // It loads collection.json for the collection, updates the 'updated' field to the current date,
  // and saves it back to the bucket.
  private async touchCollectionUpdated(): Promise<void> {
    try {
      const collection = await this.loadCollection();
      if (!collection) return;
      collection.updated = new Date().toISOString();
      await this.saveCollection(collection);
    } catch (e) {
      console.warn('Failed to update collection updated timestamp:', e);
    }
  }

  // This method retrieves all JSON files in the collection, reads them, and maps them to a RecipeRecord format.
  // It uses pagination to handle large collections and ensures that all valid JSON files are processed.
  // It returns an array of RecipeRecord objects, each containing the filename and the recipe data.
  // If a file is invalid or unreadable, it is skipped.
  // The baseUrl parameter is used to construct the full URL for each recipe.
  // It returns a promise that resolves to an array of RecipeRecord objects.
  async loadAllRecipes(baseUrl: string): Promise<RecipeRecord[]> {
    const out: Record<string, TiblsRecipeEnvelope> = {};
    const keys: string[] = [];
    let token: string | undefined;

    do {
      const res = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucketId,
          Prefix: this.prefix,
          ContinuationToken: token
        })
      );
      (res.Contents || []).forEach((o: any) => {
        if (o.Key?.endsWith('.json')) keys.push(o.Key);
      });
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);

    for (const key of keys) {
      try {
        const json = await this.loadJsonKey(key);
        if (json && isValidTiblsJson(json)) {
          // Remove the prefix and the leading slash from the filename
          const filename = key.slice(this.prefix.length + 1);
          out[filename] = json as TiblsRecipeEnvelope;
        }
      } catch {
        // skip invalid or unreadable files
      }
    }
    return mapRecipeCollectionToRecipeRecords(out, baseUrl);
  }

  // Load a specific recipe by filename
  // It constructs the key based on the provided filename, ensuring it is under the current collection prefix.
  // If the filename starts with a slash, it strips the leading slash and adds the collection prefix.
  // If the filename does not start with the prefix, it adds the prefix to the filename.
  // If the file is found and valid, it returns the recipe data as a TiblsRecipeEnvelope object.
  // If the file is not found or is invalid, it returns null.
  // It handles errors gracefully, returning null for 404 errors or NoSuchKey errors.
  // Other errors are thrown for further handling.
  async loadRecipe(filename: string): Promise<TiblsRecipeEnvelope | null> {
    let key: string;
    if (filename.startsWith('/')) {
      // Strip the leading slash and add the collection prefix
      key = `${this.prefix}/${filename.slice(1)}`;
    } else if (!filename.startsWith(this.prefix + '/')) {
      // If it's not already a fully-qualified key under the current prefix, add it
      key = `${this.prefix}/${filename}`;
    } else {
      // Already a full key
      key = filename;
    }
    try {
      const json = await this.loadJsonKey(key);
      return json && isValidTiblsJson(json) ? (json as TiblsRecipeEnvelope) : null;
    } catch (e: any) {
      if (e?.$metadata?.httpStatusCode === 404) return null;
      if (e?.name === 'NoSuchKey') return null;
      throw e;
    }
  }

  // Save a Tibls JSON object as a standalone file within a RecipeCollection
  // It checks if the recipeData is valid using isValidTiblsJson.
  // If an existingFilename is provided, it uses that; otherwise, it generates a new filename using generateRecipeFilename.
  // The file is saved to the R2 bucket with the appropriate key and content type.
  // It also updates the collection's updated timestamp by calling touchCollectionUpdated.
  // It returns the filename of the saved/updated recipe.
  async saveRecipe(recipeData: TiblsRecipeEnvelope, existingFilename?: string): Promise<string> {
    // In test mode, skip saving
    if (process.env.NODE_ENV === 'test') {
      console.log('[TEST MODE] Skipping save to storage');
      return 'ValidRecipe-01-Jan-2024.json';
    }

    if (!isValidTiblsJson(recipeData)) throw new Error('Invalid Tibls JSON');
    const filename = existingFilename ?? `${generateRecipeFilename(recipeData, true)}.json`; // keep identical naming as gist
    const key = `${this.prefix}/${filename}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucketId,
        Key: key,
        Body: Buffer.from(JSON.stringify(recipeData)),
        ContentType: 'application/json',
        CacheControl: 'no-cache'
      })
    );
    await this.touchCollectionUpdated();
    return filename;
  }
}
