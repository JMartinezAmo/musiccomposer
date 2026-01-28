// ============================================
// PERSISTENCE - Dexie.js Database Schema
// Music Composer v1.1
// ============================================

import Dexie, { type Table } from 'dexie';
import type { Composition } from '../types/composition';
import type { Snapshot } from '../types/store';

/**
 * AI response cache entry
 */
export interface AICache {
  promptHash: string;
  response: string;
  createdAt: string;
}

/**
 * User preferences
 */
export interface Preference {
  key: string;
  value: unknown;
}

/**
 * Extended Snapshot with compositionId for IndexedDB relation
 */
export interface StoredSnapshot extends Snapshot {
  compositionId: string;
}

/**
 * MusicComposerDB - Main database class
 *
 * CAPA 1: IndexedDB (Dexie.js) - Datos Estructurados
 * - Composiciones
 * - Historial de snapshots
 * - Cache de respuestas IA
 * - Preferencias de usuario
 */
export class MusicComposerDB extends Dexie {
  compositions!: Table<Composition, string>;
  snapshots!: Table<StoredSnapshot, string>;
  aiCache!: Table<AICache, string>;
  preferences!: Table<Preference, string>;

  constructor() {
    super('MusicComposerDB');

    this.version(1).stores({
      // Primary key, indexed fields, multi-entry index for tags
      compositions: 'id, modifiedAt, title, *tags',
      snapshots: 'id, compositionId, createdAt',
      aiCache: 'promptHash, createdAt',
      preferences: 'key'
    });
  }
}

// Singleton database instance
export const db = new MusicComposerDB();

// ============================================
// CAPA 2: Cache API - Assets Grandes
// - Modelo LLM (~2GB)
// - SoundFont (~40MB)
// ============================================

const CACHE_NAME = 'music-composer-assets-v1';

/**
 * Cache a large asset (like LLM model or SoundFont)
 */
export async function cacheAsset(key: string, data: ArrayBuffer): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = new Response(data, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': data.byteLength.toString(),
      }
    });
    await cache.put(key, response);
  } catch (error) {
    console.warn('Failed to cache asset:', key, error);
    // Fallback: try localStorage for small items
    if (data.byteLength < 5 * 1024 * 1024) { // 5MB limit
      try {
        const base64 = arrayBufferToBase64(data);
        localStorage.setItem(`cache_${key}`, base64);
      } catch {
        // Storage full, silently fail
      }
    }
  }
}

/**
 * Retrieve a cached asset
 */
export async function getCachedAsset(key: string): Promise<ArrayBuffer | undefined> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(key);
    if (response) {
      return await response.arrayBuffer();
    }
  } catch (error) {
    console.warn('Failed to get cached asset:', key, error);
  }

  // Fallback: try localStorage
  try {
    const base64 = localStorage.getItem(`cache_${key}`);
    if (base64) {
      return base64ToArrayBuffer(base64);
    }
  } catch {
    // Not found
  }

  return undefined;
}

/**
 * Check if an asset is cached
 */
export async function isAssetCached(key: string): Promise<boolean> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(key);
    return response !== undefined;
  } catch {
    return false;
  }
}

/**
 * Clear cached asset
 */
export async function clearCachedAsset(key: string): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(key);
  } catch {
    // Ignore
  }
  try {
    localStorage.removeItem(`cache_${key}`);
  } catch {
    // Ignore
  }
}

/**
 * Get estimated storage usage
 */
export async function getStorageEstimate(): Promise<{
  usage: number;
  quota: number;
  percentUsed: number;
}> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    return {
      usage,
      quota,
      percentUsed: quota > 0 ? (usage / quota) * 100 : 0
    };
  }
  return { usage: 0, quota: 0, percentUsed: 0 };
}

// ============================================
// Helper Functions
// ============================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ============================================
// Composition CRUD Operations
// ============================================

/**
 * Get all compositions sorted by modification date
 */
export async function getAllCompositions(): Promise<Composition[]> {
  return db.compositions.orderBy('modifiedAt').reverse().toArray();
}

/**
 * Get a single composition by ID
 */
export async function getComposition(id: string): Promise<Composition | undefined> {
  return db.compositions.get(id);
}

/**
 * Save or update a composition
 */
export async function saveComposition(composition: Composition): Promise<void> {
  await db.compositions.put(composition);
}

/**
 * Delete a composition and its snapshots
 */
export async function deleteComposition(id: string): Promise<void> {
  await db.transaction('rw', [db.compositions, db.snapshots], async () => {
    await db.compositions.delete(id);
    await db.snapshots.where('compositionId').equals(id).delete();
  });
}

// ============================================
// Snapshot Operations
// ============================================

const MAX_SNAPSHOTS_PER_COMPOSITION = 20;

/**
 * Get all snapshots for a composition
 */
export async function getSnapshotsForComposition(compositionId: string): Promise<StoredSnapshot[]> {
  return db.snapshots
    .where('compositionId')
    .equals(compositionId)
    .sortBy('createdAt');
}

/**
 * Save a snapshot, enforcing the limit
 */
export async function saveSnapshot(snapshot: StoredSnapshot): Promise<void> {
  await db.transaction('rw', db.snapshots, async () => {
    await db.snapshots.add(snapshot);

    // Clean up old snapshots if exceeding limit
    const allSnapshots = await db.snapshots
      .where('compositionId')
      .equals(snapshot.compositionId)
      .sortBy('createdAt');

    if (allSnapshots.length > MAX_SNAPSHOTS_PER_COMPOSITION) {
      const toDelete = allSnapshots.slice(0, allSnapshots.length - MAX_SNAPSHOTS_PER_COMPOSITION);
      await db.snapshots.bulkDelete(toDelete.map(s => s.id));
    }
  });
}

/**
 * Delete a snapshot
 */
export async function deleteSnapshot(id: string): Promise<void> {
  await db.snapshots.delete(id);
}

// ============================================
// AI Cache Operations
// ============================================

/**
 * Simple hash function for prompt caching
 */
export function hashPrompt(prompt: string, context: string): string {
  const str = `${prompt}|${context}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

/**
 * Get cached AI response
 */
export async function getCachedAIResponse(promptHash: string): Promise<string | undefined> {
  const entry = await db.aiCache.get(promptHash);
  return entry?.response;
}

/**
 * Cache an AI response
 */
export async function cacheAIResponse(promptHash: string, response: string): Promise<void> {
  await db.aiCache.put({
    promptHash,
    response,
    createdAt: new Date().toISOString()
  });
}

/**
 * Clear old AI cache entries (older than 7 days)
 */
export async function cleanupAICache(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString();

  await db.aiCache
    .where('createdAt')
    .below(cutoffStr)
    .delete();
}

// ============================================
// Preferences Operations
// ============================================

/**
 * Get a preference value
 */
export async function getPreference<T>(key: string, defaultValue: T): Promise<T> {
  const pref = await db.preferences.get(key);
  return (pref?.value as T) ?? defaultValue;
}

/**
 * Set a preference value
 */
export async function setPreference<T>(key: string, value: T): Promise<void> {
  await db.preferences.put({ key, value });
}
