/**
 * BRAHMA INTELLIGENCE — Nifty Regime Lambda
 * GET /nifty
 *
 * Fetches real ^NSEI data from Yahoo Finance.
 * Computes: SMA50, SMA200, ATR, 52-week position.
 * Detects market regime from real data — no hardcoded values.
 * Cached 15 minutes.
 */

'use strict';

const { fetchIndexData }  = require('./shared/yahoo');
const { cacheGet, cacheSet } = require('./shared/cache');
const { calcSMA, calcATR, calcRSI } = require('./shared/indicators');

/**
 * Detect regime from real Nifty data.
 * All conditions computed from real price vs real moving averages.
 */
function detectRegime(price, sma50, sma200, atr, rsi) {
  const volatility = atr ? atr / price : 0;

  if (volatility > 0.015) {
    return {
      regime: 'HIGH VOLATILITY',
      color: '#ef4444',
      emoji: '⚡',
      advice: 'Reduce position sizes 50%. Only STRONG BUY signals. Tighten stops.',
      positionMultiplier: 0.5,
      basis: `ATR/Price = ${(volatility * 100).toFixed(2)}% > 1.5% threshold`,
    };
  }
  if (sma50 && sma200) {
    if (price > sma50 && price > sma200 && sma50 > sma200) {
      return {
        regime: 'BULL MARKET',
        color: '#00ff87',
        emoji: '🐂',
        advice: 'Full position sizes. Ride momentum. Hold to Target 2.',
        positionMultiplier: 1.0,
        basis: `Price(${price}) > SMA50(${Math.round(sma50)}) > SMA200(${Math.round(sma200)}) — Golden Cross`,
      };
    }
    if (price < sma50 && price < sma200 && sma50 < sma200) {
      return {
        regime: 'BEAR MARKET',
        color: '#ef4444',
        emoji: '🐻',
        advice: 'Half positions only. Only STRONG BUY. Exit at Target 1.',
        positionMultiplier: 0.4,
        basis: `Price(${price}) < SMA50(${Math.round(sma50)}) < SMA200(${Math.round(sma200)}) — Death Cross`,
      };
    }
    if (price > sma200 && price < sma50) {
      return {
        regime: 'PULLBACK IN UPTREND',
        color: '#fbbf24',
        emoji: '📉',
        advice: 'Buying opportunity. Wait for bounce confirmation above SMA50.',
        positionMultiplier: 0.75,
        basis: `Price(${price}) below SMA50(${Math.round(sma50)}) but above SMA200(${Math.round(sma200)})`,
      };
    }
    if (price < sma200 && price > sma50) {
      return {
        regime: 'RELIEF RALLY IN DOWNTREND',
        color: '#fb923c',
        emoji: '📈',
        advice: 'Caution. Short-term bounce only. Take profits quickly.',
        positionMultiplier: 0.5,
        basis: `Price(${price}) above SMA50(${Math.round(sma50)}) but below SMA200(${Math.round(sma200)})`,
      };
    }
  }
  return {
    regime: 'SIDEWAYS',
    color: '#60a5fa',
    emoji: '↔️',
    advice: 'Range-bound market. Buy support, sell resistance. Smaller targets.',
    positionMultiplier: 0.65,
    basis: 'Mixed MA signals',
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

  const cacheKey = 'nifty:regime';
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ...cached, fromCache: true }),
    };
  }

  try {
    // Fetch 1 year of ^NSEI for SMA200
    const niftyData = await fetchIndexData('^NSEI', '1y');
    if (!niftyData) {
      throw new Error('Failed to fetch Nifty 50 data (^NSEI) from Yahoo Finance');
    }

    const closes = niftyData.bars.map(b => b.close);
    const highs  = niftyData.bars.map(b => b.high);
    const lows   = niftyData.bars.map(b => b.low);
    const n = closes.length;
    const price = niftyData.meta.currentPrice;
    const prev  = niftyData.meta.previousClose;

    const sma50  = calcSMA(closes, Math.min(50, n));
    const sma200 = n >= 200 ? calcSMA(closes, 200) : null;
    const atr    = calcATR(highs, lows, closes, 14);
    const rsi    = calcRSI(closes, 14);

    // 52-week range
    const high52w = Math.max(...closes.slice(-252 > -n ? -252 : -n));
    const low52w  = Math.min(...closes.slice(-252 > -n ? -252 : -n));
    const pos52w  = high52w > low52w
      ? Math.round((price - low52w) / (high52w - low52w) * 100) : 50;

    const regimeData = detectRegime(price, sma50, sma200, atr, rsi);
    const changePct  = prev
      ? Math.round((price - prev) / prev * 10000) / 100 : null;

    const result = {
      success: true,
      generatedAt: new Date().toISOString(),
      nifty: {
        price:        Math.round(price * 100) / 100,
        changePct,
        sma50:        sma50  ? Math.round(sma50  * 100) / 100 : null,
        sma200:       sma200 ? Math.round(sma200 * 100) / 100 : null,
        sma200note:   sma200 ? null : `SMA200 requires 200 days of data — only ${n} available`,
        atr:          atr   ? Math.round(atr    * 100) / 100 : null,
        rsi,
        high52w:      Math.round(high52w * 100) / 100,
        low52w:       Math.round(low52w  * 100) / 100,
        pos52w,
        dataPoints:   n,
      },
      regime: regimeData,
      dataSource: 'Yahoo Finance ^NSEI',
      fromCache: false,
    };

    await cacheSet(cacheKey, result, 900); // 15 minutes

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };

  } catch (err) {
    console.error('[NIFTY] Error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
