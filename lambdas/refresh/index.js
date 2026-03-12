/**
 * BRAHMA INTELLIGENCE — Stock Refresh Lambda
 * Runs every 5 minutes via EventBridge Scheduler.
 *
 * Reads the hot_stocks set from Redis (stocks users have searched today).
 * Re-fetches and re-scores all of them in parallel.
 * Updates Redis cache.
 *
 * This is the demand-driven caching strategy:
 * - No pre-computing for stocks nobody searches
 * - Stocks users actually search stay fresh every 5 minutes
 * - hot_stocks set resets at midnight IST
 */

'use strict';

const { fetchStockData }   = require('../shared/yahoo');
const { cacheGet, cacheSet, getHotStocks } = require('../shared/cache');
const {
  calcSMA, calcEMA, calcRSI, calcMACD, calcStochastic,
  calcATR, calcBollingerBands, calcOBV, calcCMF,
  volumeSignal, findSupportResistance,
  estimateTargetDays, calcBrahmaScore, scoreToSignal,
} = require('../shared/indicators');

function computeIndicators(stockData) {
  const { bars, meta, symbol } = stockData;
  const closes  = bars.map(b => b.close);
  const highs   = bars.map(b => b.high);
  const lows    = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume);
  const n = closes.length;
  const price = meta.currentPrice || closes[n - 1];

  const sma20  = calcSMA(closes, 20);
  const sma50  = calcSMA(closes, 50);
  const sma200 = n >= 200 ? calcSMA(closes, 200) : null;
  const ema9   = calcEMA(closes, 9);
  const ema21  = calcEMA(closes, 21);
  const rsi    = calcRSI(closes, 14);
  const macd   = calcMACD(closes);
  const stoch  = calcStochastic(highs, lows, closes, 14);
  const atr    = calcATR(highs, lows, closes, 14);
  const bb     = calcBollingerBands(closes, 20, 2);
  const cmf    = calcCMF(highs, lows, closes, volumes, 20);
  const volSig = volumeSignal(volumes);
  const sr     = findSupportResistance(highs, lows, closes);

  const w52pos = (meta.high52w && meta.low52w)
    ? Math.round((price - meta.low52w) / (meta.high52w - meta.low52w) * 100) : null;
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
    : null;
  const target1Days = atr ? estimateTargetDays(price, sr.resistance1, atr) : null;

  return {
    symbol,
    price,
    changePct: meta.previousClose
      ? Math.round((price - meta.previousClose) / meta.previousClose * 10000) / 100 : null,
    score,
    signal: scoreToSignal(score),
    rsi, macd, stoch, atr: atr ? Math.round(atr * 100) / 100 : null,
    sma20, sma50, sma200, ema9, ema21, bb, cmf, volSignal: volSig,
    sr, w52pos, goldenCross, stopLoss,
    target1: sr.resistance1, target1Days,
    longName: meta.longName,
    earningsDate: meta.earningsDate,
    daysToEarnings: meta.daysToEarnings,
    refreshedAt: new Date().toISOString(),
    sma200note: sma200 ? null : `SMA200 requires 200 days, only ${n} available`,
  };
}

module.exports.handler = async (event) => {
  console.log('[REFRESH] Starting at', new Date().toISOString());

  try {
    const hotStocks = await getHotStocks();
    if (hotStocks.length === 0) {
      console.log('[REFRESH] No hot stocks to refresh');
      return { statusCode: 200, body: JSON.stringify({ success: true, refreshed: 0 }) };
    }

    console.log(`[REFRESH] Refreshing ${hotStocks.length} hot stocks: ${hotStocks.join(', ')}`);

    const results = await Promise.allSettled(
      hotStocks.map(async (symbol) => {
        const data = await fetchStockData(symbol, '2y');
        if (!data) return null;
        const indicators = computeIndicators({ ...data, symbol });
        await cacheSet(`signal:${symbol}`, {
          success: true,
          symbol,
          name: data.meta.longName,
          indicators,
          fromCache: false,
        }, 300); // 5 min TTL
        return symbol;
      })
    );

    const refreshed = results.filter(r => r.status === 'fulfilled' && r.value).length;
    console.log(`[REFRESH] Refreshed ${refreshed}/${hotStocks.length} stocks`);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, refreshed, total: hotStocks.length }),
    };

  } catch (err) {
    console.error('[REFRESH] Error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
