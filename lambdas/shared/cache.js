/**
 * BRAHMA INTELLIGENCE — Redis Cache Helper
 * Uses ioredis. Connection string from environment variable REDIS_URL.
 * Connection is module-level singleton — reused across warm Lambda invocations.
 */

'use strict';

const Redis = require('ioredis');

let client = null;

function getClient() {
  if (client && client.status === 'ready') return client;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('[CACHE] REDIS_URL not set — running without cache');
    return null;
  }

  client = new Redis(redisUrl, {
    tls: { rejectUnauthorized: false }, // ElastiCache in-transit encryption
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: false,
    connectTimeout: 3000,
  });

  client.on('error', (err) => {
    console.error('[CACHE] Redis error:', err.message);
  });

  return client;
}

/**
 * Get a cached value. Returns parsed JSON or null on miss/error.
 */
async function cacheGet(key) {
  const redis = getClient();
  if (!redis) return null;
  try {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    console.warn(`[CACHE] GET failed for ${key}:`, err.message);
    return null;
  }
}

/**
 * Set a cached value with TTL in seconds.
 */
async function cacheSet(key, value, ttlSeconds) {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    console.warn(`[CACHE] SET failed for ${key}:`, err.message);
  }
}

/**
 * Add symbol to the hot_stocks set (for demand-driven refresh).
 */
async function addHotStock(symbol) {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.sadd('hot_stocks', symbol);
    // Set expiry on the set at midnight IST (UTC+5:30 = 18:30 UTC)
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(18, 30, 0, 0);
    if (midnight <= now) midnight.setUTCDate(midnight.getUTCDate() + 1);
    const ttl = Math.floor((midnight - now) / 1000);
    await redis.expire('hot_stocks', ttl);
  } catch (_) { /* non-critical */ }
}

/**
 * Get all hot stocks searched today.
 */
async function getHotStocks() {
  const redis = getClient();
  if (!redis) return [];
  try {
    return await redis.smembers('hot_stocks');
  } catch (_) {
    return [];
  }
}

module.exports = { cacheGet, cacheSet, addHotStock, getHotStocks };
