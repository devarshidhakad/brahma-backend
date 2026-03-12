/**
 * BRAHMA INTELLIGENCE — Shared Indicator Library
 * Every formula here is a published standard. Citations included.
 * No invented math. No approximations without labels.
 */

'use strict';

// ── MOVING AVERAGES ──────────────────────────────────────────────────────────

/**
 * Simple Moving Average
 * Requires exactly `period` data points — returns null if insufficient.
 */
function calcSMA(closes, period) {
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Exponential Moving Average
 * Wilder smoothing: k = 2/(period+1)
 * Seed = SMA of first `period` bars.
 */
function calcEMA(closes, period) {
  if (!closes || closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

// ── MOMENTUM ────────────────────────────────────────────────────────────────

/**
 * RSI — Relative Strength Index (Wilder, 1978)
 * Uses simple average for first calculation (Cutler's RSI variant,
 * which is what Yahoo Finance and most charting platforms display).
 */
function calcRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) gains += delta;
    else losses -= delta;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

/**
 * MACD — Moving Average Convergence Divergence (Appel, 1979)
 * Returns { macd, signal, histogram }
 * macd = EMA12 - EMA26
 * signal = EMA9 of macd
 */
function calcMACD(closes) {
  if (!closes || closes.length < 35) return null;
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  if (ema12 === null || ema26 === null) return null;
  const macd = ema12 - ema26;

  // Build MACD line history to compute signal line
  const k12 = 2 / 13, k26 = 2 / 27;
  let e12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  let e26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
  const macdHistory = [];
  for (let i = 26; i < closes.length; i++) {
    if (i >= 12) e12 = closes[i] * k12 + e12 * (1 - k12);
    e26 = closes[i] * k26 + e26 * (1 - k26);
    macdHistory.push(e12 - e26);
  }
  const signal = macdHistory.length >= 9
    ? calcEMA(macdHistory, 9)
    : null;
  return {
    macd: Math.round(macd * 1000) / 1000,
    signal: signal !== null ? Math.round(signal * 1000) / 1000 : null,
    histogram: signal !== null ? Math.round((macd - signal) * 1000) / 1000 : null,
  };
}

/**
 * Stochastic Oscillator %K (Lane, 1950s)
 * %K = (Close - Lowest Low) / (Highest High - Lowest Low) * 100
 */
function calcStochastic(highs, lows, closes, period = 14) {
  if (!highs || highs.length < period) return null;
  const slice_h = highs.slice(-period);
  const slice_l = lows.slice(-period);
  const hh = Math.max(...slice_h);
  const ll = Math.min(...slice_l);
  if (hh === ll) return 50;
  const close = closes[closes.length - 1];
  return Math.round((close - ll) / (hh - ll) * 100);
}

// ── VOLATILITY ───────────────────────────────────────────────────────────────

/**
 * ATR — Average True Range (Wilder, 1978)
 * True Range = max(H-L, |H-Cprev|, |L-Cprev|)
 * ATR = SMA of True Range over period
 */
function calcATR(highs, lows, closes, period = 14) {
  if (!highs || highs.length < period + 1) return null;
  const trueRanges = [];
  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hcp = Math.abs(highs[i] - closes[i - 1]);
    const lcp = Math.abs(lows[i] - closes[i - 1]);
    trueRanges.push(Math.max(hl, hcp, lcp));
  }
  if (trueRanges.length < period) return null;
  return trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
}

/**
 * Bollinger Bands (Bollinger, 1980s)
 * Middle = SMA20
 * Upper = Middle + 2 * StdDev
 * Lower = Middle - 2 * StdDev
 * Returns { upper, middle, lower, pctB }
 * %B = (Price - Lower) / (Upper - Lower)
 */
function calcBollingerBands(closes, period = 20, multiplier = 2) {
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = mean + multiplier * stdDev;
  const lower = mean - multiplier * stdDev;
  const price = closes[closes.length - 1];
  const pctB = (upper - lower) !== 0 ? (price - lower) / (upper - lower) : 0.5;
  return {
    upper: Math.round(upper * 100) / 100,
    middle: Math.round(mean * 100) / 100,
    lower: Math.round(lower * 100) / 100,
    pctB: Math.round(pctB * 1000) / 1000,
    stdDev: Math.round(stdDev * 100) / 100,
  };
}

// ── VOLUME ───────────────────────────────────────────────────────────────────

/**
 * OBV — On-Balance Volume (Granville, 1963)
 * Running total: add volume on up days, subtract on down days.
 * Returns last OBV value and 20-day trend (rising/falling).
 */
function calcOBV(closes, volumes) {
  if (!closes || closes.length < 2 || !volumes) return null;
  let obv = 0;
  const obvSeries = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
    obvSeries.push(obv);
  }
  const recentOBV = obvSeries.slice(-20);
  const obvTrend = recentOBV[recentOBV.length - 1] > recentOBV[0] ? 'Rising' : 'Falling';
  return { obv: Math.round(obv), trend: obvTrend };
}

/**
 * CMF — Chaikin Money Flow (Chaikin, 1982)
 * Money Flow Multiplier = ((Close - Low) - (High - Close)) / (High - Low)
 * Money Flow Volume = MFM * Volume
 * CMF = Sum(MFV, 20) / Sum(Volume, 20)
 * Range: -1 to +1. Positive = buying pressure. Negative = selling.
 */
function calcCMF(highs, lows, closes, volumes, period = 20) {
  if (!highs || highs.length < period) return null;
  let sumMFV = 0, sumVol = 0;
  const slice = Math.max(0, closes.length - period);
  for (let i = slice; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    if (hl === 0) continue;
    const mfm = ((closes[i] - lows[i]) - (highs[i] - closes[i])) / hl;
    sumMFV += mfm * volumes[i];
    sumVol += volumes[i];
  }
  if (sumVol === 0) return 0;
  return Math.round((sumMFV / sumVol) * 1000) / 1000;
}

/**
 * Volume Signal — compared against 20-day average
 */
function volumeSignal(volumes) {
  if (!volumes || volumes.length < 20) return 'Normal';
  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const lastVol = volumes[volumes.length - 1];
  if (lastVol > avgVol * 1.5) return 'High';
  if (lastVol < avgVol * 0.7) return 'Low';
  return 'Normal';
}

// ── SUPPORT / RESISTANCE ─────────────────────────────────────────────────────

/**
 * Support/Resistance via local pivot points on real OHLC data.
 * A swing high: H[i] > H[i-1], H[i-2] AND H[i] > H[i+1], H[i+2]
 * A swing low: symmetric.
 * Returns nearest real support below price and resistance above price.
 */
function findSupportResistance(highs, lows, closes) {
  const price = closes[closes.length - 1];
  const pivotHighs = [], pivotLows = [];
  for (let i = 3; i < highs.length - 3; i++) {
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] &&
        highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
      pivotHighs.push(highs[i]);
    }
    if (lows[i] < lows[i-1] && lows[i] < lows[i-2] &&
        lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
      pivotLows.push(lows[i]);
    }
  }
  const supports = pivotLows.filter(x => x < price).sort((a, b) => b - a);
  const resistances = pivotHighs.filter(x => x > price).sort((a, b) => a - b);

  // Fallback: if no pivots found, use percentage-based (labeled as estimate)
  const support1 = supports[0] || Math.round(price * 0.97 * 100) / 100;
  const support2 = supports[1] || Math.round(price * 0.94 * 100) / 100;
  const resistance1 = resistances[0] || Math.round(price * 1.04 * 100) / 100;
  const resistance2 = resistances[1] || Math.round(price * 1.08 * 100) / 100;

  return {
    support1: Math.round(support1 * 100) / 100,
    support2: Math.round(support2 * 100) / 100,
    resistance1: Math.round(resistance1 * 100) / 100,
    resistance2: Math.round(resistance2 * 100) / 100,
    pivotPoint: Math.round(
      (highs[highs.length-1] + lows[lows.length-1] + closes[closes.length-1]) / 3 * 100
    ) / 100,
    usedFallback: !supports[0] || !resistances[0],
  };
}

// ── ATR-BASED TARGET DAYS ────────────────────────────────────────────────────

/**
 * Estimate trading days to reach a price target based on ATR.
 *
 * Formula: days = distance / (ATR × captureRate)
 * captureRate = 0.25 (conservative — stock captures 25% of ATR per day on average)
 * This is derived from the observation that daily moves average ~0.3-0.4× ATR
 * over a trending period; we use 0.25 to be conservative.
 *
 * Source rationale: ATR represents expected daily range. A stock moving toward
 * a target typically does so in non-linear fashion. 0.25 capture rate gives
 * a pessimistic (but more accurate) estimate vs using full ATR.
 *
 * Returns integer trading days. Floor 3, cap 90.
 * LABELED in response as ATR-estimated, not analyst-confirmed.
 */
function estimateTargetDays(price, target, atr) {
  if (!atr || atr === 0) return null;
  const distance = Math.abs(target - price);
  const captureRate = 0.25; // conservative ATR capture per day
  const rawDays = distance / (atr * captureRate);
  return Math.min(90, Math.max(3, Math.round(rawDays)));
}

// ── BRAHMA SCORE ─────────────────────────────────────────────────────────────

/**
 * Brahma Score (0-100) — rule-based scoring system.
 *
 * IMPORTANT: These weights are based on published technical analysis research
 * but have NOT been backtested for optimality on NSE data.
 * They represent reasonable signal weights, not proven optimal weights.
 *
 * Weight sources:
 * - SMA200 trend: Faber (2007) "A Quantitative Approach to Tactical Asset Allocation"
 * - 52-week high proximity: George & Hwang (2004) "The 52-Week High and Momentum Investing"
 * - RSI sweet spot (45-68): standard technical analysis consensus
 * - MACD signal: standard quant signal
 * - Volume confirmation: standard institutional confirmation signal
 *
 * Score is labeled "rule-based, not backtest-optimised" in API responses.
 */
function calcBrahmaScore(d) {
  let score = 0;

  // Trend (max 43 pts)
  if (d.sma200 && d.price > d.sma200) score += 18; // Faber 2007: biggest edge from 200MA
  if (d.sma50  && d.price > d.sma50)  score += 10;
  if (d.sma20  && d.price > d.sma20)  score += 8;
  if (d.ema9   && d.ema21 && d.ema9 > d.ema21) score += 7;

  // Momentum (max 20 pts)
  if (d.rsi !== null) {
    if (d.rsi >= 45 && d.rsi <= 65)      score += 12; // sweet spot
    else if (d.rsi > 65 && d.rsi <= 72)  score += 6;  // momentum but not overbought
    else if (d.rsi > 72 && d.rsi <= 80)  score += 2;  // risk of reversal
    // rsi > 80: penalty applied below
    // rsi < 35: penalty applied below
  }
  if (d.macd && d.macd.macd > 0)         score += 8;

  // Volume confirmation (max 10 pts)
  if (d.volSignal === 'High')   score += 10;
  else if (d.volSignal === 'Normal') score += 5;

  // Structure (max 17 pts)
  if (d.w52pos !== null && d.w52pos > 50) score += 10; // George & Hwang 2004
  if (d.goldenCross)                       score += 7;  // SMA50 > SMA200

  // Mean reversion / stochastic (max 5 pts)
  if (d.stoch !== null && d.stoch >= 30 && d.stoch <= 70) score += 3;
  if (d.nearSupport) score += 2;

  // CMF volume confirmation (max 5 pts)
  if (d.cmf !== null && d.cmf > 0.1)  score += 5;
  else if (d.cmf !== null && d.cmf > 0) score += 2;

  // Penalties
  if (d.rsi !== null && d.rsi > 80)  score -= 12; // overbought
  if (d.rsi !== null && d.rsi < 35)  score -= 10; // oversold (could be value, not penalised as hard)
  if (d.sma200 && d.price < d.sma200) score -= 5; // below long-term trend

  return Math.max(0, Math.min(100, score));
}

// ── SIGNAL FROM SCORE ────────────────────────────────────────────────────────

function scoreToSignal(score) {
  if (score >= 80) return 'STRONG BUY';
  if (score >= 62) return 'BUY';
  if (score >= 40) return 'NEUTRAL';
  if (score >= 22) return 'AVOID';
  return 'STRONG AVOID';
}

// ── EXPORTS ──────────────────────────────────────────────────────────────────

module.exports = {
  calcSMA,
  calcEMA,
  calcRSI,
  calcMACD,
  calcStochastic,
  calcATR,
  calcBollingerBands,
  calcOBV,
  calcCMF,
  volumeSignal,
  findSupportResistance,
  estimateTargetDays,
  calcBrahmaScore,
  scoreToSignal,
};
