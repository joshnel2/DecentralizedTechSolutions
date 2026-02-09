/**
 * Tests for the in-memory TTL cache utility.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCache } from '../utils/cache.js';

describe('TTL Cache', () => {
  let cache;

  beforeEach(() => {
    cache = createCache({ ttlMs: 1000, maxSize: 5 });
  });

  it('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return undefined for missing keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('should return undefined for expired entries', async () => {
    const shortCache = createCache({ ttlMs: 50 });
    shortCache.set('key', 'value');
    expect(shortCache.get('key')).toBe('value');

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(shortCache.get('key')).toBeUndefined();
  });

  it('should evict oldest entries when maxSize is reached', () => {
    for (let i = 0; i < 6; i++) {
      cache.set(`key${i}`, `value${i}`);
    }
    // First entry should have been evicted (maxSize=5)
    expect(cache.get('key0')).toBeUndefined();
    expect(cache.get('key5')).toBe('value5');
    expect(cache.size).toBe(5);
  });

  it('should delete specific keys', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.delete('key1');
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBe('value2');
  });

  it('should invalidate by prefix', () => {
    cache.set('matters:firm1:user1', [1, 2, 3]);
    cache.set('matters:firm1:user2', [4, 5]);
    cache.set('documents:firm1:user1', [6]);
    cache.invalidatePrefix('matters:firm1');
    expect(cache.get('matters:firm1:user1')).toBeUndefined();
    expect(cache.get('matters:firm1:user2')).toBeUndefined();
    expect(cache.get('documents:firm1:user1')).toEqual([6]);
  });

  it('should clear all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('should handle complex objects', () => {
    const obj = { hasAccess: true, matterIds: ['uuid1', 'uuid2'], nested: { foo: 'bar' } };
    cache.set('complex', obj);
    expect(cache.get('complex')).toEqual(obj);
  });
});
