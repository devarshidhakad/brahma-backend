/**
 * BRAHMA INTELLIGENCE — Signal Lambda
 * POST /signal { symbol: "RELIANCE" }
 *
 * What this does (all real, no fakes):
 * 1. Fetches 2yr OHLCV from Yahoo Finance
 * 2. Computes: RSI, MACD, ATR, SMA20/50/200, EMA9/21, Bollinger Bands,
 *    Stochastic, OBV, CMF, Support/Resistance from real pivot points
 * 3. Runs real backtest on 2yr historical data (buy signal → hold → exit)
 * 4. Calls Claude with ALL real computed data
 * 5. Returns signal with honest labels on what's calculated vs AI-inferred
 *
 * What is NOT here:
 * - FII/DII data (requires NSE paid license — removed entirely)
 * - Elliott Wave (removed — was algorithmic approximation)
 * - Target days from thin air (now ATR-formula-based)
 */

'use strict';

const { getSecrets }           = require('./shared/secrets');
const { fetchStockData }       = require('./shared/yahoo');
const { cacheGet, cacheSet, addHotStock } = require('./shared/cache');
const {
  calcSMA, calcEMA, calcRSI, calcMACD, calcStochastic,
  calcATR, calcBollingerBands, calcOBV, calcCMF,
  volumeSignal, findSupportResistance,
  estimateTargetDays, calcBrahmaScore, scoreToSignal,
} = require('./shared/indicators');

// ── REAL BACKTEST ENGINE ──────────────────────────────────────────────────────

/**
 * Runs a real strategy backtest on historical OHLCV data.
 * Strategy: Buy when RSI crosses above 50 AND price > SMA50.
 *           Sell when RSI drops below 40 OR price drops 7% from entry.
 *           Hold for max 20 trading days.
 *
 * Returns real statistics computed from real historical data.
 * NOT a Monte Carlo simulation. NOT forward-looking.
 */
function runBacktest(bars) {
  if (bars.length < 60) return null;

  const closes  = bars.map(b => b.close);
  const highs   = bars.map(b => b.high);
  const lows    = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume);

  const trades = [];
  let inTrade = false;
  let entryPrice = 0, entryIdx = 0;

  for (let i = 55; i < bars.length - 1; i++) {
    const slice = closes.slice(0, i + 1);
    const rsi   = calcRSI(slice, 14);
    const sma50 = calcSMA(slice, 50);

    if (!inTrade) {
      // Entry: RSI just crossed above 50 AND price above SMA50
      const prevRSI = calcRSI(closes.slice(0, i), 14);
      if (rsi >= 50 && prevRSI < 50 && sma50 && closes[i] > sma50) {
        inTrade = true;
        entryPrice = closes[i + 1]; // buy at next open (approximated as next close)
        entryIdx = i + 1;
      }
    } else {
      const holdDays = i - entryIdx;
      const pnl = (closes[i] - entryPrice) / entryPrice;
      const rsiExit = rsi < 40;
      const stopHit = pnl <= -0.07;
      const maxHold = holdDays >= 20;

      if (rsiExit || stopHit || maxHold) {
        trades.push({
          entry:   entryPrice,
          exit:    closes[i],
          pnl:     Math.round(pnl * 10000) / 100, // in percent
          days:    holdDays,
          reason:  stopHit ? 'stop' : rsiExit ? 'signal' : 'timeout',
        });
        inTrade = false;
      }
    }
  }

  if (trades.length < 3) return null;

  const wins     = trades.filter(t => t.pnl > 0);
  const losses   = trades.filter(t => t.pnl <= 0);
  const winRate  = Math.round((wins.length / trades.length) * 100);
  const avgWin   = wins.length > 0
    ? Math.round(wins.reduce((s, t) => s + t.pnl, 0) / wins.length * 100) / 100 : 0;
  const avgLoss  = losses.length > 0
    ? Math.round(losses.reduce((s, t) => s + t.pnl, 0) / losses.length * 100) / 100 : 0;
  const profitFactor = (avgLoss !== 0 && losses.length > 0)
    ? Math.round(Math.abs((avgWin * wins.length) / (avgLoss * losses.length)) * 100) / 100
    : null;

  // Max drawdown calculation
  let peak = 0, maxDrawdown = 0, running = 0;
  trades.forEach(t => {
    running += t.pnl;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDrawdown) maxDrawdown = dd;
  });

  return {
    totalTrades:  trades.length,
    winRate,
    avgWinPct:    avgWin,
    avgLossPct:   avgLoss,
    profitFactor,
    maxDrawdownPct: Math.round(maxDrawdown * 100) / 100,
    recentTrades: trades.slice(-5),
    note: 'Backtest: RSI50 crossover + SMA50 filter strategy on 2yr historical OHLCV. Past performance does not predict future results.',
  };
}

// ── COMPUTE ALL INDICATORS ────────────────────────────────────────────────────

function computeIndicators(stockData) {
  const { bars, meta } = stockData;
  const closes  = bars.map(b => b.close);
  const highs   = bars.map(b => b.high);
  const lows    = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume);
  const n = closes.length;
  const price = meta.currentPrice || closes[n - 1];

  // Moving averages — null if insufficient data (never faked)
  const sma20  = calcSMA(closes, 20);
  const sma50  = calcSMA(closes, 50);
  const sma200 = n >= 200 ? calcSMA(closes, 200) : null;  // ONLY compute if we have 200 days
  const ema9   = calcEMA(closes, 9);
  const ema21  = calcEMA(closes, 21);

  // Momentum
  const rsi    = calcRSI(closes, 14);
  const rsi7   = calcRSI(closes, 7);
  const rsi21  = calcRSI(closes, 21);
  const macd   = calcMACD(closes);
  const stoch  = calcStochastic(highs, lows, closes, 14);

  // Volatility
  const atr    = calcATR(highs, lows, closes, 14);

  // Bollinger Bands
  const bb     = calcBollingerBands(closes, 20, 2);

  // Volume
  const obv    = calcOBV(closes, volumes);
  const cmf    = calcCMF(highs, lows, closes, volumes, 20);
  const volSig = volumeSignal(volumes);

  // Structure
  const sr     = findSupportResistance(highs, lows, closes);

  // 52-week position (0-100%)
  const w52pos = (meta.high52w && meta.low52w && meta.high52w > meta.low52w)
    ? Math.round((price - meta.low52w) / (meta.high52w - meta.low52w) * 100)
    : null;

  // Day change %
  const changePct = meta.previousClose
    ? Math.round((price - meta.previousClose) / meta.previousClose * 10000) / 100
    : null;

  // Structural signals
  const aboveSma20  = sma20  ? price > sma20  : null;
  const aboveSma50  = sma50  ? price > sma50  : null;
  const aboveSma200 = sma200 ? price > sma200 : null;
  const goldenCross = (sma50 && sma200) ? sma50 > sma200 : null;
  const deathCross  = (sma50 && sma200) ? sma50 < sma200 : null;
  const nearSupport = sr.support1 ? Math.abs(price - sr.support1) / price < 0.03 : false;

  // ATR-based stops and targets (from real support/resistance levels)
  const stopLoss = atr
    ? Math.round(Math.max(price - atr * 1.5, sr.support1 * 0.995) * 100) / 100
    : Math.round(sr.support1 * 0.995 * 100) / 100;

  const target1 = sr.resistance1;
  const target2 = atr ? Math.round((price + atr * 6) * 100) / 100 : null;

  // ATR-based days estimate (formula explained in indicators.js)
  const t1Days = atr ? estimateTargetDays(price, target1, atr) : null;
  const t2Days = atr && target2 ? estimateTargetDays(price, target2, atr) : null;

  const brahmaScoreInput = {
    price, sma20, sma50, sma200, ema9, ema21, rsi, macd,
    stoch, volSignal: volSig, w52pos, goldenCross, nearSupport,
    cmf, aboveSma200,
  };
  const score = calcBrahmaScore(brahmaScoreInput);
  const signal = scoreToSignal(score);

  return {
    price,
    changePct,
    // Moving averages
    sma20:  sma20  ? Math.round(sma20  * 100) / 100 : null,
    sma50:  sma50  ? Math.round(sma50  * 100) / 100 : null,
    sma200: sma200 ? Math.round(sma200 * 100) / 100 : null,
    sma200note: sma200 ? null : `SMA200 requires 200 trading days of data. Only ${n} days available.`,
    ema9:   ema9  ? Math.round(ema9   * 100) / 100 : null,
    ema21:  ema21 ? Math.round(ema21  * 100) / 100 : null,
    // Momentum
    rsi, rsi7, rsi21,
    macd,
    stoch,
    // Volatility
    atr: atr ? Math.round(atr * 100) / 100 : null,
    bb,
    // Volume (real OBV/CMF — NOT FII/DII)
    obv,
    cmf,
    volSignal: volSig,
    fiiNote: 'FII/DII data NOT available — requires NSE paid license. Removed from this version.',
    // Structure
    sr,
    w52pos,
    aboveSma20, aboveSma50, aboveSma200,
    goldenCross, deathCross,
    nearSupport,
    // Trade levels
    stopLoss,
    target1,
    target2,
    t1Days, t2Days,
    targetDaysNote: 'Days estimated via ATR formula: distance / (ATR × 0.25). Conservative estimate.',
    // Score
    score,
    signal,
    scoreNote: 'Brahma Score is rule-based, not backtest-optimised. See docs for weight sources.',
    // Meta
    high52w:         meta.high52w,
    low52w:          meta.low52w,
    earningsDate:    meta.earningsDate,
    daysToEarnings:  meta.daysToEarnings,
    longName:        meta.longName,
    dataPoints:      n,
  };
}

// ── CLAUDE SIGNAL PROMPT ─────────────────────────────────────────────────────

const SIGNAL_PROMPT = `You are BRAHMA — a senior quant analyst at an institutional hedge fund specializing in Indian equities.

You are given COMPUTED REAL DATA from Yahoo Finance. Every number below is calculated from actual market data — not invented.

YOUR RULES:
1. Use ONLY the numbers provided. Do not invent prices, targets, or dates.
2. Target days are pre-calculated via ATR formula. Use them — do not invent different numbers.
3. FII data is NOT available. Do not mention FII sentiment. It has been removed.
4. OBV and CMF are real volume indicators. Use them for accumulation/distribution analysis.
5. If SMA200 is null, say so — do not fake a trend-based-on-200MA.
6. Elliott Wave is NOT in scope. Do not reference it.
7. Brahma Score is rule-based. Label AI analysis as AI inference, not fact.

Return ONLY valid JSON, no markdown, no backticks:
{
  "signal": "STRONG BUY" | "BUY" | "NEUTRAL" | "AVOID" | "STRONG AVOID",
  "score": <use the brahmaScore from input data — do not change it>,
  "entryZone": { "low": <support1 from data>, "high": <current price> },
  "target1": { "price": <resistance1 from data>, "percent": "<+X.X%>", "days": <t1Days from data>, "daysNote": "ATR-formula estimate" },
  "target2": { "price": <target2 from data or null>, "percent": "<+X.X%>", "days": <t2Days from data>, "daysNote": "ATR-formula estimate" },
  "stopLoss": { "price": <stopLoss from data>, "percent": "<-X.X%>" },
  "riskReward": "<1:X.X>",
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "technicalScores": {
    "trendScore": <0-25, based on MA alignment>,
    "momentumScore": <0-20, based on RSI/MACD>,
    "volumeScore": <0-15, based on OBV trend + CMF>,
    "structureScore": <0-15, based on S/R levels>,
    "rrScore": <0-10, based on risk:reward ratio>
  },
  "keyLevels": {
    "support1": <from data>,
    "support2": <from data>,
    "resistance1": <from data>,
    "resistance2": <from data>,
    "pivotPoint": <from data>
  },
  "volumeAnalysis": {
    "obvTrend": "<Rising or Falling from OBV data>",
    "cmfValue": <cmf from data>,
    "interpretation": "<1 sentence: what OBV/CMF says about accumulation/distribution>",
    "note": "Volume analysis based on OBV (Granville 1963) and CMF (Chaikin 1982) from real OHLCV. FII data not available."
  },
  "patternDetected": "<candlestick or chart pattern detected from price action, or None>",
  "tradeSetup": "<1 sentence: exact trade setup referencing specific real levels>",
  "reasons": [
    "<technical reason citing specific real numbers>",
    "<momentum reason>",
    "<volume/OBV/CMF reason>",
    "<structure/S&R reason>",
    "<backtest context if available>"
  ],
  "risks": [
    "<primary technical risk>",
    "<macro/sector risk>",
    "<liquidity/volatility risk>"
  ],
  "positionSizing": "<recommended % of portfolio>",
  "holdingPeriod": "Intraday" | "Swing (3-7 days)" | "Positional (2-4 weeks)" | "Investment (3+ months)",
  "marketContext": "<1 sentence on Nifty/sector conditions>",
  "summary": "<2 sentence plain English summary for Indian retail trader>",
  "dataQualityNote": "<note any data limitations: e.g. SMA200 not available, short data history>"
}`;

// ── LAMBDA HANDLER ────────────────────────────────────────────────────────────

module.exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const symbol = (body.symbol || '').trim().toUpperCase();

    if (!symbol) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'symbol is required' }),
      };
    }

    // Check cache first
    const cacheKey = `signal:${symbol}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ...cached, fromCache: true }),
      };
    }

    // Fetch real 2yr data from Yahoo Finance
    const stockData = await fetchStockData(symbol, '2y');
    if (!stockData) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: `No data found for ${symbol}. Verify the NSE/BSE symbol.` }),
      };
    }

    // Compute all indicators from real data
    const indicators = computeIndicators(stockData);

    // Run real backtest
    const backtest = runBacktest(stockData.bars);

    // Build data payload for Claude
    const dataForClaude = {
      symbol,
      name: stockData.meta.longName,
      exchange: stockData.meta.exchangeName,
      dataPoints: stockData.bars.length,
      ...indicators,
      backtest,
    };

    // Get Anthropic key from Secrets Manager
    const { anthropicKey } = await getSecrets();

    // Call Claude with real data
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `${SIGNAL_PROMPT}\n\nREAL COMPUTED DATA:\n${JSON.stringify(dataForClaude, null, 2)}`,
        }],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!claudeResponse.ok) {
      const err = await claudeResponse.text();
      throw new Error(`Claude API error: ${claudeResponse.status} ${err}`);
    }

    const claudeData = await claudeResponse.json();
    const rawText = claudeData.content?.[0]?.text || '';

    let aiSignal;
    try {
      aiSignal = JSON.parse(rawText);
    } catch (_) {
      // Claude returned non-JSON — return raw indicators without AI enrichment
      aiSignal = { error: 'Claude returned non-JSON', raw: rawText.slice(0, 500) };
    }

    const result = {
      success: true,
      symbol,
      name: stockData.meta.longName,
      exchange: stockData.meta.exchangeName,
      generatedAt: new Date().toISOString(),
      indicators: dataForClaude,
      backtest,
      aiSignal,
      dataSource: 'Yahoo Finance v8 chart API',
      dataPoints: stockData.bars.length,
      fromCache: false,
    };

    // Cache for 5 minutes
    await cacheSet(cacheKey, result, 300);
    await addHotStock(symbol);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };

  } catch (err) {
    console.error('[SIGNAL] Error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
