/**
 * BRAHMA INTELLIGENCE — Scan Lambda
 * GET /scan
 *
 * Reads today's Nifty 500 from S3 (populated by nifty500-fetcher at 6am IST).
 * Fetches all stocks in parallel batches.
 * Scores each with Brahma Score.
 * Returns top 10 + sector rankings.
 *
 * This Lambda is also invoked by pre-market-scan cron at 7:45am IST.
 * Results cached in Redis with 15-min TTL during market hours.
 *
 * SMA200 is computed ONLY when ≥200 days of data exist.
 * Stock universe comes ONLY from S3 (official Nifty 500 CSV).
 * NO hardcoded symbols.
 */

'use strict';

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { fetchMultipleStocks, fetchIndexData } = require('../shared/yahoo');
const { cacheGet, cacheSet } = require('../shared/cache');
const {
  calcSMA, calcEMA, calcRSI, calcMACD, calcStochastic,
  calcATR, calcCMF, volumeSignal, findSupportResistance,
  estimateTargetDays, calcBrahmaScore, scoreToSignal,
} = require('../shared/indicators');

const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
const BUCKET = process.env.UNIVERSE_BUCKET || 'brahma-universe';

// Real NSE sector indices — these are the official Yahoo Finance tickers
const SECTOR_INDICES = {
  Banking:  '^NSEBANK',
  IT:       '^CNXIT',
  Pharma:   '^CNXPHARMA',
  Auto:     '^CNXAUTO',
  Energy:   '^CNXENERGY',
  Finance:  '^CNXFIN',
  FMCG:     '^CNXFMCG',
  Infra:    '^CNXINFRA',
  Metal:    '^CNXMETAL',
  Realty:   '^CNXREALTY',
};

/**
 * Load Nifty 500 from S3.
 * Tries today's file first, falls back to latest.
 * Throws if neither found — scan cannot run without real stock universe.
 */
async function loadNifty500() {
  const today = new Date().toISOString().split('T')[0];

  // Try today's file first
  try {
    const response = await s3.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: `nifty500/nifty500_${today}.json`,
    }));
    const body = await response.Body.transformToString();
    return JSON.parse(body);
  } catch (e) {
    console.warn(`[SCAN] Today's Nifty 500 file not found (${today}), trying latest`);
  }

  // Fall back to latest
  const response = await s3.send(new GetObjectCommand({
    Bucket: BUCKET,
    Key: 'nifty500/nifty500_latest.json',
  }));
  const body = await response.Body.transformToString();
  const data = JSON.parse(body);
  console.log(`[SCAN] Using Nifty 500 from ${data.date} (latest available)`);
  return data;
}

/**
 * Compute Brahma Score for a stock from its 6mo data.
 * Uses SMA200 only if ≥200 days available (typically not on 6mo — noted).
 */
function scoreStock(stockData) {
  const { bars, meta, symbol } = stockData;
  const closes  = bars.map(b => b.close);
  const highs   = bars.map(b => b.high);
  const lows    = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume);
  const n = closes.length;
  const price = meta.currentPrice || closes[n - 1];

  const sma20   = calcSMA(closes, 20);
  const sma50   = calcSMA(closes, 50);
  const sma200  = n >= 200 ? calcSMA(closes, 200) : null; // honest: null on 6mo
  const ema9    = calcEMA(closes, 9);
  const ema21   = calcEMA(closes, 21);
  const rsi     = calcRSI(closes, 14);
  const macd    = calcMACD(closes);
  const stoch   = calcStochastic(highs, lows, closes, 14);
  const atr     = calcATR(highs, lows, closes, 14);
  const cmf     = calcCMF(highs, lows, closes, volumes, 20);
  const volSig  = volumeSignal(volumes);
  const sr      = findSupportResistance(highs, lows, closes);

  const w52pos  = (meta.high52w && meta.low52w && meta.high52w > meta.low52w)
    ? Math.round((price - meta.low52w) / (meta.high52w - meta.low52w) * 100)
    : null;

  const goldenCross = (sma50 && sma200) ? sma50 > sma200 : null;
  const nearSupport = sr.support1 ? Math.abs(price - sr.support1) / price < 0.03 : false;

  const scoreInput = {
    price, sma20, sma50, sma200, ema9, ema21, rsi, macd,
    stoch, volSignal: volSig, w52pos, goldenCross, nearSupport,
    cmf, aboveSma200: sma200 ? price > sma200 : null,
  };
  const score = calcBrahmaScore(scoreInput);

  const stopLoss = atr && sr.support1
    ? Math.round(Math.max(price - atr * 1.5, sr.support1 * 0.995) * 100) / 100
    : Math.round(price * 0.93 * 100) / 100;

  const target1Days = atr ? estimateTargetDays(price, sr.resistance1, atr) : null;

  return {
    symbol,
    name:      meta.longName,
    price,
    changePct: meta.previousClose
      ? Math.round((price - meta.previousClose) / meta.previousClose * 10000) / 100
      : null,
    score,
    signal: scoreToSignal(score),
    rsi,
    macd:    macd?.macd || null,
    atr:     atr ? Math.round(atr * 100) / 100 : null,
    sma20:   sma20  ? Math.round(sma20  * 100) / 100 : null,
    sma50:   sma50  ? Math.round(sma50  * 100) / 100 : null,
    sma200:  sma200 ? Math.round(sma200 * 100) / 100 : null,
    sma200note: sma200 ? null : 'SMA200 requires 200 days; 6mo scan has ~126 days',
    volSignal: volSig,
    cmf:     cmf !== null ? Math.round(cmf * 1000) / 1000 : null,
    stoch,
    sr,
    w52pos,
    goldenCross,
    stopLoss,
    target1:  sr.resistance1,
    target1Days,
    high52w: meta.high52w,
    low52w:  meta.low52w,
    scoreNote: 'Rule-based score, not backtest-optimised',
  };
}

/**
 * Score a sector index from its real data.
 */
function scoreSectorIndex(indexData) {
  if (!indexData) return null;
  const { bars, meta, ticker } = indexData;
  const closes = bars.map(b => b.close);
  const n = closes.length;
  const price = meta.currentPrice;
  const prev  = meta.previousClose;

  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, Math.min(50, n));
  const rsi   = calcRSI(closes, 14);

  const ret1w  = n >= 5  ? (price - closes[n - 6]) / closes[n - 6] * 100 : 0;
  const ret1m  = n >= 22 ? (price - closes[n - 23]) / closes[n - 23] * 100 : 0;

  // Real score from actual index data
  let score = 50;
  if (sma20 && price > sma20) score += 12;
  if (sma50 && price > sma50) score += 10;
  if (prev  && price > prev)  score += 8;
  if (ret1w > 0)              score += 6;
  if (ret1m > 0)              score += 6;
  if (rsi && rsi >= 50 && rsi <= 70) score += 5;
  if (ret1w < -2)             score -= 8;
  if (rsi && rsi > 75)        score -= 5;

  return {
    score:     Math.max(0, Math.min(100, score)),
    price:     Math.round(price * 100) / 100,
    changePct: prev ? Math.round((price - prev) / prev * 10000) / 100 : null,
    ret1w:     Math.round(ret1w * 100) / 100,
    ret1m:     Math.round(ret1m * 100) / 100,
    rsi,
    sma20:     sma20 ? Math.round(sma20 * 100) / 100 : null,
  };
}

// ── LAMBDA HANDLER ────────────────────────────────────────────────────────────

module.exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Check cache first
  const cacheKey = 'scan:top10';
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ...cached, fromCache: true }),
    };
  }

  try {
    // Step 1: Load Nifty 500 from S3 (or throw — no fallback to hardcoded list)
    console.log('[SCAN] Loading Nifty 500 from S3...');
    const universe = await loadNifty500();
    console.log(`[SCAN] Loaded ${universe.totalStocks} stocks from ${universe.date}`);

    // Step 2: Score all sector indices in parallel
    console.log('[SCAN] Scoring sector indices...');
    const sectorResults = await Promise.allSettled(
      Object.entries(SECTOR_INDICES).map(async ([name, ticker]) => {
        const data = await fetchIndexData(ticker, '3mo');
        const scored = data ? scoreSectorIndex({ ...data, ticker }) : null;
        return { name, ticker, ...scored };
      })
    );

    const sectorRankings = sectorResults
      .filter(r => r.status === 'fulfilled' && r.value && r.value.score !== undefined)
      .map(r => r.value)
      .sort((a, b) => b.score - a.score);

    const topSectors = sectorRankings.slice(0, 3).map(s => s.name);

    // Step 3: Get stocks from top 3 sectors + 3 from sectors 4 & 5
    const sectorData = universe.bySector || {};
    const candidates = [];
    topSectors.forEach(sector => {
      const stocks = sectorData[sector] || [];
      stocks.forEach(s => candidates.push({ ...s, sector }));
    });
    // Add a few from next 2 sectors for diversity
    sectorRankings.slice(3, 5).forEach(({ name }) => {
      const stocks = (sectorData[name] || []).slice(0, 5);
      stocks.forEach(s => candidates.push({ ...s, sector: name }));
    });

    if (candidates.length === 0) {
      throw new Error('No candidates found — sector data may be empty in S3');
    }

    console.log(`[SCAN] Scanning ${candidates.length} candidates from top sectors: ${topSectors.join(', ')}`);

    // Step 4: Fetch all candidates in parallel batches
    const symbols = candidates.map(c => c.symbol);
    const stockDataMap = await fetchMultipleStocks(symbols, '6mo', 25, 300);

    // Step 5: Score each stock
    const scored = [];
    for (const candidate of candidates) {
      const data = stockDataMap[candidate.symbol];
      if (!data) continue;
      try {
        const s = scoreStock({ ...data, symbol: candidate.symbol });
        if (s.score >= 35) {
          scored.push({ ...s, sector: candidate.sector });
        }
      } catch (_) { /* skip broken stocks */ }
    }

    scored.sort((a, b) => b.score - a.score);

    const top10 = scored.slice(0, 10);
    const top5  = scored.slice(0, 5);

    const result = {
      success: true,
      generatedAt:   new Date().toISOString(),
      universeDate:  universe.date,
      universeSource: universe.source,
      totalStocks:   universe.totalStocks,
      scannedCount:  candidates.length,
      qualifiedCount: scored.length,
      topSectors,
      sectorRankings,
      top10,
      top5,
      scoreNote: 'Brahma Score is rule-based, not backtest-optimised',
      sma200Note: '6-month scan cannot compute SMA200 (needs 200 days). SMA200 computed in full signal endpoint.',
      fromCache: false,
    };

    // Cache 15 minutes
    await cacheSet(cacheKey, result, 900);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };

  } catch (err) {
    console.error('[SCAN] Error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: err.message,
        hint: 'Ensure nifty500-fetcher cron has run today and S3 bucket exists',
      }),
    };
  }
};
