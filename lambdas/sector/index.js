/**
 * BRAHMA INTELLIGENCE — Sector Lambda
 * GET /sector
 *
 * Fetches all 10 real NSE sector indices from Yahoo Finance.
 * Computes real momentum scores.
 * Returns ranked sectors with real data.
 * Cached 15 minutes.
 */

'use strict';

const { fetchIndexData }       = require('../shared/yahoo');
const { cacheGet, cacheSet }   = require('../shared/cache');
const { calcSMA, calcRSI, calcATR } = require('../shared/indicators');

const SECTOR_INDICES = {
  Banking:  { ticker: '^NSEBANK',  description: 'Nifty Bank Index' },
  IT:       { ticker: '^CNXIT',    description: 'Nifty IT Index' },
  Pharma:   { ticker: '^CNXPHARMA',description: 'Nifty Pharma Index' },
  Auto:     { ticker: '^CNXAUTO',  description: 'Nifty Auto Index' },
  Energy:   { ticker: '^CNXENERGY',description: 'Nifty Energy Index' },
  Finance:  { ticker: '^CNXFIN',   description: 'Nifty Financial Services' },
  FMCG:     { ticker: '^CNXFMCG',  description: 'Nifty FMCG Index' },
  Infra:    { ticker: '^CNXINFRA', description: 'Nifty Infrastructure' },
  Metal:    { ticker: '^CNXMETAL', description: 'Nifty Metal Index' },
  Realty:   { ticker: '^CNXREALTY',description: 'Nifty Realty Index' },
};

function scoreSector(indexData, sectorName) {
  const { bars, meta } = indexData;
  const closes = bars.map(b => b.close);
  const highs  = bars.map(b => b.high);
  const lows   = bars.map(b => b.low);
  const n      = closes.length;
  const price  = meta.currentPrice;
  const prev   = meta.previousClose;

  const sma20  = calcSMA(closes, Math.min(20, n));
  const sma50  = calcSMA(closes, Math.min(50, n));
  const rsi    = calcRSI(closes, 14);
  const atr    = calcATR(highs, lows, closes, 14);

  // Returns over real time periods
  const ret1d = prev ? (price - prev) / prev * 100 : 0;
  const ret1w = n >= 5  ? (price - closes[n-6])  / closes[n-6]  * 100 : 0;
  const ret1m = n >= 22 ? (price - closes[n-23]) / closes[n-23] * 100 : 0;
  const ret3m = n >= 66 ? (price - closes[n-67]) / closes[n-67] * 100 : 0;

  // Score from real data only
  let score = 50;
  if (sma20 && price > sma20) score += 12;
  if (sma50 && price > sma50) score += 10;
  if (ret1d > 0)              score += 8;
  if (ret1w > 0)              score += 6;
  if (ret1m > 0)              score += 6;
  if (ret3m > 0)              score += 5;
  if (rsi && rsi >= 50 && rsi <= 70) score += 5;
  if (ret1w < -2)             score -= 8;
  if (ret1m < -5)             score -= 8;
  if (rsi && rsi > 75)        score -= 5;
  if (rsi && rsi < 35)        score -= 5;

  const momentum = ret1w > 2 ? 'Strong' : ret1w > 0 ? 'Positive' : ret1w > -2 ? 'Neutral' : 'Negative';

  return {
    sector:       sectorName,
    score:        Math.max(0, Math.min(100, score)),
    price:        Math.round(price * 100) / 100,
    changePct:    Math.round(ret1d * 100) / 100,
    ret1w:        Math.round(ret1w * 100) / 100,
    ret1m:        Math.round(ret1m * 100) / 100,
    ret3m:        Math.round(ret3m * 100) / 100,
    rsi,
    sma20:        sma20 ? Math.round(sma20 * 100) / 100 : null,
    sma50:        sma50 ? Math.round(sma50 * 100) / 100 : null,
    atr:          atr   ? Math.round(atr   * 100) / 100 : null,
    momentum,
    dataPoints:   n,
  };
}

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

  const cacheKey = 'sector:rankings';
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return { statusCode: 200, headers, body: JSON.stringify({ ...cached, fromCache: true }) };
  }

  try {
    const results = await Promise.allSettled(
      Object.entries(SECTOR_INDICES).map(async ([name, { ticker }]) => {
        const data = await fetchIndexData(ticker, '6mo');
        if (!data) return null;
        return scoreSector(data, name);
      })
    );

    const sectors = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value)
      .sort((a, b) => b.score - a.score);

    const result = {
      success: true,
      generatedAt: new Date().toISOString(),
      sectors,
      topSector:    sectors[0]?.sector || null,
      worstSector:  sectors[sectors.length - 1]?.sector || null,
      dataSource:   'Yahoo Finance NSE sector indices',
      scoreNote:    'Sector scores computed from real index price, SMA, RSI, and return data.',
      fromCache:    false,
    };

    await cacheSet(cacheKey, result, 900); // 15 minutes

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    console.error('[SECTOR] Error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
