import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const STOCKS = [
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy" },
  { symbol: "TCS", name: "Tata Consultancy Services", sector: "IT" },
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Banking" },
  { symbol: "INFY", name: "Infosys Ltd", sector: "IT" },
  { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Banking" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom" },
  { symbol: "WIPRO", name: "Wipro Ltd", sector: "IT" },
  { symbol: "TATAMOTORS", name: "Tata Motors", sector: "Auto" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", sector: "Finance" },
  { symbol: "ADANIENT", name: "Adani Enterprises", sector: "Conglomerate" },
  { symbol: "ZOMATO", name: "Zomato Ltd", sector: "Consumer" },
  { symbol: "SUNPHARMA", name: "Sun Pharma", sector: "Pharma" },
];

// ── EARNINGS: sourced live from Yahoo Finance via /api/stock ──
// No hardcoded dates. realEarnings.daysToEarnings comes from API.

// ── REGIME DETECTION ──────────────────────────────────────────
function detectRegime(niftyData) {
  if (!niftyData) return { regime: "UNKNOWN", color: "#94a3b8", emoji: "❓", advice: "Fetching market data..." };
  const { price, sma50, sma200, atr, changePct } = niftyData;
  const volatility = atr / price;
  if (volatility > 0.015) return { regime: "HIGH VOLATILITY", color: "#f87171", emoji: "⚡", advice: "Reduce position sizes 50%. Only STRONG BUY signals. Tighten stops.", positionMult: 0.5 };
  if (price > sma50 && price > sma200 && sma50 > sma200) return { regime: "BULL MARKET", color: "#00ff87", emoji: "🐂", advice: "Full position sizes. Ride momentum. Hold to Target 2.", positionMult: 1.0 };
  if (price < sma50 && price < sma200 && sma50 < sma200) return { regime: "BEAR MARKET", color: "#f87171", emoji: "🐻", advice: "Half positions only. Only STRONG BUY. Exit at Target 1.", positionMult: 0.4 };
  if (price > sma200 && price < sma50) return { regime: "PULLBACK IN UPTREND", color: "#fbbf24", emoji: "📉", advice: "Good buying opportunity. Wait for bounce confirmation.", positionMult: 0.75 };
  if (price < sma200 && price > sma50) return { regime: "RELIEF RALLY IN DOWNTREND", color: "#fb923c", emoji: "📈", advice: "Caution. Short-term bounce only. Take profits quickly.", positionMult: 0.5 };
  return { regime: "SIDEWAYS", color: "#60a5fa", emoji: "↔️", advice: "Range-bound market. Buy support, sell resistance. Smaller targets.", positionMult: 0.65 };
}

// ── BACKTEST: computed server-side from real OHLCV history ────
// getBacktestScore() removed — realBacktest comes from /api/stock

const SIGNAL_PROMPT = `You are SIGNL — a senior quant analyst at a top-tier hedge fund (think Citadel, Renaissance, D.E. Shaw) specializing in Indian equities. You have access to REAL NSE market data provided below. Analyze it with institutional rigor.

SCORING FRAMEWORK (0-100 Signl Score):
- Trend Alignment (25pts): Price vs SMA20/50/200, EMA9/21 crossovers, Golden/Death Cross
- Momentum (20pts): RSI7/14/21 levels, MACD line+signal, Stochastic %K/%D, Rate of Change
- Mean Reversion (15pts): Bollinger Band position, distance from VWAP, oversold/overbought extremes
- Volume Analysis (15pts): Volume vs 20-day avg, accumulation/distribution pattern
- Structure (15pts): Support/Resistance levels, ATR-based volatility, 52-week position
- Risk/Reward (10pts): ATR-based stop vs resistance target, position in trading range

SIGNAL RULES (used by institutional desks):
- STRONG BUY (85-100): Price above all MAs, RSI 55-70, MACD positive + rising, volume surge >150% avg, near support, golden cross, R:R > 1:3
- BUY (65-84): Price above SMA50+200, RSI 45-65, MACD turning positive, volume above avg, R:R > 1:2
- NEUTRAL (40-64): Mixed signals, price between MAs, RSI 40-60, consolidating, wait for confirmation
- AVOID (20-39): Price below SMA50, RSI declining, MACD negative, distribution pattern, R:R < 1:1.5
- STRONG AVOID (0-19): Price below all MAs, RSI <30 or death cross, heavy selling volume, breakdown

Return ONLY raw JSON. No markdown, no backticks. Start your response with { and end with }:
{
  "signal": "STRONG BUY" or "BUY" or "NEUTRAL" or "AVOID" or "STRONG AVOID",
  "score": <0-100>,
  "entryZone": { "low": <support level>, "high": <current price or slightly above> },
  "target1": { "price": <first resistance>, "percent": "<+X.X%>", "days": <5-15>, "date": "<date>" },
  "target2": { "price": <second resistance or ATR extension>, "percent": "<+X.X%>", "days": <15-30>, "date": "<date>" },
  "stopLoss": { "price": <ATR-based or support-based stop>, "percent": "<-X.X%>" },
  "peakDate": "<date range>",
  "riskReward": "<1:X.X>",
  "riskLevel": "LOW" or "MEDIUM" or "HIGH",
  "technicalScores": {
    "trendScore": <0-25>,
    "momentumScore": <0-20>,
    "meanReversionScore": <0-15>,
    "volumeScore": <0-15>,
    "structureScore": <0-15>,
    "rrScore": <0-10>
  },
  "keyLevels": {
    "support1": <number>, "support2": <number>,
    "resistance1": <number>, "resistance2": <number>,
    "pivotPoint": <number>
  },
  "institutionalView": {
    "accumulationDistribution": "Accumulation" or "Distribution" or "Neutral",
    "accumulationBasis": "<cite the specific volume signal: e.g. 'Volume 2.3× avg on up day — accumulation pattern'>",
    "sectorMomentum": "Strong" or "Moderate" or "Weak" or "Negative",
    "marketCapBias": "Largecap favored" or "Midcap favored" or "Neutral",
    "relativeStrength": "Outperforming Nifty" or "In line with Nifty" or "Underperforming Nifty"
  },
  "patternDetected": "<candlestick or chart pattern like Bullish Engulfing, Cup & Handle, Double Bottom, Head & Shoulders, etc. or None>",
  "tradeSetup": "<describe the exact trade setup in 1 sentence like a fund manager would — e.g. 'Breakout retest above 200DMA with volume confirmation; buy on dip to 20EMA'>",
  "reasons": ["<technical reason with specific numbers>", "<momentum reason>", "<volume/institutional reason>", "<fundamental catalyst>", "<risk/reward reason>"],
  "risks": ["<primary technical risk>", "<macro/fundamental risk>", "<liquidity/volatility risk>"],
  "positionSizing": "<recommended % of portfolio — e.g. 3-5% for LOW risk, 2-3% for MEDIUM, 1-2% for HIGH>",
  "holdingPeriod": "<Intraday / Swing 3-7 days / Positional 2-4 weeks / Investment 3+ months>",
  "marketContext": "<1 sentence on current Nifty/sector conditions>",
  "summary": "<2 sentence plain English summary for Indian retail trader>"
}`;

const MOOD_PROMPT = `You are SIGNL — chief market strategist. You are given REAL market data below. Use it to write a morning briefing. Return ONLY raw JSON. No markdown, no backticks. Start with { end with }.
DO NOT invent any prices, index values, or flows not given to you. Every number you cite must come from the data provided.
{
  "mood": "Strongly Bullish" or "Bullish" or "Neutral" or "Cautious" or "Bearish" or "Strongly Bearish",
  "topTheme": "<5 words capturing today's dominant market theme from the data>",
  "globalCue": "<1 sentence citing ONLY the real numbers provided — e.g. 'S&P 500 +0.8%, Nikkei -0.3%, SGX Nifty at 24,150'>",
  "domesticCue": "<1 sentence on Nifty direction, India VIX level, and USD/INR from real data provided>",
  "keyRisk": "<biggest risk based on the data given — e.g. high VIX, weak INR, global selloff>",
  "briefing": "<3 sentence plain-English morning briefing for Indian retail traders. Reference real numbers from the data. Do not invent flows or forecasts.>",
  "topTrades": ["<trade idea 1 based on real sector momentum data given>", "<trade idea 2>", "<trade idea 3>"]
}`;

const NEWS_ANALYZE_PROMPT = `You are SIGNL news analyst for Indian markets. You are given REAL headlines fetched from Indian financial RSS feeds right now. Analyze them. Return ONLY raw JSON. No markdown, no backticks. Start with { end with }.
DO NOT add headlines that are not in the list provided. Only analyze what is given.
{
  "analyzedHeadlines": [
    {
      "title": "<exact title from input — do not modify>",
      "source": "<source from input>",
      "impact": "Strongly Positive" or "Positive" or "Neutral" or "Negative" or "Strongly Negative",
      "affectedSectors": ["<sector1>", "<sector2>"],
      "affectedStocks": ["<NSE_SYMBOL1>", "<NSE_SYMBOL2>"],
      "severity": <1-5>,
      "tradingAction": "<what a trader should consider — be specific>",
      "timeframe": "Intraday" or "This week" or "This month",
      "whyItMatters": "<1 sentence explanation for a retail investor who doesn't follow markets daily>"
    }
  ],
  "keyRisk": "<biggest risk from today's real headlines>",
  "keyOpportunity": "<biggest opportunity from today's real headlines>",
  "sectorRotation": "<which sectors are in focus based on today's news>"
}`;

const TOP5_PROMPT = `You are SIGNL — head of equity research at a top hedge fund. You are given REAL NSE market data for each stock.

CRITICAL: Return ONLY a raw JSON object. No markdown. No backticks. No preamble. Start your response with { and end with }.
Keep all text fields under 15 words. Be concise.

{
  "generatedAt": "<time IST>",
  "marketCondition": "<1 sentence on market>",
  "marketRegime": "Risk-On" or "Risk-Off" or "Rotation" or "Consolidation",
  "picks": [
    {
      "rank": 1,
      "symbol": "<NSE symbol>",
      "name": "<company name>",
      "sector": "<sector>",
      "signal": "STRONG BUY" or "BUY",
      "score": <85-99>,
      "currentPrice": <real price>,
      "entryZone": { "low": <support>, "high": <price> },
      "stopLoss": <atr stop>,
      "stopLossPercent": "<-X.X%>",
      "target1": <resistance>,
      "target1Percent": "<+X.X%>",
      "target1Days": <number>,
      "target2": <number>,
      "target2Percent": "<+X.X%>",
      "target2Days": <number>,
      "peakWindow": "<date range>",
      "riskReward": "<1:X.X>",
      "riskLevel": "LOW" or "MEDIUM",
      "tradeSetup": "<entry setup max 12 words>",
      "topReason": "<key reason max 12 words>",
      "technicalConfluence": ["<signal 1>", "<signal 2>", "<signal 3>"],
      "catalysts": ["<catalyst 1>", "<catalyst 2>"],
      "institutionalAngle": "<smart money angle max 12 words>",
      "positionSize": "<2-5% of portfolio>",
      "holdingPeriod": "Swing" or "Positional" or "Investment",
      "confidence": "HIGH" or "VERY HIGH"
    }
  ],
  "disclaimer": "AI-generated signals. Not SEBI-registered advice."
}
Pick exactly 5 stocks. Use REAL data only. No invented prices.`;

// ── TECHNICAL INDICATOR MATH — defined outside component ──────
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses += Math.abs(d);
  }
  let ag = gains / period, al = losses / period;
  if (al === 0) return 100;
  return Math.round(100 - 100 / (1 + ag / al));
}
function calcEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return Math.round(ema * 100) / 100;
}
function calcSMA(closes, period) {
  if (closes.length < period) return null;
  return Math.round(closes.slice(-period).reduce((a, b) => a + b, 0) / period * 100) / 100;
}
function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12), ema26 = calcEMA(closes, 26);
  if (!ema12 || !ema26) return { line: 0, signal: "Neutral" };
  const line = ema12 - ema26;
  return { line: Math.round(line * 100) / 100, signal: line > 0 ? "Positive" : "Negative" };
}
function calcBB(closes, period = 20) {
  if (closes.length < period) return null;
  const sl = closes.slice(-period);
  const sma = sl.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(sl.reduce((s, v) => s + Math.pow(v - sma, 2), 0) / period);
  return { upper: Math.round((sma + 2 * std) * 100) / 100, middle: Math.round(sma * 100) / 100, lower: Math.round((sma - 2 * std) * 100) / 100 };
}
function calcATR(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return 0;
  const trs = [];
  for (let i = 1; i < closes.length; i++) trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
  return Math.round(trs.slice(-period).reduce((a, b) => a + b, 0) / period * 100) / 100;
}
function calcStoch(highs, lows, closes, period = 14) {
  if (closes.length < period) return 50;
  const rh = Math.max(...highs.slice(-period)), rl = Math.min(...lows.slice(-period));
  return rh === rl ? 50 : Math.round((closes[closes.length-1] - rl) / (rh - rl) * 100);
}
function calcVWAP(closes, volumes) {
  if (!volumes?.length) return null;
  const slice = closes.slice(-20), vslice = volumes.slice(-20);
  const tpv = slice.reduce((s, c, i) => s + c * vslice[i], 0);
  const tv = vslice.reduce((a, b) => a + b, 0);
  return tv ? Math.round(tpv / tv * 100) / 100 : null;
}
function findSR(highs, lows, closes) {
  const price = closes[closes.length - 1];
  const pivotHighs = [], pivotLows = [];
  for (let i = 2; i < highs.length - 2; i++) {
    if (highs[i] > highs[i-1] && highs[i] > highs[i+1] && highs[i] > highs[i-2] && highs[i] > highs[i+2]) pivotHighs.push(highs[i]);
    if (lows[i] < lows[i-1] && lows[i] < lows[i+1] && lows[i] < lows[i-2] && lows[i] < lows[i+2]) pivotLows.push(lows[i]);
  }
  const supports = pivotLows.filter(p => p < price).sort((a, b) => b - a);
  const resistances = pivotHighs.filter(p => p > price).sort((a, b) => a - b);
  return {
    support: supports[0] ? Math.round(supports[0]) : Math.round(price * 0.97),
    resistance: resistances[0] ? Math.round(resistances[0]) : Math.round(price * 1.04),
  };
}
// ── SECTOR UNIVERSE — 120 curated NSE stocks ──────────────────
const SECTOR_UNIVERSE = {
  "Banking":   ["HDFCBANK","ICICIBANK","AXISBANK","KOTAKBANK","SBIN","BANDHANBNK","FEDERALBNK","INDUSINDBK","IDFCFIRSTB","YESBANK"],
  "IT":        ["TCS","INFY","WIPRO","HCLTECH","TECHM","LTIM","PERSISTENT","COFORGE","MPHASIS","OFSS"],
  "Pharma":    ["SUNPHARMA","DRREDDY","CIPLA","DIVISLAB","APOLLOHOSP","AUROPHARMA","TORNTPHARM","LUPIN","ALKEM","BIOCON"],
  "Auto":      ["TATAMOTORS","MARUTI","M&M","BAJAJ-AUTO","EICHERMOT","HEROMOTOCO","ASHOKLEY","TVSMOTOR","BALKRISIND","MOTHERSON"],
  "Energy":    ["RELIANCE","ONGC","BPCL","IOC","NTPC","POWERGRID","ADANIGREEN","ADANIPORTS","TATAPOWER","COALINDIA"],
  "Finance":   ["BAJFINANCE","BAJAJFINSV","CHOLAFIN","MUTHOOTFIN","SBICARD","HDFCLIFE","ICICIPRULI","LICIHSGFIN","RECLTD","PFC"],
  "FMCG":      ["HINDUNILVR","ITC","NESTLEIND","BRITANNIA","DABUR","GODREJCP","MARICO","COLPAL","EMAMILTD","VBL"],
  "Infra":     ["LARSEN","ULTRACEMCO","ADANIENT","SIEMENS","ABB","HAVELLS","BHEL","IRFC","RVNL","NBCC"],
  "Consumer":  ["ZOMATO","NYKAA","DMART","TITAN","JUBLFOOD","DEVYANI","SAPPHIRE","WESTLIFE","IRCTC","INDIGO"],
  "Telecom":   ["BHARTIARTL","IDEA","TATACOMM","HFCL","TEJASNET","STLTECH","RAILTEL","ROUTE","GTLINFRA","ITI"],
};

const SECTOR_ETFS = {
  "Banking":  "^NSEBANK", "IT": "^CNXIT", "Pharma": "^CNXPHARMA",
  "Auto":     "^CNXAUTO", "Energy": "^CNXENERGY", "Finance": "^CNXFIN",
  "FMCG":     "^CNXFMCG", "Infra": "^CNXINFRA", "Consumer": "^CNXCONSUM",
  "Telecom":  "BHARTIARTL.NS",
};

// ── ELLIOTT WAVE ENGINE ───────────────────────────────────────
function detectElliottWave(closes, highs, lows) {
  if (!closes || closes.length < 50) return null;

  const n = closes.length;
  const price = closes[n - 1];

  // Fibonacci ratios
  const FIB = { r236: 0.236, r382: 0.382, r500: 0.5, r618: 0.618, r786: 0.786, ext127: 1.272, ext161: 1.618, ext261: 2.618 };

  // Find significant swing points using ZigZag logic
  function findSwings(period = 10) {
    const swings = [];
    for (let i = period; i < n - period; i++) {
      const localHigh = Math.max(...highs.slice(i - period, i + period));
      const localLow  = Math.min(...lows.slice(i - period, i + period));
      if (highs[i] === localHigh) swings.push({ i, price: highs[i],  type: "H" });
      if (lows[i]  === localLow)  swings.push({ i, price: lows[i],   type: "L" });
    }
    // Deduplicate adjacent same-type
    const clean = [];
    for (const s of swings) {
      if (!clean.length || clean[clean.length-1].type !== s.type) clean.push(s);
      else if (s.type === "H" && s.price > clean[clean.length-1].price) clean[clean.length-1] = s;
      else if (s.type === "L" && s.price < clean[clean.length-1].price) clean[clean.length-1] = s;
    }
    return clean;
  }

  const swings = findSwings(8);
  if (swings.length < 6) return null;

  const recent = swings.slice(-8);

  // Detect impulse wave pattern: L H L H L H (5-wave up)
  function calcFibLevels(waveStart, waveEnd) {
    const range = waveEnd - waveStart;
    return {
      fib236: Math.round((waveEnd - range * FIB.r236) * 100) / 100,
      fib382: Math.round((waveEnd - range * FIB.r382) * 100) / 100,
      fib500: Math.round((waveEnd - range * FIB.r500) * 100) / 100,
      fib618: Math.round((waveEnd - range * FIB.r618) * 100) / 100,
      fib786: Math.round((waveEnd - range * FIB.r786) * 100) / 100,
      ext127: Math.round((waveStart + range * FIB.ext127) * 100) / 100,
      ext161: Math.round((waveStart + range * FIB.ext161) * 100) / 100,
      ext261: Math.round((waveStart + range * FIB.ext261) * 100) / 100,
    };
  }

  // Identify current wave position
  let waveCount = "UNKNOWN", waveDescription = "", fibLevels = null, waveSignal = "NEUTRAL";
  let waveTarget = null, waveStop = null, isWave3 = false, isWave5 = false, isCorrective = false;

  // Look at last 6 swings to classify
  const s = recent.slice(-6);
  if (s.length >= 6) {
    const [w0,w1,w2,w3,w4,w5] = s;
    // Classic 5-wave impulse: L-H-L-H-L-H ascending
    const isImpulse = w0.type==="L" && w1.type==="H" && w2.type==="L" && w3.type==="H" && w4.type==="L" && w5.type==="H";
    // Wave 3 setup: price came off wave 2 low, about to start wave 3
    const atWave2Low = w4.type==="L" && price <= w4.price * 1.03 && price > w2.price;
    const inWave3 = w4.type==="L" && price > w3.price * 0.98 && price < w5.price;
    const atWave4Correction = w5.type==="H" && price < w5.price && price > w3.price;
    const inWave5 = w4.type==="L" && price >= w5.price * 0.98;

    if (isImpulse && atWave2Low) {
      waveCount = "Wave 2 Bottom"; isWave3 = true;
      waveDescription = "Price completing Wave 2 correction. Wave 3 (most powerful) imminent.";
      fibLevels = calcFibLevels(w4.price, w3.price);
      waveTarget = fibLevels.ext161;
      waveStop = Math.round(w4.price * 0.985 * 100) / 100;
      waveSignal = "STRONG BUY";
    } else if (inWave3) {
      waveCount = "Wave 3 (Active)"; isWave3 = true;
      waveDescription = "Inside Wave 3 — the most powerful and profitable wave. Ride the momentum.";
      fibLevels = calcFibLevels(w4.price, w3.price);
      waveTarget = fibLevels.ext161;
      waveStop = Math.round(w4.price * 0.985 * 100) / 100;
      waveSignal = "BUY";
    } else if (atWave4Correction) {
      waveCount = "Wave 4 Correction"; isCorrective = true;
      waveDescription = "Corrective Wave 4 in progress. Wait for Wave 5 entry at Fib support.";
      fibLevels = calcFibLevels(w4.price, w5.price);
      waveTarget = fibLevels.ext127;
      waveStop = fibLevels.fib618;
      waveSignal = "WAIT";
    } else if (inWave5) {
      waveCount = "Wave 5 (Final)"; isWave5 = true;
      waveDescription = "Final Wave 5 — take profits, correction (A-B-C) coming. Do not add positions.";
      fibLevels = calcFibLevels(w4.price, w3.price);
      waveTarget = fibLevels.ext127;
      waveStop = Math.round(w4.price * 100) / 100;
      waveSignal = "TAKE PROFIT";
    } else {
      waveCount = "Corrective A-B-C"; isCorrective = true;
      waveDescription = "A-B-C correction underway. Wait for C-wave completion before buying.";
      fibLevels = calcFibLevels(w3.price, w5.price);
      waveTarget = fibLevels.fib618;
      waveSignal = "AVOID";
    }
  }

  // Always compute key Fibonacci from last major swing
  const lastMajorLow = Math.min(...lows.slice(-60));
  const lastMajorHigh = Math.max(...highs.slice(-60));
  const majorFib = calcFibLevels(lastMajorLow, lastMajorHigh);

  return {
    waveCount, waveDescription, waveSignal, isWave3, isWave5, isCorrective,
    waveTarget, waveStop, fibLevels: majorFib,
    keyLevels: {
      goldenZone: { low: majorFib.fib618, high: majorFib.fib500 },
      deepSupport: majorFib.fib786,
      ext1: majorFib.ext127,
      ext2: majorFib.ext161,
    },
    swingCount: swings.length,
  };
}

// ── SIGNL SCORE CALCULATOR (for scanner) ────────────────────
function calcSignlScore(rd) {
  if (!rd) return 0;
  let score = 0;
  if (rd.aboveSma200)                          score += 20;
  if (rd.aboveSma50)                           score += 10;
  if (rd.goldenCross)                          score += 10;
  if (rd.rsi14 >= 45 && rd.rsi14 <= 68)        score += 10;
  if (rd.macd?.line > 0)                       score += 10;
  if (rd.volSignal === "High")                 score += 10;
  if (rd.ema9 > rd.ema21)                      score += 8;
  if (rd.stoch >= 20 && rd.stoch <= 75)        score += 6;
  if (rd.price > rd.bb?.middle)                score += 6;
  if (rd.w52pos >= 30 && rd.w52pos <= 88)      score += 5;
  if (rd.atr / rd.price < 0.025)               score += 5;
  return Math.min(score, 100);
}
// ─────────────────────────────────────────────────────────────

function parseJSON(raw) {
  try {
    if (!raw || typeof raw !== "string" || raw.trim() === "") {
      console.error("[parseJSON] empty or null input:", raw);
      return null;
    }
    const clean = raw.replace(/```json|```/g, "").trim();
    const obj = clean.match(/\{[\s\S]*\}/);
    const arr = clean.match(/\[[\s\S]*\]/);
    try { if (obj) return JSON.parse(obj[0]); } catch(e) {}
    try { if (arr) return JSON.parse(arr[0]); } catch(e) {}
    return JSON.parse(clean);
  } catch(e) {
    console.error("[parseJSON] failed to parse:", raw?.slice(0,200), e.message);
    return null;
  }
}

const SIGNL_KEY = "" // Key handled server-side in AWS Secrets Manager;

export default function SignlIntelligence() {
  const [apiKey] = useState(SIGNL_KEY);
  const [apiError, setApiError] = useState("");
  const [showApiSetup, setShowApiSetup] = useState(false);

  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedStock, setSelectedStock] = useState(null);
  const [signalData, setSignalData] = useState({});
  const [loadingStock, setLoadingStock] = useState(null);

  const [marketMood, setMarketMood] = useState(null);
  const [loadingMood, setLoadingMood] = useState(false);
  const [niftyRegime, setNiftyRegime] = useState(null);
  const [loadingRegime, setLoadingRegime] = useState(false);

  // Portfolio Risk Manager
  const [portfolio, setPortfolio] = useState(() => {
    try { return JSON.parse(localStorage.getItem("brahma_portfolio") || "[]"); } catch { return []; }
  });
  const [portfolioCapital, setPortfolioCapital] = useState(() => {
    try { return parseFloat(localStorage.getItem("brahma_capital") || "500000"); } catch { return 500000; }
  });
  const [showPortfolioManager, setShowPortfolioManager] = useState(false);

  const [newsData, setNewsData] = useState(null);
  const [loadingNews, setLoadingNews] = useState(false);

  const [top5, setTop5] = useState(null);
  const [loadingTop5, setLoadingTop5] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [askQuery, setAskQuery] = useState("");
  const [askResponse, setAskResponse] = useState(null);
  const [loadingAsk, setLoadingAsk] = useState(false);

  const currentDate = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const currentTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  // ── CORE API CALL ──────────────────────────────────────────
  async function callSignl(userMessage, systemPrompt, maxTokens = 4000) {
    const response = await fetch(`${API_BASE}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: userMessage, systemPrompt, maxTokens }),
    });
    if (!response.ok) throw new Error("Backend error " + response.status);
    const data = await response.json();
    console.log("[callSignl] response:", JSON.stringify(data).slice(0,200));
    if (data.error) throw new Error(data.error);
    if (!data.answer) throw new Error("No answer from backend");
    return data.answer;
  }

  // ── KEY CONFIGURED VIA .env (REACT_APP_ANTHROPIC_KEY) ────────
  function handleSaveKey() {
    if (!SIGNL_KEY) { setApiError("❌ Add REACT_APP_ANTHROPIC_KEY to your .env file and rebuild."); return; }
    setShowApiSetup(false);
    setTimeout(() => { loadMarketMood(SIGNL_KEY); fetchNiftyRegime(); }, 300);
  }

  // ── FETCH NIFTY REGIME ─────────────────────────────────────
  async function fetchNiftyRegime() {
    setLoadingRegime(true);
    try {
      const res = await fetch(`${API_BASE}/nifty`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) { setNiftyRegime(detectRegime(json)); setLoadingRegime(false); return; }
      }
      // Fallback: use Reliance as market proxy
      const rd = await fetchStockData("RELIANCE");
      setNiftyRegime(detectRegime({ price: rd.price, sma50: rd.sma50, sma200: rd.sma200, atr: rd.atr }));
    } catch(e) { console.error(e); setNiftyRegime({ regime: "UNKNOWN", color: "#94a3b8", emoji: "❓", advice: "Could not detect regime. Using default sizing.", positionMult: 0.75 }); }
    setLoadingRegime(false);
  }


  async function loadMarketMood(key) {
    setLoadingMood(true);
    const k = key || apiKey;
    try {
      // ── STEP 1: Fetch REAL global market data ──────────────
      setFetchStatus("🌍 Fetching real global markets...");
      let globalData = null;
      try {
        // Global market data not available — skip gracefully
        // Will be added in Phase 2 via dedicated /globals lambda
        globalData = null;
      } catch(e) {}

      // ── STEP 2: Fetch REAL news headlines ──────────────────
      let realHeadlines = [];
      try {
        const nr = await fetch(`${API_BASE}/news`);
        if (nr.ok) { const nj = await nr.json(); if (nj.success) realHeadlines = nj.articles?.slice(0,5) || []; }
      } catch(e) {}

      // ── STEP 3: Build context from REAL data ───────────────
      const globalContext = globalData ? `
REAL GLOBAL MARKET DATA (fetched ${new Date().toLocaleTimeString('en-IN')} IST):
${Object.entries(globalData.markets).map(([name,m]) => `  ${name}: ${m.price?.toLocaleString('en-IN')} (${m.changePct > 0 ? '+' : ''}${m.changePct}%)`).join('\n')}

REAL Fear & Greed Index: ${globalData.fearGreed?.score}/100 — ${globalData.fearGreed?.label}
REAL Global Sentiment: ${globalData.globalSentiment}% of tracked markets trading positive
${globalData.niftyRange ? `REAL Nifty VIX-implied range: Support ${globalData.niftyRange.support} / Resistance ${globalData.niftyRange.resistance}` : ''}

TOP NEWS FROM INDIAN FINANCIAL RSS (real headlines, fetched now):
${realHeadlines.map((h,i) => `${i+1}. [${h.source}] ${h.title}`).join('\n')}
` : `No global market data available. Note this clearly in your briefing.`;

      setFetchStatus("");
      const raw = await callSignlWithKey(k,
        `Today is ${currentDate}. Here is REAL market data:\n${globalContext}\n\nWrite the morning briefing using ONLY these real numbers. Do not invent any data.`,
        MOOD_PROMPT
      );
      const parsed = parseJSON(raw);
      // Attach real data that AI cannot fabricate
      if (parsed && globalData) {
        parsed.fearGreedIndex  = globalData.fearGreed.score;
        parsed.fearGreedLabel  = globalData.fearGreed.label;
        parsed.niftyRange      = globalData.niftyRange;
        parsed.realMarkets     = globalData.markets;
        parsed.dataSource      = "Real — Yahoo Finance + Indian RSS feeds";
      }
      setMarketMood(parsed);
    } catch (e) { console.error(e); }
    setLoadingMood(false);
  }

  async function callSignlWithKey(key, userMessage, systemPrompt, maxTokens = 4000) {
    const response = await fetch(`${API_BASE}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: userMessage, systemPrompt, maxTokens }),
    });
    if (!response.ok) throw new Error("Backend error " + response.status);
    const data = await response.json();
    console.log("[callSignlWithKey] response:", JSON.stringify(data).slice(0,200));
    if (data.error) throw new Error(data.error);
    if (!data.answer) throw new Error("No answer from backend");
    return data.answer;
  }

  const [twelveDataKey, setTwelveDataKey] = useState("");
  const [tdKeyInput, setTdKeyInput] = useState("");
  const [showTdSetup, setShowTdSetup] = useState(false);
  const [fetchStatus, setFetchStatus] = useState("");

  const BACKEND = "";

  // ── FETCH REAL NSE DATA VIA BACKEND (Yahoo Finance) ────────
  async function fetchStockData(symbol) {
    setFetchStatus(`📡 Fetching real NSE data for ${symbol}...`);
    const res = await fetch(`${API_BASE}/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol })
    });
    if (!res.ok) throw new Error("Backend error " + res.status);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "No data");
    const { price, indicators } = json;
    setFetchStatus(`🧮 ${indicators.daysAnalyzed} days analyzed • ${json.backtest?.totalTrades || 0} backtest trades ✓`);
    const sma50 = indicators.sma50, sma200 = indicators.sma200;
    const aboveSma20 = indicators.aboveSma20, aboveSma50 = indicators.aboveSma50, aboveSma200 = indicators.aboveSma200;
    const goldenCross = indicators.goldenCross;
    const bullSignals = [aboveSma20, aboveSma50, aboveSma200, goldenCross, indicators.macd?.line > 0, indicators.rsi14 > 50].filter(Boolean).length;
    return {
      price: price.current, prevClose: price.prev,
      change: price.change, changePct: price.changePct,
      dayHigh: price.dayHigh, dayLow: price.dayLow,
      volume: price.volume, vol20avg: indicators.vol20avg,
      w52h: price.w52h, w52l: price.w52l, w52pos: price.w52pos,
      daysAnalyzed: indicators.daysAnalyzed,
      rsi14: indicators.rsi14, rsi7: indicators.rsi7, rsi21: indicators.rsi21,
      macd: indicators.macd,
      sma20: indicators.sma20, sma50, sma200,
      ema9: indicators.ema9, ema21: indicators.ema21,
      bb: indicators.bb, atr: indicators.atr,
      stoch: indicators.stoch, vwap: null,
      sr: indicators.sr, volSignal: indicators.volSignal,
      aboveSma20, aboveSma50, aboveSma200, goldenCross,
      trend: bullSignals >= 5 ? "Strongly Bullish" : bullSignals >= 4 ? "Bullish" : bullSignals <= 1 ? "Strongly Bearish" : bullSignals <= 2 ? "Bearish" : "Sideways",
      stopLoss: indicators.stopLoss, target1: indicators.target1,
      target2: indicators.target2, target3: indicators.target3,
      ohlcv: json.ohlcv || null,
      // REAL backtest from actual historical data — not estimated
      realBacktest: json.backtest || null,
      // REAL earnings date from Yahoo Finance calendarEvents
      realEarnings: json.earnings || null,
    };
  }

  // ── PORTFOLIO RISK MANAGER ────────────────────────────────
  function getPositionSize(capital, riskPercent, entryPrice, stopLoss) {
    const riskAmount = capital * (riskPercent / 100);
    const riskPerShare = Math.abs(entryPrice - stopLoss);
    if (!riskPerShare) return { shares: 0, amount: 0, riskAmount };
    const shares = Math.floor(riskAmount / riskPerShare);
    return { shares, amount: Math.round(shares * entryPrice), riskAmount: Math.round(riskAmount) };
  }

  function getPortfolioRisk(regime) {
    const base = 2;
    const mult = regime?.positionMult || 1;
    return (base * mult).toFixed(1);
  }

  function addToPortfolio(stock, signalData) {
    const regime = niftyRegime || { positionMult: 1 };
    const riskPct = getPortfolioRisk(regime);
    const entry = signalData?.entryZone?.high || signalData?.currentPrice;
    const stop = signalData?.stopLoss?.price || signalData?.stopLoss;
    const sizing = getPositionSize(portfolioCapital, parseFloat(riskPct), entry, stop);
    const newTrade = {
      id: Date.now(), symbol: stock.symbol, name: stock.name, sector: stock.sector,
      entry, stop, target1: signalData?.target1?.price || signalData?.target1,
      target2: signalData?.target2?.price || signalData?.target2,
      shares: sizing.shares, amount: sizing.amount, riskAmount: sizing.riskAmount,
      riskPct, date: new Date().toLocaleDateString("en-IN"), status: "OPEN",
      signal: signalData?.signal,
    };
    const updated = [...portfolio, newTrade];
    setPortfolio(updated);
    return sizing;
  }

  function removeFromPortfolio(id) {
    const updated = portfolio.filter(t => t.id !== id);
    setPortfolio(updated);
  }

  // ── ANALYZE STOCK WITH REAL DATA ───────────────────────────
  async function analyzeStock(stock) {
    if (signalData[stock.symbol]) {
      setSelectedStock({ ...stock, data: signalData[stock.symbol] });
      setActiveTab("signal");
      return;
    }
    setLoadingStock(stock.symbol);
    setActiveTab("signal");
    setSelectedStock({ ...stock, data: null });
    setFetchStatus("");
    try {
      let rd = null;
      let userMessage;

      if (true) { // Always try real backend data
        try {
          rd = await fetchStockData(stock.symbol);
        } catch (e) {
          console.warn("Backend fetch failed:", e.message);
          setFetchStatus("⚠️ Real data unavailable — using AI estimate");
        }
      }

      if (rd) {
        const bbPos = rd.price > rd.bb?.upper ? "ABOVE UPPER BAND — overbought, mean reversion risk" : rd.price < rd.bb?.lower ? "BELOW LOWER BAND — oversold, high probability bounce" : rd.price > rd.bb?.middle ? "Above midline — mild bullish" : "Below midline — mild bearish";
        const rsiMomentum = rd.rsi14 < 30 ? "OVERSOLD — strong mean reversion setup" : rd.rsi14 < 40 ? "Weak — approaching oversold" : rd.rsi14 < 50 ? "Neutral-weak" : rd.rsi14 < 60 ? "Neutral-strong" : rd.rsi14 < 70 ? "Strong momentum" : "OVERBOUGHT — caution, profit booking likely";
        const maScore = [rd.aboveSma20, rd.aboveSma50, rd.aboveSma200].filter(Boolean).length;
        const trendStrength = maScore === 3 ? "STRONGLY BULLISH — above all 3 MAs" : maScore === 2 ? "BULLISH — above 2 of 3 MAs" : maScore === 1 ? "BEARISH — below 2 of 3 MAs" : "STRONGLY BEARISH — below all MAs";
        const w52Signal = rd.w52pos > 80 ? "Near 52W high — breakout or distribution zone" : rd.w52pos < 20 ? "Near 52W low — deep value or falling knife" : rd.w52pos > 50 ? "Upper half of range — bullish bias" : "Lower half of range — bearish bias";
        const rrRatio = rd.atr ? ((rd.target1 - rd.price) / (rd.price - rd.stopLoss)).toFixed(1) : "N/A";

        userMessage = `Analyze ${stock.name} (${stock.symbol}.NS) — ${stock.sector} sector.
Today: ${currentDate}

╔══════════════════════════════════════════════════╗
  REAL NSE DATA — ${rd.daysAnalyzed} TRADING DAYS (Yahoo Finance)
╚══════════════════════════════════════════════════╝

▶ PRICE ACTION
  Current Price:    ₹${rd.price}
  Prev Close:       ₹${rd.prevClose}  |  Change: ${rd.change >= 0 ? "+" : ""}₹${rd.change} (${rd.changePct}%)
  Day Range:        ₹${rd.dayLow} – ₹${rd.dayHigh}
  52W Range:        ₹${rd.w52l} – ₹${rd.w52h}
  52W Position:     ${rd.w52pos}% → ${w52Signal}

▶ VOLUME ANALYSIS
  Today Volume:     ${rd.volume?.toLocaleString("en-IN")}
  20D Avg Volume:   ${rd.vol20avg?.toLocaleString("en-IN")}
  Volume Signal:    ${rd.volSignal} ${rd.volSignal === "High" ? "📈 ACCUMULATION — institutional buying likely" : rd.volSignal === "Low" ? "📉 LOW CONVICTION — wait for volume" : ""}

▶ MOMENTUM INDICATORS
  RSI  7-day:       ${rd.rsi7}
  RSI 14-day:       ${rd.rsi14} → ${rsiMomentum}
  RSI 21-day:       ${rd.rsi21}
  RSI Divergence:   ${rd.rsi14 > rd.rsi7 ? "Short RSI > Long RSI — momentum building" : "Short RSI < Long RSI — momentum fading"}
  MACD Line:        ${rd.macd?.line} → ${rd.macd?.signal} ${rd.macd?.line > 0 ? "✅ Positive" : "❌ Negative"}
  Stochastic %K:    ${rd.stoch} → ${rd.stoch < 20 ? "⬇ OVERSOLD" : rd.stoch > 80 ? "⬆ OVERBOUGHT" : "Normal range"}

▶ MOVING AVERAGE STRUCTURE
  EMA  9:           ₹${rd.ema9}
  EMA 21:           ₹${rd.ema21}  ${rd.ema9 > rd.ema21 ? "→ EMA9 > EMA21 ✅ Bullish crossover" : "→ EMA9 < EMA21 ❌ Bearish crossover"}
  SMA 20:           ₹${rd.sma20}  → Price ${rd.aboveSma20 ? "ABOVE ✅" : "BELOW ❌"}
  SMA 50:           ₹${rd.sma50}  → Price ${rd.aboveSma50 ? "ABOVE ✅" : "BELOW ❌"}
  SMA 200:          ₹${rd.sma200} → Price ${rd.aboveSma200 ? "ABOVE ✅" : "BELOW ❌"}
  MA Alignment:     ${trendStrength}
  Golden/Death Cross: ${rd.goldenCross ? "✅ GOLDEN CROSS (50MA > 200MA) — major bullish signal" : "❌ DEATH CROSS (50MA < 200MA) — major bearish signal"}

▶ BOLLINGER BANDS (20,2)
  Upper Band:       ₹${rd.bb?.upper}
  Middle (SMA20):   ₹${rd.bb?.middle}
  Lower Band:       ₹${rd.bb?.lower}
  BB Width:         ${rd.bb ? ((rd.bb.upper - rd.bb.lower) / rd.bb.middle * 100).toFixed(1) : "N/A"}% ${rd.bb && (rd.bb.upper - rd.bb.lower) / rd.bb.middle < 0.05 ? "→ SQUEEZE — major move imminent" : ""}
  Price vs BB:      ${bbPos}

▶ VOLATILITY & STRUCTURE
  ATR 14-day:       ₹${rd.atr} (${rd.price ? (rd.atr / rd.price * 100).toFixed(1) : "N/A"}% of price — ${rd.atr / rd.price > 0.03 ? "HIGH volatility" : rd.atr / rd.price < 0.015 ? "LOW volatility" : "MODERATE volatility"})
  Nearest Support:  ₹${rd.sr?.support} (${((rd.price - rd.sr?.support) / rd.price * 100).toFixed(1)}% below)
  Nearest Resistance: ₹${rd.sr?.resistance} (${((rd.sr?.resistance - rd.price) / rd.price * 100).toFixed(1)}% above)

▶ PRE-CALCULATED LEVELS
  ATR Stop Loss:    ₹${rd.stopLoss} (1.5× ATR below price)
  Target 1:         ₹${rd.target1} (nearest resistance)
  Target 2:         ₹${rd.target2} (3× ATR extension)
  Implied R:R:      1:${rrRatio}

╔══════════════════════════════════════════════════╗
  Use ALL the above real data to generate your signal.
  Reference specific numbers. Do NOT invent prices.
╚══════════════════════════════════════════════════╝`;
      } else {
        userMessage = `Analyze ${stock.name} (${stock.symbol}) on NSE India. Sector: ${stock.sector}. Today: ${currentDate}. ⚠️ No real-time data available (add Twelve Data API key for real data). Use your training knowledge for an estimate and clearly note this in reasons.`;
      }

      const raw = await callSignl(userMessage, SIGNAL_PROMPT, 6000);
      const parsed = parseJSON(raw);
      if (!parsed) throw new Error("AI analysis failed — response truncated. Please retry.");

      const elliottWave = rd?.ohlcv ? detectElliottWave(rd.ohlcv.closes, rd.ohlcv.highs, rd.ohlcv.lows) : null;
      const finalData = {
        ...parsed,
        currentPrice: rd?.price ?? parsed.currentPrice,
        realData: rd,
        backtest: rd?.realBacktest || null,         // REAL backtest from historical data
        daysToEarnings: rd?.realEarnings?.daysToEarnings ?? null,  // REAL from Yahoo Finance
        earningsDate: rd?.realEarnings?.date ?? null,
        earningsWarning: rd?.realEarnings?.warning ?? null,
        elliottWave,
      };
      setSignalData(prev => ({ ...prev, [stock.symbol]: finalData }));
      setSelectedStock({ ...stock, data: finalData });
    } catch (e) {
      setSelectedStock({ ...stock, data: { error: true, msg: e.message } });
    }
    setLoadingStock(null);
    setFetchStatus("");
  }

  // ── SEARCH ANY STOCK ───────────────────────────────────────
  async function searchStock() {
    const q = searchQuery.trim().toUpperCase();
    if (!q) return;
    setSearchLoading(true);
    setSearchError("");
    setSearchResults([]);
    try {
      const raw = await callSignl(
        `The user searched for: "${q}". Find matching NSE/BSE India listed stocks. Return ONLY JSON, no markdown:
{ "found": true or false, "stocks": [{ "symbol": "<NSE symbol>", "name": "<full company name>", "sector": "<sector>", "exchange": "NSE" or "BSE" }] }
Return up to 6 matching stocks. If symbol is exact match put it first. If nothing matches, return found:false and empty array. Only real Indian listed companies.`,
        "You are an NSE/BSE stock database. Return only valid JSON. No markdown, no backticks."
      );
      const parsed = parseJSON(raw);
      if (!parsed || !parsed.found || !parsed.stocks?.length) {
        setSearchError(`No stocks found for "${q}". Try the NSE symbol like RELIANCE, INFY, HDFCBANK`);
      } else {
        setSearchResults(parsed.stocks);
      }
    } catch (e) {
      setSearchError("Search failed. Try typing the NSE symbol directly e.g. TATASTEEL");
    }
    setSearchLoading(false);
  }

  // ── SECTOR ROTATION SCANNER ───────────────────────────────
  async function loadTop5() {
    setLoadingTop5(true);
    setFetchStatus("🔍 Step 1/4 — Detecting sector momentum...");
    try {

      // ── SINGLE API CALL — all scanning done server-side in parallel ──────
      setFetchStatus("⚡ Scanning all sectors in parallel (server-side)...");

      const scanRes = await fetch(`${API_BASE}/scan`);
      if (!scanRes.ok) throw new Error("Scan API error " + scanRes.status);
      const scanData = await scanRes.json();
      if (!scanData.success) throw new Error(scanData.error || "Scan failed");

      const rankedSectors = scanData.topSectors || ["Banking","IT","Pharma"];
      setFetchStatus(`✅ ${scanData.note}`);

      const top5candidates = scanData.top10 || scanData.top5 || [];
      if (!top5candidates.length) throw new Error("No qualifying stocks found");

      setFetchStatus(`🧠 Running AI on top ${Math.min(top5candidates.length, 7)} candidates from ${rankedSectors.join(", ")}...`);

      // Build rich data context from scan results
      const realDataMap = {};
      const dataContext = top5candidates.slice(0, 7).map(stock => {
        const sym = stock.symbol;
        // Compute derived fields from real scan data
        const aboveSma50  = stock.sma50  ? stock.price > stock.sma50  : null;
        const aboveSma200 = stock.sma200 ? stock.price > stock.sma200 : null;
        // target2 = target1 + 1× ATR extension (real calculation)
        const target2 = stock.target1 && stock.atr
          ? Math.round((stock.target1 + stock.atr * 2) * 100) / 100
          : null;
        realDataMap[sym] = {
          price: stock.price, rsi14: stock.rsi,
          macd: { line: stock.macd, signal: stock.macd > 0 ? "Positive" : "Negative" },
          aboveSma50, aboveSma200, goldenCross: stock.goldenCross,
          atr: stock.atr, stoch: stock.stoch, volSignal: stock.volSignal, w52pos: stock.w52pos,
          stopLoss: stock.stopLoss, target1: stock.target1, target2,
          sma20: stock.sma20, sma50: stock.sma50, sma200: stock.sma200,
          sr: stock.sr, changePct: stock.changePct,
          high52w: stock.high52w, low52w: stock.low52w,
          cmf: stock.cmf, signal: stock.signal,
          trend: aboveSma200 ? "Bullish" : aboveSma50 ? "Moderately Bullish" : "Bearish",
          score: stock.score,
        };
        const rrRatio = stock.atr
          ? ((stock.target1 - stock.price) / Math.max(stock.price - stock.stopLoss, 1)).toFixed(1)
          : "N/A";
        return `${sym} [${stock.sector}] SignlScore=${stock.score} Signal=${stock.signal}:
  CMP=₹${stock.price} | Change=${stock.changePct}% | Volume=${stock.volSignal} | CMF=${stock.cmf}
  RSI=${stock.rsi} | MACD=${stock.macd > 0 ? "Positive" : "Negative"} | Stoch=${stock.stoch}
  SMA20=₹${stock.sma20} SMA50=₹${stock.sma50} (${aboveSma50?"ABOVE":"BELOW"}) SMA200=${stock.sma200 ? "₹"+stock.sma200+"("+(aboveSma200?"ABOVE":"BELOW")+")" : "N/A (6mo data)"}
  ATR=${stock.atr} | GoldenCross=${stock.goldenCross} | 52W_Position=${stock.w52pos}% (H:₹${stock.high52w} L:₹${stock.low52w})
  Support1=₹${stock.sr?.support1} Support2=₹${stock.sr?.support2}
  Resistance1=₹${stock.sr?.resistance1} Resistance2=₹${stock.sr?.resistance2}
  StopLoss=₹${stock.stopLoss} T1=₹${stock.target1} (+${stock.upsidePct}%, ${stock.target1Days}d) T2=₹${target2} (+${stock.upsidePct2}%)
  RiskReward=1:${stock.rr || rrRatio} | Upside_T1=${stock.upsidePct}% Upside_T2=${stock.upsidePct2}%`;
      }).join("\n\n");

      const raw = await callSignl(
        `Today is ${currentDate}. SECTOR SCAN complete. Top sectors: ${rankedSectors.join(", ")}.\n\nCANDIDATES (real NSE data, all parallel-fetched):\n${dataContext}\n\nPick the best 5. Use only these candidates. All data is real.`,
        TOP5_PROMPT,
        8000
      );
      const parsed = parseJSON(raw);

      if (!parsed) throw new Error("AI response was truncated or invalid. Please retry.");

      if (parsed.picks) {
        parsed.picks = parsed.picks.map(pick => {
          const rd = realDataMap[pick.symbol];
          if (rd) {
            pick.currentPrice = rd.price;
            pick.stopLoss     = rd.stopLoss;
            pick.target1      = rd.target1;
            pick.target2      = rd.target2;
            pick.realData     = rd;
            pick.signlScore  = rd.score || calcSignlScore(rd);
          }
          return pick;
        });
      }

      parsed.scannedCount = scanData.totalStocks || scanData.scannedCount || 0;
      parsed.topSectors = rankedSectors;
      setTop5(parsed);
      setFetchStatus("");
    } catch (e) { console.error(e); setFetchStatus(""); }
    setLoadingTop5(false);
  }

  // ── LOAD NEWS (real RSS → AI analysis) ────────────────────
  async function loadNews() {
    setLoadingNews(true);
    try {
      // Step 1: Fetch REAL headlines from RSS feeds
      const nr = await fetch(`${API_BASE}/news`);
      if (!nr.ok) throw new Error("News API error");
      const nj = await nr.json();
      if (!nj.success || !nj.articles?.length) throw new Error(nj.error || "No articles");

      const articles = nj.articles;

      // Step 2: Ask Claude to ANALYZE the real headlines (not invent them)
      const headlineList = articles.map((h,i) => `${i+1}. [${h.source}] ${h.title}`).join('\n');
      const raw = await callSignl(
        `Today is ${currentDate}. Here are REAL headlines from Indian financial RSS feeds:\n\n${headlineList}\n\nAnalyze each of these real headlines. Do not add or invent any headlines not in this list.`,
        NEWS_ANALYZE_PROMPT
      );
      const analyzed = parseJSON(raw);

      // Step 3: Merge real metadata (link, pubDate) with AI analysis
      const merged = (analyzed?.analyzedHeadlines || []).map((a, i) => ({
        ...a,
        link:    articles[i]?.link    || null,
        pubDate: articles[i]?.pubDate || null,
        sectors: articles[i]?.sectors || a.affectedSectors || [],
        rawSentiment: articles[i]?.sentiment || null,
      }));

      setNewsData({
        headlines: merged,
        keyRisk:         analyzed?.keyRisk         || null,
        keyOpportunity:  analyzed?.keyOpportunity  || null,
        sectorRotation:  analyzed?.sectorRotation  || null,
        fetchedAt:       nj.fetchedAt,
        sources:         nj.sources,
        isReal:          true,
        note:            `${articles.length} real headlines from ${nj.sources?.join(', ')}`,
      });
    } catch (e) {
      console.error(e);
      setNewsData({ error: e.message, headlines: [], isReal: false });
    }
    setLoadingNews(false);
  }

  // ── ASK SIGNL ─────────────────────────────────────────────
  async function askSignl() {
    if (!askQuery.trim()) return;
    setLoadingAsk(true);
    setAskResponse(null);
    try {
      const ans = await callSignl(
        askQuery,
        `You are SIGNL — India's elite AI stock advisor. Answer questions about Indian stocks, NSE/BSE markets, and trading strategy directly and expertly. Use Indian market context (Nifty, Sensex, SEBI, RBI). Be concise but insightful. End every response with: "⚠️ Educational signal only. Not SEBI-registered investment advice."`
      );
      setAskResponse(ans);
    } catch (e) {
      setAskResponse("Error: " + e.message);
    }
    setLoadingAsk(false);
  }

  // ── HELPERS ────────────────────────────────────────────────
  const sc = (s) => ({ "STRONG BUY": "#00ff87", "BUY": "#4ade80", "NEUTRAL": "#fbbf24", "AVOID": "#f87171", "STRONG AVOID": "#ff4444" }[s] || "#666");
  const mc = (m) => ({ "Bullish": "#00ff87", "Bearish": "#ff4444", "Cautious": "#fbbf24", "Neutral": "#94a3b8" }[m] || "#94a3b8");
  const rc = (r) => ({ "LOW": "#4ade80", "MEDIUM": "#fbbf24", "HIGH": "#f87171" }[r] || "#94a3b8");



  const tabs = [
    { id: "dashboard", label: "🌅 BRIEF" },
    { id: "top5", label: "🏆 TOP 5 PICKS" },
    { id: "signals", label: "📡 SIGNALS" },
    { id: "news", label: "🌐 NEWS" },
    { id: "portfolio", label: "💼 PORTFOLIO" },
    { id: "ask", label: "🧠 ASK SIGNL" },
  ];

  // ══════════════════════════════════════════════════════════
  // API KEY SETUP SCREEN
  // ══════════════════════════════════════════════════════════
  if (showApiSetup) {
    return (
      <div style={{ minHeight: "100vh", background: "#080c14", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono','Courier New',monospace", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 52, color: "#00ff87", marginBottom: 12 }}>ॐ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#00ff87", letterSpacing: "0.15em", marginBottom: 8 }}>SIGNL</div>
          <div style={{ fontSize: 11, color: "#475569", letterSpacing: "0.3em", marginBottom: 32 }}>INTELLIGENCE PLATFORM</div>

          <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 16, padding: 28 }}>
            <div style={{ fontSize: 14, color: "#f87171", fontWeight: 700, marginBottom: 12 }}>⚠️ API Key Not Configured</div>
            <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.8, marginBottom: 20 }}>
              Add your Anthropic API key to your local <span style={{ color: "#00ff87" }}>.env</span> file:
            </div>
            <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: 10, padding: "14px 18px", fontFamily: "monospace", fontSize: 12, color: "#00ff87", textAlign: "left", marginBottom: 20 }}>
              REACT_APP_ANTHROPIC_KEY=sk-ant-api03-...
            </div>
            <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.7 }}>
              Then run <span style={{ color: "#60a5fa" }}>npm run build</span> and <span style={{ color: "#60a5fa" }}>npx vercel --prod</span><br/>
              Your key stays local — never deployed to any server.
            </div>
            {apiError && <div style={{ color: "#f87171", fontSize: 11, marginTop: 12 }}>{apiError}</div>}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // MAIN APP
  // ══════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: "100vh", background: "#080c14", fontFamily: "'DM Mono','Courier New',monospace", color: "#e2e8f0", overflowX: "hidden" }}>
      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
        .fade { animation: fadeUp 0.4s ease; }
        button { cursor: pointer; transition: all 0.15s; }
        button:hover:not(:disabled) { opacity: 0.82; transform: translateY(-1px); }
        input { transition: border-color 0.2s; }
        input:focus { outline: none; border-color: rgba(0,255,135,0.4) !important; }
        textarea:focus { outline: none; border-color: rgba(0,255,135,0.4) !important; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #080c14; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
      `}</style>

      {/* Grid background */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "linear-gradient(rgba(0,255,135,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,135,0.02) 1px,transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }} />
      <div style={{ position: "fixed", top: -200, left: -200, width: 500, height: 500, background: "radial-gradient(circle,rgba(0,255,135,0.06) 0%,transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", bottom: -150, right: -150, width: 400, height: 400, background: "radial-gradient(circle,rgba(99,102,241,0.06) 0%,transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      {/* ── HEADER ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(8,12,20,0.97)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(0,255,135,0.1)", padding: "0 20px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 58 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#00ff87,#00c9ff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "#080c14" }}>ॐ</div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.12em", color: "#00ff87" }}>SIGNL</div>
                <div style={{ fontSize: 10, color: "#00ff87", fontWeight: 700 }}>{currentTime} IST</div>
              </div>
              <div style={{ fontSize: 8, color: "#334155", letterSpacing: "0.2em" }}>INTELLIGENCE</div>
            </div>
          </div>
          <nav style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); if (tab.id !== "signal") setSelectedStock(null); if (tab.id === "news" && !newsData) loadNews(); if (tab.id === "dashboard" && !marketMood) loadMarketMood(); if (tab.id === "top5" && !top5) loadTop5(); }}
                style={{ padding: "6px 12px", borderRadius: 6, border: "none", fontSize: 11, letterSpacing: "0.04em", fontFamily: "inherit", background: (activeTab === tab.id || (tab.id === "signals" && activeTab === "signal")) ? "rgba(0,255,135,0.12)" : "transparent", color: (activeTab === tab.id || (tab.id === "signals" && activeTab === "signal")) ? "#00ff87" : "#475569" }}>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px", position: "relative", zIndex: 1 }}>

        {/* ── TWELVE DATA KEY MODAL ── */}
        {showTdSetup && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
            <div style={{ background: "#0f172a", border: "1px solid rgba(0,255,135,0.2)", borderRadius: 20, padding: 36, maxWidth: 520, width: "100%" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📡</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc", marginBottom: 6 }}>Connect Real-Time NSE Data</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 20, lineHeight: 1.7 }}>
                Signl uses <strong style={{ color: "#00ff87" }}>Twelve Data</strong> to pull live NSE prices and compute real indicators from up to 252 days of actual price history — RSI, MACD, Bollinger Bands, ATR, Support/Resistance, Stochastic, VWAP & more.
              </div>
              <div style={{ background: "rgba(0,255,135,0.05)", border: "1px solid rgba(0,255,135,0.15)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: "#00ff87", marginBottom: 8, fontWeight: 700 }}>📋 Get your FREE key in 2 minutes:</div>
                <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 2 }}>
                  1. Go to <strong style={{ color: "#60a5fa" }}>twelvedata.com</strong><br/>
                  2. Click "Get free API key" → sign up free<br/>
                  3. Copy your key from dashboard<br/>
                  4. Paste below → Free = 800 calls/day ✅
                </div>
              </div>
              <input value={tdKeyInput} onChange={e => setTdKeyInput(e.target.value)} placeholder="Paste Twelve Data API key..."
                style={{ width: "100%", padding: "13px 16px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", fontSize: 13, fontFamily: "inherit", marginBottom: 14, boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { if (tdKeyInput.trim()) { setTwelveDataKey(tdKeyInput.trim()); setShowTdSetup(false); } }}
                  style={{ flex: 1, padding: 13, borderRadius: 10, background: "rgba(0,255,135,0.15)", border: "1px solid rgba(0,255,135,0.4)", color: "#00ff87", fontSize: 13, fontFamily: "inherit", fontWeight: 800 }}>
                  ✅ ACTIVATE LIVE DATA
                </button>
                <button onClick={() => setShowTdSetup(false)}
                  style={{ padding: "13px 20px", borderRadius: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "#475569", fontSize: 13, fontFamily: "inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── DASHBOARD TAB ── */}
        {activeTab === "dashboard" && (
          <div className="fade">
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>🌅 Morning Intelligence Brief</h1>
              <div style={{ fontSize: 12, color: "#475569" }}>{currentDate}</div>
            </div>

            {/* ── MARKET REGIME BANNER ── */}
            <div style={{ marginBottom: 16 }}>
              {loadingRegime && (
                <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 18px", fontSize: 11, color: "#475569" }}>
                  📡 Detecting market regime...
                </div>
              )}
              {niftyRegime && !loadingRegime && (
                <div style={{ background: `${niftyRegime.color}0d`, border: `1px solid ${niftyRegime.color}33`, borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 28 }}>{niftyRegime.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 9, letterSpacing: "0.2em", color: niftyRegime.color }}>MARKET REGIME</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: niftyRegime.color }}>{niftyRegime.regime}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{niftyRegime.advice}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "#475569", marginBottom: 4 }}>POSITION MULTIPLIER</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: niftyRegime.color }}>{niftyRegime.positionMult}×</div>
                    <button onClick={fetchNiftyRegime} style={{ fontSize: 9, color: "#475569", background: "none", border: "none", cursor: "pointer", marginTop: 4 }}>🔄 refresh</button>
                  </div>
                </div>
              )}
              {!niftyRegime && !loadingRegime && (
                <button onClick={fetchNiftyRegime} style={{ width: "100%", padding: "10px", borderRadius: 10, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8", fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                  🎯 Detect Today's Market Regime
                </button>
              )}
            </div>

            {!marketMood && !loadingMood && (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: 14, color: "#64748b", marginBottom: 20 }}>Signl is ready to analyze today's market for you.</div>
                <button onClick={() => loadMarketMood()} style={{ padding: "14px 32px", borderRadius: 12, background: "rgba(0,255,135,0.12)", border: "1px solid rgba(0,255,135,0.3)", color: "#00ff87", fontSize: 14, fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.1em" }}>
                  ⚡ GENERATE TODAY'S BRIEF
                </button>
              </div>
            )}

            {loadingMood && (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div style={{ fontSize: 36, display: "inline-block", animation: "spin 3s linear infinite", marginBottom: 16, color: "#00ff87" }}>ॐ</div>
                <div style={{ color: "#00ff87", fontSize: 12, letterSpacing: "0.2em" }}>SIGNL IS MEDITATING ON THE MARKETS...</div>
                <div style={{ color: "#334155", fontSize: 11, marginTop: 8 }}>Analyzing global cues • FII data • Macro signals</div>
              </div>
            )}

            {marketMood && !loadingMood && (
              <div style={{ display: "grid", gap: 16 }}>
                {/* Mood card */}
                <div style={{ background: `linear-gradient(135deg,${mc(marketMood.mood)}0d,rgba(8,12,20,0.9))`, border: `1px solid ${mc(marketMood.mood)}33`, borderRadius: 16, padding: 28 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.2em", marginBottom: 8 }}>TODAY'S MARKET MOOD</div>
                      <div style={{ fontSize: 42, fontWeight: 800, color: mc(marketMood.mood), letterSpacing: "-0.02em" }}>{marketMood.mood?.toUpperCase()}</div>
                      <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 12, maxWidth: 520, lineHeight: 1.75 }}>{marketMood.briefing}</div>
                    </div>
                    {marketMood.fearGreedIndex !== undefined && (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 9, color: "#64748b", marginBottom: 4 }}>FEAR & GREED ✅ REAL</div>
                        <div style={{ fontSize: 58, fontWeight: 800, color: marketMood.fearGreedIndex >= 60 ? "#00ff87" : marketMood.fearGreedIndex >= 40 ? "#fbbf24" : "#f87171", lineHeight: 1 }}>{marketMood.fearGreedIndex}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{marketMood.fearGreedLabel}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Real Global Markets Grid */}
                {marketMood.realMarkets && (
                  <div>
                    <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.15em", marginBottom: 10 }}>🌍 REAL GLOBAL MARKETS — Source: Yahoo Finance</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
                      {Object.entries(marketMood.realMarkets).slice(0, 10).map(([name, m]) => (
                        <div key={name} style={{ background: "rgba(15,23,42,0.8)", border: `1px solid ${m.changePct > 0 ? "rgba(74,222,128,0.12)" : m.changePct < 0 ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.05)"}`, borderRadius: 10, padding: "10px 12px" }}>
                          <div style={{ fontSize: 8, color: "#475569", marginBottom: 4 }}>{name}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{typeof m.price === 'number' ? m.price.toLocaleString('en-IN', {maximumFractionDigits: 2}) : m.price}</div>
                          <div style={{ fontSize: 10, color: m.changePct > 0 ? "#4ade80" : m.changePct < 0 ? "#f87171" : "#94a3b8", fontWeight: 600 }}>
                            {m.changePct > 0 ? "+" : ""}{m.changePct?.toFixed(2)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* VIX-based Nifty range + AI cues */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {marketMood.niftyRange && (
                    <>
                      <div style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 12, padding: 14 }}>
                        <div style={{ fontSize: 8, color: "#f87171", letterSpacing: "0.15em", marginBottom: 4 }}>NIFTY SUPPORT ✅ VIX-based</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "#f87171" }}>{marketMood.niftyRange.support?.toLocaleString("en-IN")}</div>
                      </div>
                      <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 14 }}>
                        <div style={{ fontSize: 8, color: "#64748b", letterSpacing: "0.15em", marginBottom: 4 }}>NIFTY PIVOT</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "#e2e8f0" }}>{marketMood.niftyRange.pivotPoint?.toLocaleString("en-IN")}</div>
                      </div>
                      <div style={{ background: "rgba(0,255,135,0.06)", border: "1px solid rgba(0,255,135,0.15)", borderRadius: 12, padding: 14 }}>
                        <div style={{ fontSize: 8, color: "#00ff87", letterSpacing: "0.15em", marginBottom: 4 }}>NIFTY RESISTANCE ✅ VIX-based</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "#00ff87" }}>{marketMood.niftyRange.resistance?.toLocaleString("en-IN")}</div>
                      </div>
                    </>
                  )}
                </div>

                {/* AI-generated cues (labeled clearly) */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div style={{ fontSize: 9, color: "#4488ff", letterSpacing: "0.15em", marginBottom: 8 }}>🌍 GLOBAL CUE</div>
                      <div style={{ fontSize: 8, color: "#334155" }}>AI summary of real data</div>
                    </div>
                    <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{marketMood.globalCue}</div>
                  </div>
                  <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div style={{ fontSize: 9, color: "#00ff87", letterSpacing: "0.15em", marginBottom: 8 }}>🇮🇳 DOMESTIC CUE</div>
                      <div style={{ fontSize: 8, color: "#334155" }}>AI summary of real data</div>
                    </div>
                    <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{marketMood.domesticCue}</div>
                  </div>
                </div>

                <button onClick={() => loadMarketMood()} style={{ padding: "10px", borderRadius: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.06)", color: "#334155", fontSize: 11, fontFamily: "inherit" }}>
                  🔄 Refresh Brief
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TOP 5 DAILY PICKS TAB ── */}
        {activeTab === "top5" && (
          <div className="fade">
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>🏆 Signl's Top 5 Daily Picks</h1>
                  <div style={{ fontSize: 12, color: "#475569" }}>
                    {top5?.scannedCount ? `✅ Scanned ${top5.scannedCount} stocks across top sectors: ${top5.topSectors?.join(", ")}` : "Sector Rotation → Stock Scanner → Elliott Wave → AI Ranked"}
                  </div>
                </div>
                {top5 && <button onClick={loadTop5} style={{ padding: "8px 18px", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "#334155", fontSize: 11, fontFamily: "inherit" }}>🔄 Re-scan</button>}
              </div>
            </div>

            {/* Generate button */}
            {!top5 && !loadingTop5 && (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🔭</div>
                <div style={{ fontSize: 15, color: "#64748b", marginBottom: 8, fontWeight: 700 }}>4-Step Institutional Scanner</div>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 20, lineHeight: 1.8, maxWidth: 420, margin: "0 auto 28px" }}>
                  1. Detect top performing sectors today<br/>
                  2. Scan 30–50 stocks within those sectors<br/>
                  3. Rank by Signl Score (11-factor model)<br/>
                  4. Run Elliott Wave + AI analysis on finalists
                </div>
                <button onClick={loadTop5} style={{ padding: "16px 40px", borderRadius: 14, background: "linear-gradient(135deg,rgba(0,255,135,0.15),rgba(0,201,255,0.1))", border: "1px solid rgba(0,255,135,0.35)", color: "#00ff87", fontSize: 15, fontFamily: "inherit", fontWeight: 800, letterSpacing: "0.1em" }}>
                  ⚡ START SECTOR SCAN
                </button>
              </div>
            )}

            {/* Loading with live status */}
            {loadingTop5 && (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div style={{ fontSize: 36, display: "inline-block", animation: "spin 2s linear infinite", marginBottom: 16, color: "#00ff87" }}>ॐ</div>
                <div style={{ color: "#00ff87", fontSize: 12, letterSpacing: "0.2em", marginBottom: 12 }}>SIGNL IS RUNNING THE SECTOR SCAN...</div>
                {fetchStatus && <div style={{ color: "#60a5fa", fontSize: 11, maxWidth: 400, margin: "0 auto" }}>{fetchStatus}</div>}
              </div>
            )}

            {/* Top 5 Results */}
            {top5 && !loadingTop5 && (
              <div>
                {/* Market condition banner */}
                <div style={{ background: "rgba(0,255,135,0.05)", border: "1px solid rgba(0,255,135,0.15)", borderRadius: 12, padding: "12px 18px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 18 }}>📡</span>
                  <div>
                    <div style={{ fontSize: 9, color: "#00ff87", letterSpacing: "0.2em", marginBottom: 2 }}>TODAY'S MARKET CONDITION</div>
                    <div style={{ fontSize: 13, color: "#94a3b8" }}>{top5.marketCondition}</div>
                  </div>
                  <div style={{ marginLeft: "auto", fontSize: 10, color: "#64748b" }}>Generated {top5.generatedAt}</div>
                </div>

                {/* Picks */}
                <div style={{ display: "grid", gap: 14 }}>
                  {top5.picks?.map((pick, i) => (
                    <div key={i} style={{
                      background: pick.signal === "STRONG BUY" ? "rgba(0,255,135,0.06)" : "rgba(74,222,128,0.04)",
                      border: `1px solid ${pick.signal === "STRONG BUY" ? "rgba(0,255,135,0.25)" : "rgba(74,222,128,0.15)"}`,
                      borderRadius: 16, padding: "22px 24px"
                    }}>
                      {/* Pick header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 12, background: i === 0 ? "linear-gradient(135deg,#ffd700,#ffaa00)" : i === 1 ? "linear-gradient(135deg,#c0c0c0,#888)" : i === 2 ? "linear-gradient(135deg,#cd7f32,#a0522d)" : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: i < 3 ? "#080c14" : "#475569", flexShrink: 0 }}>
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${pick.rank}`}
                          </div>
                          <div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc" }}>{pick.symbol}</div>
                            <div style={{ fontSize: 12, color: "#94a3b8" }}>{pick.name}</div>
                            <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(99,102,241,0.1)", color: "#818cf8" }}>{pick.sector}</span>
                              {pick.holdingPeriod && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>⏱ {pick.holdingPeriod}</span>}
                              {pick.positionSize && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(0,255,135,0.08)", color: "#4ade80" }}>💼 {pick.positionSize}</span>}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ padding: "8px 18px", borderRadius: 8, background: pick.signal === "STRONG BUY" ? "rgba(0,255,135,0.15)" : "rgba(74,222,128,0.12)", border: `1px solid ${pick.signal === "STRONG BUY" ? "rgba(0,255,135,0.4)" : "rgba(74,222,128,0.3)"}`, color: pick.signal === "STRONG BUY" ? "#00ff87" : "#4ade80", fontSize: 13, fontWeight: 800, letterSpacing: "0.08em" }}>
                            {pick.signal}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2 }}>SIGNL SCORE</div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: "#00ff87", lineHeight: 1 }}>{pick.score}</div>
                          </div>
                        </div>
                      </div>

                      {/* Trade setup — institutional angle */}
                      {pick.tradeSetup && (
                        <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "#a5b4fc" }}>
                          🏦 <strong>Trade Setup:</strong> {pick.tradeSetup}
                        </div>
                      )}

                      {/* Top reason */}
                      <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
                        💡 <span style={{ color: "#e2e8f0" }}>{pick.topReason}</span>
                      </div>

                      {/* Price boxes */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8, marginBottom: 14 }}>
                        {[
                          { label: "💰 CMP", color: "#e2e8f0", v1: `₹${(pick.realData?.price || pick.currentPrice)?.toLocaleString("en-IN")}`, v2: `${pick.realData?.changePct > 0 ? "+" : ""}${pick.realData?.changePct ?? ""}%` },
                          { label: "📍 ENTRY", color: "#60a5fa", v1: `₹${pick.entryZone?.low?.toLocaleString("en-IN")}`, v2: `– ₹${pick.entryZone?.high?.toLocaleString("en-IN")}` },
                          { label: "🛑 STOP LOSS", color: "#f87171", v1: `₹${pick.stopLoss?.toLocaleString("en-IN")}`, v2: pick.stopLossPercent },
                          { label: "🎯 TARGET 1", color: "#4ade80", v1: `₹${pick.target1?.toLocaleString("en-IN")}`, v2: `${pick.target1Percent} · ${pick.target1Days}d` },
                          { label: "🎯 TARGET 2", color: "#00ff87", v1: `₹${pick.target2?.toLocaleString("en-IN")}`, v2: `${pick.target2Percent} · ${pick.target2Days}d` },
                          { label: "📅 PEAK WINDOW", color: "#fbbf24", v1: pick.peakWindow, v2: `R:R ${pick.riskReward}` },
                        ].map(({ label, color, v1, v2 }) => (
                          <div key={label} style={{ background: `${color}08`, border: `1px solid ${color}22`, borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ fontSize: 7, color, letterSpacing: "0.15em", marginBottom: 6 }}>{label}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#f8fafc", marginBottom: 2 }}>{v1}</div>
                            <div style={{ fontSize: 10, color }}>{v2}</div>
                          </div>
                        ))}
                      </div>

                      {/* Technical confluence */}
                      {pick.technicalConfluence?.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.15em", marginBottom: 6 }}>⚡ TECHNICAL CONFLUENCE</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {pick.technicalConfluence.map((t, j) => (
                              <span key={j} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8" }}>📊 {t}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Institutional angle */}
                      {pick.institutionalAngle && (
                        <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 11, color: "#fbbf24" }}>
                          🏛️ <strong>Smart Money:</strong> {pick.institutionalAngle}
                        </div>
                      )}

                      {/* Catalysts + metadata */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.15em", marginBottom: 6 }}>KEY CATALYSTS</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {pick.catalysts?.map((c, j) => (
                              <span key={j} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: "rgba(0,255,135,0.07)", border: "1px solid rgba(0,255,135,0.15)", color: "#4ade80" }}>✓ {c}</span>
                            ))}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <div style={{ fontSize: 10, padding: "4px 12px", borderRadius: 6, background: pick.riskLevel === "LOW" ? "rgba(74,222,128,0.08)" : "rgba(251,191,36,0.08)", color: pick.riskLevel === "LOW" ? "#4ade80" : "#fbbf24", border: `1px solid ${pick.riskLevel === "LOW" ? "rgba(74,222,128,0.2)" : "rgba(251,191,36,0.2)"}` }}>
                            Risk: {pick.riskLevel}
                          </div>
                          <div style={{ fontSize: 10, padding: "4px 12px", borderRadius: 6, background: "rgba(0,255,135,0.08)", color: "#00ff87", border: "1px solid rgba(0,255,135,0.2)", fontWeight: 700 }}>
                            {pick.confidence} CONFIDENCE
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Disclaimer */}
                <div style={{ marginTop: 16, fontSize: 9, color: "#1e293b", textAlign: "center", padding: "12px", borderTop: "1px solid rgba(255,255,255,0.03)" }}>
                  ⚠️ {top5.disclaimer}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SIGNALS TAB ── */}
        {activeTab === "signals" && !selectedStock && (
          <div className="fade">
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>📡 Stock Signals</h1>
              <div style={{ fontSize: 12, color: "#475569" }}>Search any NSE/BSE stock or pick from the list below</div>
            </div>

            {/* ── SEARCH BAR ── */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "#334155" }}>🔍</span>
                  <input
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setSearchError(""); if (!e.target.value) setSearchResults([]); }}
                    onKeyDown={e => e.key === "Enter" && searchStock()}
                    placeholder="Search any stock — type name or NSE symbol e.g. Tata Steel, NESTLEIND, Maruti..."
                    style={{ width: "100%", padding: "13px 16px 13px 44px", borderRadius: 12, background: "rgba(15,23,42,0.9)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
                  />
                </div>
                <button onClick={searchStock} disabled={searchLoading || !searchQuery.trim()}
                  style={{ padding: "13px 26px", borderRadius: 12, background: searchLoading ? "rgba(0,255,135,0.04)" : "rgba(0,255,135,0.12)", border: "1px solid rgba(0,255,135,0.3)", color: "#00ff87", fontSize: 13, fontFamily: "inherit", fontWeight: 700, minWidth: 110, flexShrink: 0 }}>
                  {searchLoading ? "⟳ ..." : "SEARCH"}
                </button>
              </div>

              {/* Quick search chips */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ fontSize: 10, color: "#64748b", marginRight: 4, alignSelf: "center" }}>Quick:</span>
                {["TATASTEEL", "NESTLEIND", "MARUTI", "ONGC", "NTPC", "POWERGRID", "HCLTECH", "AXISBANK", "KOTAKBANK", "PIDILITIND", "DMART", "PAYTM"].map(sym => (
                  <button key={sym} onClick={() => { setSearchQuery(sym); setSearchResults([]); setSearchError(""); setTimeout(() => { setSearchQuery(sym); }, 0); }}
                    style={{ padding: "4px 12px", borderRadius: 20, background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)", color: "#818cf8", fontSize: 10, fontFamily: "inherit", cursor: "pointer" }}>
                    {sym}
                  </button>
                ))}
              </div>

              {/* Search error */}
              {searchError && (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", color: "#f87171", fontSize: 12 }}>
                  ⚠️ {searchError}
                </div>
              )}

              {/* Search results */}
              {searchResults.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.15em", marginBottom: 8 }}>SEARCH RESULTS — Click to analyse</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 8 }}>
                    {searchResults.map((stock, i) => {
                      const cached = signalData[stock.symbol];
                      const isLoading = loadingStock === stock.symbol;
                      return (
                        <button key={i} onClick={() => analyzeStock(stock)} disabled={isLoading}
                          style={{ padding: "16px 18px", borderRadius: 12, background: cached ? `${sc(cached.signal)}0d` : "rgba(0,255,135,0.04)", border: `1px solid ${cached ? sc(cached.signal) + "30" : "rgba(0,255,135,0.15)"}`, textAlign: "left", fontFamily: "inherit", color: "#e2e8f0", cursor: "pointer" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>{stock.symbol}</div>
                            <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 3, background: "rgba(0,255,135,0.1)", color: "#00ff87" }}>{stock.exchange}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>{stock.name}</div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, background: "rgba(99,102,241,0.1)", color: "#818cf8" }}>{stock.sector}</span>
                            {cached && <span style={{ fontSize: 10, fontWeight: 700, color: sc(cached.signal) }}>{cached.signal}</span>}
                            {isLoading && <span style={{ fontSize: 10, color: "#00ff87" }}>analysing...</span>}
                            {!cached && !isLoading && <span style={{ fontSize: 10, color: "#00ff87" }}>→ ANALYSE</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
              <span style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.15em" }}>QUICK ACCESS — POPULAR STOCKS</span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
            </div>

            {/* Default stock grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 8 }}>
              {STOCKS.map(stock => {
                const cached = signalData[stock.symbol];
                const isLoading = loadingStock === stock.symbol;
                return (
                  <button key={stock.symbol} onClick={() => analyzeStock(stock)} disabled={isLoading}
                    style={{ padding: "16px 18px", borderRadius: 12, background: cached ? `${sc(cached.signal)}0d` : "rgba(15,23,42,0.8)", border: `1px solid ${cached ? sc(cached.signal) + "30" : "rgba(255,255,255,0.06)"}`, textAlign: "left", fontFamily: "inherit", color: "#e2e8f0", cursor: "pointer" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc", marginBottom: 3 }}>{stock.symbol}</div>
                    <div style={{ fontSize: 11, color: "#475569", marginBottom: 10 }}>{stock.name}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 9, padding: "3px 8px", borderRadius: 4, background: "rgba(99,102,241,0.1)", color: "#818cf8" }}>{stock.sector}</span>
                      {cached && <span style={{ fontSize: 10, fontWeight: 700, color: sc(cached.signal) }}>{cached.signal}</span>}
                      {isLoading && <span style={{ fontSize: 10, color: "#00ff87" }}>analysing...</span>}
                      {!cached && !isLoading && <span style={{ fontSize: 10, color: "#64748b" }}>→ ANALYSE</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── SIGNAL DETAIL ── */}
        {activeTab === "signal" && selectedStock && (
          <div className="fade">
            <button onClick={() => { setActiveTab("signals"); setSelectedStock(null); }}
              style={{ marginBottom: 20, padding: "8px 16px", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "#64748b", fontSize: 11, fontFamily: "inherit" }}>
              ← Back to Signals
            </button>

            {/* Loading */}
            {loadingStock === selectedStock.symbol && (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div style={{ fontSize: 36, display: "inline-block", animation: "spin 2s linear infinite", marginBottom: 16, color: "#00ff87" }}>ॐ</div>
                <div style={{ color: "#00ff87", fontSize: 12, letterSpacing: "0.2em", marginBottom: 10 }}>ANALYZING {selectedStock.symbol}...</div>
                {fetchStatus
                  ? <div style={{ color: "#60a5fa", fontSize: 12, padding: "8px 20px", background: "rgba(96,165,250,0.06)", borderRadius: 8, display: "inline-block" }}>{fetchStatus}</div>
                  : <div style={{ color: "#64748b", fontSize: 11 }}>Processing technicals • Sentiment • Global cues</div>}
              </div>
            )}

            {/* Error */}
            {selectedStock.data?.error && (
              <div style={{ textAlign: "center", padding: 40, color: "#f87171" }}>
                <div style={{ fontSize: 16, marginBottom: 8 }}>⚠️ Signal generation failed</div>
                <div style={{ fontSize: 12, color: "#475569" }}>{selectedStock.data.msg}</div>
                <button onClick={() => analyzeStock(selectedStock)} style={{ marginTop: 20, padding: "10px 24px", borderRadius: 8, background: "rgba(0,255,135,0.1)", border: "1px solid rgba(0,255,135,0.3)", color: "#00ff87", fontFamily: "inherit" }}>Try Again</button>
              </div>
            )}

            {/* Signal Data */}
            {selectedStock.data && !selectedStock.data.error && !loadingStock && (() => {
              const d = selectedStock.data;
              return (
                <div>
                  {/* Header */}
                  <div style={{ background: `${sc(d.signal)}0a`, border: `1px solid ${sc(d.signal)}25`, borderRadius: 16, padding: "24px 28px", marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.2em", marginBottom: 6 }}>{selectedStock.sector} • NSE</div>
                        <div style={{ fontSize: 26, fontWeight: 800, color: "#f8fafc" }}>{selectedStock.name}</div>
                        <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{selectedStock.symbol}.NS</div>
                        <div style={{ marginTop: 10, fontSize: 20, fontWeight: 700, color: "#60a5fa" }}>₹{d.currentPrice?.toLocaleString("en-IN")}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-block", padding: "10px 22px", background: `${sc(d.signal)}18`, border: `1px solid ${sc(d.signal)}44`, borderRadius: 10, color: sc(d.signal), fontSize: 16, fontWeight: 800, letterSpacing: "0.1em", marginBottom: 10 }}>
                          {d.signal}
                        </div>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 4, background: "rgba(255,255,255,0.04)", color: rc(d.riskLevel) }}>Risk: {d.riskLevel}</span>
                          <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 4, background: "rgba(255,255,255,0.04)", color: "#94a3b8" }}>R:R {d.riskReward}</span>
                        </div>
                      </div>
                    </div>
                    {/* Score bar */}
                    <div style={{ marginTop: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 10 }}>
                        <span style={{ color: "#475569", letterSpacing: "0.1em" }}>SIGNL SCORE</span>
                        <span style={{ color: sc(d.signal), fontWeight: 700 }}>{d.score}/100</span>
                      </div>
                      <div style={{ height: 6, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${d.score}%`, background: `linear-gradient(90deg,${sc(d.signal)}80,${sc(d.signal)})`, borderRadius: 3, transition: "width 1s ease" }} />
                      </div>
                    </div>
                  </div>

                  {/* 4 Price Boxes */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
                    {[
                      { label: "📍 ENTRY ZONE", color: "#60a5fa", val1: `₹${d.entryZone?.low?.toLocaleString("en-IN")}`, val2: `to  ₹${d.entryZone?.high?.toLocaleString("en-IN")}`, sub: "Ideal buy range" },
                      { label: "🛑 STOP LOSS", color: "#f87171", val1: `₹${d.stopLoss?.price?.toLocaleString("en-IN")}`, val2: d.stopLoss?.percent, sub: "Exit if breached" },
                      { label: "🎯 TARGET 1", color: "#4ade80", val1: `₹${d.target1?.price?.toLocaleString("en-IN")}`, val2: d.target1?.percent, sub: `~${d.target1?.days} days — ${d.target1?.date}` },
                      { label: "🎯 TARGET 2", color: "#00ff87", val1: `₹${d.target2?.price?.toLocaleString("en-IN")}`, val2: d.target2?.percent, sub: `~${d.target2?.days} days — ${d.target2?.date}` },
                    ].map(({ label, color, val1, val2, sub }) => (
                      <div key={label} style={{ background: `${color}08`, border: `1px solid ${color}22`, borderRadius: 12, padding: 14 }}>
                        <div style={{ fontSize: 8, color, letterSpacing: "0.15em", marginBottom: 10 }}>{label}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc", marginBottom: 2 }}>{val1}</div>
                        <div style={{ fontSize: 12, color, marginBottom: 6 }}>{val2}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.5 }}>{sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Peak Estimate */}
                  <div style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                    <span style={{ fontSize: 22 }}>📅</span>
                    <div>
                      <div style={{ fontSize: 9, color: "#fbbf24", letterSpacing: "0.2em", marginBottom: 3 }}>ESTIMATED PEAK / REVERSAL WINDOW</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#f8fafc" }}>{d.peakDate}</div>
                    </div>
                    <div style={{ marginLeft: "auto", fontSize: 9, color: "#64748b", fontStyle: "italic" }}>AI pattern-based estimate</div>
                  </div>

                  {/* Real Data Badge */}
                  {d.realData && (
                    <div style={{ background: "rgba(0,255,135,0.05)", border: "1px solid rgba(0,255,135,0.2)", borderRadius: 10, padding: "10px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 16 }}>📡</span>
                      <span style={{ fontSize: 11, color: "#00ff87", fontWeight: 700 }}>REAL NSE DATA</span>
                      <span style={{ fontSize: 11, color: "#475569" }}>·</span>
                      <span style={{ fontSize: 11, color: "#64748b" }}>{d.realData.daysAnalyzed} trading days analyzed</span>
                      <span style={{ fontSize: 11, color: "#475569" }}>·</span>
                      <span style={{ fontSize: 11, color: "#64748b" }}>Source: Twelve Data (NSE Live)</span>
                      <span style={{ marginLeft: "auto", fontSize: 10, padding: "2px 10px", borderRadius: 20, background: "rgba(0,255,135,0.1)", color: "#00ff87", border: "1px solid rgba(0,255,135,0.2)" }}>LIVE ●</span>
                    </div>
                  )}

                  {/* Live Price Strip (if real data) */}
                  {d.realData && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8, marginBottom: 12 }}>
                      {[
                        { label: "DAY CHANGE", val: `${d.realData.change >= 0 ? "+" : ""}₹${d.realData.change}`, sub: `${d.realData.changePct >= 0 ? "+" : ""}${d.realData.changePct}%`, color: d.realData.change >= 0 ? "#4ade80" : "#f87171" },
                        { label: "DAY HIGH", val: `₹${d.realData.dayHigh?.toLocaleString("en-IN")}`, color: "#4ade80" },
                        { label: "DAY LOW", val: `₹${d.realData.dayLow?.toLocaleString("en-IN")}`, color: "#f87171" },
                        { label: "52W HIGH", val: `₹${d.realData.w52h?.toLocaleString("en-IN")}`, color: "#00ff87" },
                        { label: "52W LOW", val: `₹${d.realData.w52l?.toLocaleString("en-IN")}`, color: "#f87171" },
                        { label: "52W POSITION", val: `${d.realData.w52pos}%`, sub: "0=bottom 100=top", color: d.realData.w52pos > 70 ? "#fbbf24" : d.realData.w52pos < 30 ? "#4ade80" : "#94a3b8" },
                        { label: "VOLUME", val: (d.realData.volume / 1e5).toFixed(1) + "L", sub: d.realData.volSignal, color: d.realData.volSignal === "High" ? "#00ff87" : d.realData.volSignal === "Low" ? "#f87171" : "#94a3b8" },
                      ].map(({ label, val, sub, color }) => (
                        <div key={label} style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px" }}>
                          <div style={{ fontSize: 8, color: "#334155", letterSpacing: "0.12em", marginBottom: 6 }}>{label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color }}>{val}</div>
                          {sub && <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>{sub}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Technicals grid */}
                  <div style={{ display: "grid", gridTemplateColumns: d.realData ? "1fr 1fr 1fr" : "1fr 1fr", gap: 10, marginBottom: 12 }}>

                    {/* Momentum */}
                    <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 16 }}>
                      <div style={{ fontSize: 9, color: "#4488ff", letterSpacing: "0.15em", marginBottom: 12 }}>⚡ MOMENTUM</div>
                      {d.realData ? [
                        ["RSI 14", d.realData.rsi14, d.realData.rsi14 < 30 ? "#4ade80" : d.realData.rsi14 > 70 ? "#f87171" : "#fbbf24"],
                        ["RSI 7", d.realData.rsi7, d.realData.rsi7 < 30 ? "#4ade80" : d.realData.rsi7 > 70 ? "#f87171" : "#fbbf24"],
                        ["RSI 21", d.realData.rsi21, d.realData.rsi21 < 30 ? "#4ade80" : d.realData.rsi21 > 70 ? "#f87171" : "#fbbf24"],
                        ["MACD", d.realData.macd?.signal, d.realData.macd?.signal === "Positive" ? "#4ade80" : "#f87171"],
                        ["Stochastic", d.realData.stoch, d.realData.stoch < 20 ? "#4ade80" : d.realData.stoch > 80 ? "#f87171" : "#fbbf24"],
                        ["Trend", d.realData.trend, d.realData.trend?.includes("Bull") ? "#4ade80" : d.realData.trend?.includes("Bear") ? "#f87171" : "#fbbf24"],
                      ].map(([k, v, c]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 12 }}>
                          <span style={{ color: "#475569" }}>{k}</span>
                          <span style={{ color: c, fontWeight: 600 }}>{v}</span>
                        </div>
                      )) : [
                        ["RSI", d.technicals?.rsi, "#fbbf24"],
                        ["MACD", d.technicals?.macd, d.technicals?.macd === "Positive" ? "#4ade80" : "#f87171"],
                        ["Trend", d.technicals?.trend, d.technicals?.trend === "Bullish" ? "#4ade80" : "#f87171"],
                        ["Volume", d.technicals?.volume, "#94a3b8"],
                      ].map(([k, v, c]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 12 }}>
                          <span style={{ color: "#475569" }}>{k}</span>
                          <span style={{ color: c, fontWeight: 600 }}>{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Moving Averages */}
                    {d.realData && (
                      <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 16 }}>
                        <div style={{ fontSize: 9, color: "#c084fc", letterSpacing: "0.15em", marginBottom: 12 }}>📈 MOVING AVERAGES</div>
                        {[
                          ["SMA 20", `₹${d.realData.sma20}`, d.realData.aboveSma20 ? "#4ade80" : "#f87171", d.realData.aboveSma20 ? "↑" : "↓"],
                          ["SMA 50", `₹${d.realData.sma50}`, d.realData.aboveSma50 ? "#4ade80" : "#f87171", d.realData.aboveSma50 ? "↑" : "↓"],
                          ["SMA 200", `₹${d.realData.sma200}`, d.realData.aboveSma200 ? "#4ade80" : "#f87171", d.realData.aboveSma200 ? "↑" : "↓"],
                          ["EMA 9", `₹${d.realData.ema9}`, "#94a3b8", ""],
                          ["EMA 21", `₹${d.realData.ema21}`, "#94a3b8", ""],
                          ["Golden X", d.realData.goldenCross ? "YES ✅" : "NO ❌", d.realData.goldenCross ? "#4ade80" : "#f87171", ""],
                        ].map(([k, v, c, arrow]) => (
                          <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 12 }}>
                            <span style={{ color: "#475569" }}>{k}</span>
                            <span style={{ color: c, fontWeight: 600 }}>{arrow} {v}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Volatility & Bands */}
                    <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 16 }}>
                      <div style={{ fontSize: 9, color: "#fbbf24", letterSpacing: "0.15em", marginBottom: 12 }}>🎯 LEVELS & BANDS</div>
                      {d.realData ? [
                        ["BB Upper", `₹${d.realData.bb?.upper}`, "#f87171"],
                        ["BB Middle", `₹${d.realData.bb?.middle}`, "#94a3b8"],
                        ["BB Lower", `₹${d.realData.bb?.lower}`, "#4ade80"],
                        ["ATR 14d", `₹${d.realData.atr}`, "#fbbf24"],
                        ["VWAP", `₹${d.realData.vwap}`, "#60a5fa"],
                        ["Support", `₹${d.realData.sr?.support}`, "#4ade80"],
                        ["Resistance", `₹${d.realData.sr?.resistance}`, "#f87171"],
                      ].map(([k, v, c]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 12 }}>
                          <span style={{ color: "#475569" }}>{k}</span>
                          <span style={{ color: c, fontWeight: 600 }}>{v}</span>
                        </div>
                      )) : [
                        ["Sentiment", `${d.sentiment?.news}/100`, "#94a3b8"],
                        ["FII", d.sentiment?.fii, d.sentiment?.fii === "Buying" ? "#4ade80" : "#f87171"],
                        ["Retail", d.sentiment?.retail, "#94a3b8"],
                      ].map(([k, v, c]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 12 }}>
                          <span style={{ color: "#475569" }}>{k}</span>
                          <span style={{ color: c, fontWeight: 600 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── REAL BACKTEST RESULTS ── */}
                  {d.backtest && d.backtest.winRate !== null && (
                    <div style={{ background: "rgba(0,201,255,0.06)", border: "1px solid rgba(0,201,255,0.2)", borderRadius: 12, padding: 14, marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div style={{ fontSize: 9, color: "#67e8f9", letterSpacing: "0.15em" }}>📊 REAL HISTORICAL BACKTEST</div>
                        <div style={{ fontSize: 9, color: "#334155" }}>✅ Based on actual {d.backtest.dataYears}yr NSE data</div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 10 }}>
                        {[
                          ["Win Rate", `${d.backtest.winRate}%`, d.backtest.winRate >= 60 ? "#00ff87" : d.backtest.winRate >= 50 ? "#fbbf24" : "#f87171"],
                          ["Profit Factor", `${d.backtest.profitFactor}×`, d.backtest.profitFactor >= 1.5 ? "#00ff87" : d.backtest.profitFactor >= 1 ? "#fbbf24" : "#f87171"],
                          ["Avg Return", `${d.backtest.avgReturnPct > 0 ? "+" : ""}${d.backtest.avgReturnPct}%`, d.backtest.avgReturnPct > 0 ? "#00ff87" : "#f87171"],
                          ["Trades", `${d.backtest.totalTrades}`, "#67e8f9"],
                        ].map(([k, v, c]) => (
                          <div key={k} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: "#475569", marginBottom: 3 }}>{k}</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: c }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 8 }}>
                        {[
                          ["Avg Win", `+${d.backtest.avgWinPct}%`, "#4ade80"],
                          ["Avg Loss", `${d.backtest.avgLossPct}%`, "#f87171"],
                          ["Max Drawdown", `${d.backtest.maxDrawdownPct}%`, "#fb923c"],
                        ].map(([k, v, c]) => (
                          <div key={k} style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: "#475569", marginBottom: 2 }}>{k}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: c }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {d.backtest.recentTrades && (
                        <div>
                          <div style={{ fontSize: 9, color: "#475569", marginBottom: 6 }}>LAST 5 REAL TRADES</div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {d.backtest.recentTrades.map((t, i) => (
                              <span key={i} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 10, background: t.ret > 0 ? "rgba(0,255,135,0.1)" : "rgba(248,113,113,0.1)", color: t.ret > 0 ? "#00ff87" : "#f87171", border: `1px solid ${t.ret > 0 ? "rgba(0,255,135,0.2)" : "rgba(248,113,113,0.2)"}` }}>
                                {t.ret > 0 ? "+" : ""}{t.ret}% ({t.days}d)
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {d.backtest && d.backtest.winRate === null && (
                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 12, marginBottom: 12 }}>
                      <div style={{ fontSize: 10, color: "#475569" }}>📊 {d.backtest.note}</div>
                    </div>
                  )}

                  {/* ── REAL EARNINGS ALERT ── */}
                  {d.daysToEarnings !== null && d.daysToEarnings !== undefined && (
                    <div style={{ background: d.daysToEarnings <= 7 ? "rgba(248,113,113,0.08)" : "rgba(251,191,36,0.06)", border: `1px solid ${d.daysToEarnings <= 7 ? "rgba(248,113,113,0.3)" : "rgba(251,191,36,0.2)"}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 9, color: d.daysToEarnings <= 7 ? "#f87171" : "#fbbf24", letterSpacing: "0.15em", marginBottom: 4 }}>📅 EARNINGS ALERT — Source: Yahoo Finance</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: d.daysToEarnings <= 7 ? "#f87171" : "#fbbf24" }}>{d.earningsDate}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{d.earningsWarning || `Results in ${d.daysToEarnings} days`}</div>
                        </div>
                        <div style={{ fontSize: 36, fontWeight: 800, color: d.daysToEarnings <= 7 ? "#f87171" : "#fbbf24" }}>{d.daysToEarnings}d</div>
                      </div>
                    </div>
                  )}

                  {/* Position Sizing from Portfolio Risk Manager */}
                  {niftyRegime && d.entryZone && d.stopLoss && (
                    <div style={{ background: "rgba(0,255,135,0.04)", border: "1px solid rgba(0,255,135,0.15)", borderRadius: 12, padding: 14, marginBottom: 12 }}>
                      <div style={{ fontSize: 9, color: "#00ff87", letterSpacing: "0.15em", marginBottom: 8 }}>💼 POSITION SIZING — {niftyRegime.regime}</div>
                      {(() => {
                        const entry = d.entryZone?.high || d.currentPrice;
                        const stop = d.stopLoss?.price || d.stopLoss;
                        const riskPct = parseFloat(getPortfolioRisk(niftyRegime));
                        const sizing = getPositionSize(portfolioCapital, riskPct, entry, stop);
                        return (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                            {[
                              ["Risk Per Trade", `₹${sizing.riskAmount?.toLocaleString("en-IN")}`, "#f87171"],
                              ["Shares to Buy", `${sizing.shares}`, "#00ff87"],
                              ["Capital Required", `₹${sizing.amount?.toLocaleString("en-IN")}`, "#60a5fa"],
                            ].map(([k, v, c]) => (
                              <div key={k} style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: "#475569", marginBottom: 4 }}>{k}</div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: c }}>{v}</div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      <div style={{ marginTop: 10, fontSize: 10, color: "#64748b" }}>
                        Based on ₹{portfolioCapital.toLocaleString("en-IN")} capital × {getPortfolioRisk(niftyRegime)}% risk × {niftyRegime.positionMult}× regime multiplier
                      </div>
                    </div>
                  )}

                  {/* AI Summary */}
                  <div style={{ background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 12, padding: 16, marginBottom: 12, fontSize: 13, color: "#94a3b8", lineHeight: 1.7, fontStyle: "italic" }}>
                    🧠 {d.summary}
                  </div>

                  {/* ── ELLIOTT WAVE ANALYSIS ── */}
                  {d.elliottWave && (
                    <div style={{ background: d.elliottWave.isWave3 ? "rgba(0,255,135,0.06)" : d.elliottWave.isCorrective ? "rgba(248,113,113,0.05)" : "rgba(99,102,241,0.06)", border: `1px solid ${d.elliottWave.isWave3 ? "rgba(0,255,135,0.25)" : d.elliottWave.isCorrective ? "rgba(248,113,113,0.2)" : "rgba(99,102,241,0.2)"}`, borderRadius: 14, padding: 18, marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.2em", marginBottom: 6 }}>〰️ ELLIOTT WAVE ANALYSIS</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: d.elliottWave.isWave3 ? "#00ff87" : d.elliottWave.isCorrective ? "#f87171" : "#818cf8" }}>
                            {d.elliottWave.waveCount}
                            {d.elliottWave.isWave3 && <span style={{ fontSize: 11, marginLeft: 8, padding: "2px 8px", borderRadius: 4, background: "rgba(0,255,135,0.15)", color: "#00ff87" }}>⚡ MOST POWERFUL WAVE</span>}
                          </div>
                        </div>
                        <div style={{ padding: "6px 14px", borderRadius: 8, background: d.elliottWave.waveSignal === "STRONG BUY" ? "rgba(0,255,135,0.15)" : d.elliottWave.waveSignal === "BUY" ? "rgba(0,201,255,0.1)" : d.elliottWave.waveSignal === "TAKE PROFIT" ? "rgba(251,191,36,0.1)" : "rgba(248,113,113,0.1)", color: d.elliottWave.waveSignal === "STRONG BUY" ? "#00ff87" : d.elliottWave.waveSignal === "BUY" ? "#67e8f9" : d.elliottWave.waveSignal === "TAKE PROFIT" ? "#fbbf24" : "#f87171", fontSize: 11, fontWeight: 800, border: "1px solid currentColor" }}>
                          {d.elliottWave.waveSignal}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.7, marginBottom: 14 }}>{d.elliottWave.waveDescription}</div>

                      {/* Fibonacci Levels Grid */}
                      {d.elliottWave.fibLevels && (
                        <div>
                          <div style={{ fontSize: 9, color: "#fbbf24", letterSpacing: "0.15em", marginBottom: 10 }}>📐 FIBONACCI LEVELS</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 12 }}>
                            {[
                              ["23.6%", d.elliottWave.fibLevels.fib236, "#94a3b8"],
                              ["38.2%", d.elliottWave.fibLevels.fib382, "#60a5fa"],
                              ["50.0%", d.elliottWave.fibLevels.fib500, "#a78bfa"],
                              ["61.8%", d.elliottWave.fibLevels.fib618, "#fbbf24"],
                              ["78.6%", d.elliottWave.fibLevels.fib786, "#fb923c"],
                              ["127.2%", d.elliottWave.fibLevels.ext127, "#4ade80"],
                              ["161.8%", d.elliottWave.fibLevels.ext161, "#00ff87"],
                              ["261.8%", d.elliottWave.fibLevels.ext261, "#67e8f9"],
                            ].map(([label, val, color]) => (
                              <div key={label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                                <div style={{ fontSize: 8, color: "#475569", marginBottom: 3 }}>{label}</div>
                                <div style={{ fontSize: 12, fontWeight: 700, color }}>₹{val?.toLocaleString("en-IN")}</div>
                              </div>
                            ))}
                          </div>

                          {/* Golden Zone Highlight */}
                          <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div style={{ fontSize: 9, color: "#fbbf24", letterSpacing: "0.1em", marginBottom: 2 }}>🏅 GOLDEN ZONE (Best Buy Area)</div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#fde68a" }}>₹{d.elliottWave.keyLevels?.goldenZone?.high?.toLocaleString("en-IN")} – ₹{d.elliottWave.keyLevels?.goldenZone?.low?.toLocaleString("en-IN")}</div>
                            </div>
                            {d.elliottWave.waveTarget && (
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 9, color: "#4ade80", letterSpacing: "0.1em", marginBottom: 2 }}>WAVE TARGET</div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: "#00ff87" }}>₹{d.elliottWave.waveTarget?.toLocaleString("en-IN")}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Trade Setup + Pattern */}
                  {(d.tradeSetup || d.patternDetected) && (
                    <div style={{ display: "grid", gridTemplateColumns: d.tradeSetup && d.patternDetected ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 12 }}>
                      {d.tradeSetup && (
                        <div style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 12, padding: 14 }}>
                          <div style={{ fontSize: 9, color: "#818cf8", letterSpacing: "0.15em", marginBottom: 8 }}>🏦 TRADE SETUP</div>
                          <div style={{ fontSize: 12, color: "#a5b4fc", lineHeight: 1.6 }}>{d.tradeSetup}</div>
                        </div>
                      )}
                      {d.patternDetected && d.patternDetected !== "None" && (
                        <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 12, padding: 14 }}>
                          <div style={{ fontSize: 9, color: "#fbbf24", letterSpacing: "0.15em", marginBottom: 8 }}>📊 PATTERN DETECTED</div>
                          <div style={{ fontSize: 13, color: "#fde68a", fontWeight: 700 }}>{d.patternDetected}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Institutional View */}
                  {d.institutionalView && (
                    <div style={{ background: "rgba(0,201,255,0.05)", border: "1px solid rgba(0,201,255,0.15)", borderRadius: 12, padding: 14, marginBottom: 12 }}>
                      <div style={{ fontSize: 9, color: "#67e8f9", letterSpacing: "0.15em", marginBottom: 10 }}>🏛️ INSTITUTIONAL VIEW <span style={{fontSize:8,color:'#334155'}}>(AI estimate — not live FII data)</span></div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
                        {[
                          ["FII Sentiment", d.institutionalView.fiiSentiment, d.institutionalView.fiiSentiment === "Accumulating" ? "#4ade80" : d.institutionalView.fiiSentiment === "Distributing" ? "#f87171" : "#94a3b8"],
                          ["Sector Momentum", d.institutionalView.sectorMomentum, d.institutionalView.sectorMomentum === "Strong" ? "#4ade80" : d.institutionalView.sectorMomentum === "Negative" ? "#f87171" : "#fbbf24"],
                          ["Relative Strength", d.institutionalView.relativeStrength, d.institutionalView.relativeStrength?.includes("Out") ? "#4ade80" : "#94a3b8"],
                          ["Market Cap Bias", d.institutionalView.marketCapBias, "#67e8f9"],
                        ].map(([k, v, c]) => (
                          <div key={k} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em" }}>{k}</span>
                            <span style={{ fontSize: 11, color: c, fontWeight: 600 }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Technical Scores */}
                  {d.technicalScores && (
                    <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 14, marginBottom: 12 }}>
                      <div style={{ fontSize: 9, color: "#c084fc", letterSpacing: "0.15em", marginBottom: 10 }}>⚡ SCORING BREAKDOWN</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                        {[
                          ["Trend", d.technicalScores.trendScore, 25],
                          ["Momentum", d.technicalScores.momentumScore, 20],
                          ["Mean Rev.", d.technicalScores.meanReversionScore, 15],
                          ["Volume", d.technicalScores.volumeScore, 15],
                          ["Structure", d.technicalScores.structureScore, 15],
                          ["R:R", d.technicalScores.rrScore, 10],
                        ].map(([k, v, max]) => (
                          <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 9, color: "#475569" }}>{k}</span>
                              <span style={{ fontSize: 9, color: "#94a3b8" }}>{v}/{max}</span>
                            </div>
                            <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${(v/max)*100}%`, background: v/max > 0.7 ? "#00ff87" : v/max > 0.4 ? "#fbbf24" : "#f87171", borderRadius: 2 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Position sizing + holding period */}
                  {(d.positionSizing || d.holdingPeriod) && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                      {d.positionSizing && (
                        <div style={{ background: "rgba(0,255,135,0.05)", border: "1px solid rgba(0,255,135,0.15)", borderRadius: 10, padding: 12 }}>
                          <div style={{ fontSize: 9, color: "#4ade80", letterSpacing: "0.15em", marginBottom: 4 }}>💼 POSITION SIZE</div>
                          <div style={{ fontSize: 12, color: "#86efac" }}>{d.positionSizing}</div>
                        </div>
                      )}
                      {d.holdingPeriod && (
                        <div style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 10, padding: 12 }}>
                          <div style={{ fontSize: 9, color: "#fbbf24", letterSpacing: "0.15em", marginBottom: 4 }}>⏱ HOLDING PERIOD</div>
                          <div style={{ fontSize: 12, color: "#fde68a" }}>{d.holdingPeriod}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reasons + Risks */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ background: "rgba(0,255,135,0.04)", border: "1px solid rgba(0,255,135,0.1)", borderRadius: 12, padding: 16 }}>
                      <div style={{ fontSize: 9, color: "#00ff87", letterSpacing: "0.15em", marginBottom: 12 }}>✅ WHY {d.signal?.includes("BUY") ? "BUY" : "AVOID"}</div>
                      {d.reasons?.map((r, i) => <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}><span style={{ color: "#00ff87", flexShrink: 0 }}>✓</span>{r}</div>)}
                    </div>
                    <div style={{ background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.1)", borderRadius: 12, padding: 16 }}>
                      <div style={{ fontSize: 9, color: "#fbbf24", letterSpacing: "0.15em", marginBottom: 12 }}>⚠️ RISKS TO WATCH</div>
                      {d.risks?.map((r, i) => <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}><span style={{ color: "#fbbf24", flexShrink: 0 }}>!</span>{r}</div>)}
                    </div>
                  </div>

                  {/* Add to Portfolio */}
                  <button
                    onClick={() => { addToPortfolio(selectedStock, d); setActiveTab("portfolio"); }}
                    style={{ width: "100%", padding: "12px", borderRadius: 10, background: "rgba(0,255,135,0.1)", border: "1px solid rgba(0,255,135,0.3)", color: "#00ff87", fontSize: 12, fontFamily: "inherit", fontWeight: 700, cursor: "pointer", marginBottom: 10, letterSpacing: "0.1em" }}>
                    ➕ ADD TO PORTFOLIO TRACKER
                  </button>

                  <div style={{ marginTop: 4, fontSize: 9, color: "#1e293b", textAlign: "center", paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.03)" }}>
                    ⚠️ AI-generated signals for educational purposes only. NOT SEBI-registered investment advice. Trade at your own risk.
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── NEWS TAB ── */}
        {activeTab === "news" && (
          <div className="fade">
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>🌐 Market News Intelligence</h1>
              <div style={{ fontSize: 12, color: "#475569" }}>AI-analyzed global & Indian financial news and their impact</div>
            </div>

            {!newsData && !loadingNews && (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <button onClick={loadNews} style={{ padding: "14px 32px", borderRadius: 12, background: "rgba(0,255,135,0.1)", border: "1px solid rgba(0,255,135,0.3)", color: "#00ff87", fontSize: 14, fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.1em" }}>
                  ⚡ ANALYSE TODAY'S NEWS
                </button>
              </div>
            )}

            {loadingNews && (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div style={{ fontSize: 36, display: "inline-block", animation: "spin 3s linear infinite", marginBottom: 16, color: "#00ff87" }}>ॐ</div>
                <div style={{ color: "#00ff87", fontSize: 12, letterSpacing: "0.2em" }}>FETCHING LIVE HEADLINES FROM INDIAN FINANCIAL RSS FEEDS...</div>
              </div>
            )}

            {newsData && !loadingNews && (
              <div style={{ display: "grid", gap: 14 }}>
                {/* Data source badge */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: newsData.isReal ? "rgba(0,255,135,0.05)" : "rgba(248,113,113,0.05)", borderRadius: 10, border: `1px solid ${newsData.isReal ? "rgba(0,255,135,0.15)" : "rgba(248,113,113,0.2)"}` }}>
                  <div style={{ fontSize: 10, color: newsData.isReal ? "#00ff87" : "#f87171" }}>
                    {newsData.isReal ? "✅ REAL HEADLINES" : "⚠️ NEWS UNAVAILABLE"} — {newsData.note || ""}
                  </div>
                  <div style={{ fontSize: 9, color: "#334155" }}>{newsData.fetchedAt ? `Fetched ${new Date(newsData.fetchedAt).toLocaleTimeString('en-IN')}` : ""}</div>
                </div>

                {newsData.error && (
                  <div style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 12, padding: 16, color: "#f87171", fontSize: 12 }}>
                    Could not fetch news: {newsData.error}. Check your internet connection.
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ background: "rgba(0,255,135,0.04)", border: "1px solid rgba(0,255,135,0.1)", borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 9, color: "#00ff87", letterSpacing: "0.15em", marginBottom: 6 }}>💡 KEY OPPORTUNITY</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>{newsData.keyOpportunity || "—"}</div>
                  </div>
                  <div style={{ background: "rgba(248,113,113,0.04)", border: "1px solid rgba(248,113,113,0.1)", borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 9, color: "#f87171", letterSpacing: "0.15em", marginBottom: 6 }}>⚠️ KEY RISK</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>{newsData.keyRisk || "—"}</div>
                  </div>
                </div>

                {newsData.sectorRotation && (
                  <div style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 9, color: "#818cf8", letterSpacing: "0.15em", marginBottom: 6 }}>🔄 SECTOR ROTATION IN FOCUS</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{newsData.sectorRotation}</div>
                  </div>
                )}

                <div style={{ display: "grid", gap: 8 }}>
                  {newsData.headlines?.map((h, i) => (
                    <div key={i} style={{ background: "rgba(15,23,42,0.8)", border: `1px solid ${h.impact === "Positive" || h.impact === "Strongly Positive" ? "rgba(74,222,128,0.12)" : h.impact?.includes("Negative") ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.05)"}`, borderRadius: 12, padding: 16 }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 4, background: h.impact?.includes("Positive") ? "#4ade80" : h.impact?.includes("Negative") ? "#f87171" : "#fbbf24" }} />
                        <div style={{ flex: 1 }}>
                          {h.link ? (
                            <a href={h.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.5, textDecoration: "none" }}>{h.title}</a>
                          ) : (
                            <div style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.5 }}>{h.title}</div>
                          )}
                          <div style={{ fontSize: 10, color: "#334155", marginTop: 3 }}>
                            {h.source} {h.pubDate ? `• ${new Date(h.pubDate).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})}` : ""}
                          </div>
                        </div>
                      </div>
                      {h.whyItMatters && (
                        <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 8, paddingLeft: 20, lineHeight: 1.5 }}>💡 {h.whyItMatters}</div>
                      )}
                      {h.tradingAction && (
                        <div style={{ fontSize: 11, color: "#fbbf24", marginBottom: 8, paddingLeft: 20 }}>📊 {h.tradingAction}</div>
                      )}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 20 }}>
                        <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, background: h.impact?.includes("Positive") ? "rgba(74,222,128,0.1)" : h.impact?.includes("Negative") ? "rgba(248,113,113,0.1)" : "rgba(251,191,36,0.1)", color: h.impact?.includes("Positive") ? "#4ade80" : h.impact?.includes("Negative") ? "#f87171" : "#fbbf24" }}>{h.impact}</span>
                        <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, background: "rgba(255,255,255,0.03)", color: "#475569" }}>{h.timeframe}</span>
                        {h.affectedSectors?.map((s, j) => <span key={j} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, background: "rgba(99,102,241,0.1)", color: "#818cf8" }}>{s}</span>)}
                        {h.affectedStocks?.slice(0,3).map((s, j) => <span key={j} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, background: "rgba(0,255,135,0.06)", color: "#00ff87" }}>{s}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={loadNews} style={{ padding: "10px", borderRadius: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.06)", color: "#334155", fontSize: 11, fontFamily: "inherit" }}>
                  🔄 Refresh News
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── PORTFOLIO TAB ── */}
        {activeTab === "portfolio" && (
          <div className="fade">
            <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>💼 Portfolio Risk Manager</h1>
                <div style={{ fontSize: 12, color: "#475569" }}>Institutional position sizing • Sector limits • Drawdown protection</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#475569" }}>Capital:</span>
                <input
                  type="number"
                  value={portfolioCapital}
                  onChange={e => { setPortfolioCapital(parseFloat(e.target.value) || 500000); }}
                  style={{ width: 120, padding: "6px 10px", borderRadius: 8, background: "rgba(15,23,42,0.9)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0", fontSize: 12, fontFamily: "inherit" }}
                />
              </div>
            </div>

            {/* Regime + Risk Summary */}
            {niftyRegime && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
                {[
                  ["Market Regime", niftyRegime.regime, niftyRegime.color],
                  ["Risk Per Trade", `${getPortfolioRisk(niftyRegime)}%`, "#60a5fa"],
                  ["Position Mult", `${niftyRegime.positionMult}×`, niftyRegime.color],
                  ["Max Positions", `${Math.floor(1 / (parseFloat(getPortfolioRisk(niftyRegime)) / 100) * 0.3)}`, "#fbbf24"],
                ].map(([k, v, c]) => (
                  <div key={k} style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 14, textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em", marginBottom: 6 }}>{k}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Sector Concentration */}
            {portfolio.length > 0 && (
              <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 9, color: "#818cf8", letterSpacing: "0.15em", marginBottom: 12 }}>📊 SECTOR CONCENTRATION</div>
                {(() => {
                  const sectors = {};
                  portfolio.forEach(t => { sectors[t.sector] = (sectors[t.sector] || 0) + 1; });
                  const total = portfolio.length;
                  return Object.entries(sectors).map(([sector, count]) => {
                    const pct = Math.round(count / total * 100);
                    const overweight = pct > 40;
                    return (
                      <div key={sector} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: overweight ? "#f87171" : "#94a3b8" }}>{sector} {overweight ? "⚠️ OVERWEIGHT" : ""}</span>
                          <span style={{ fontSize: 11, color: overweight ? "#f87171" : "#64748b" }}>{pct}%</span>
                        </div>
                        <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2 }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: overweight ? "#f87171" : "#818cf8", borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* Open Trades */}
            {portfolio.length > 0 ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.15em", marginBottom: 4 }}>OPEN POSITIONS ({portfolio.length})</div>
                {portfolio.map((t) => {
                  const daysToE = getDaysToEarnings(t.symbol);
                  return (
                    <div key={t.id} style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14, padding: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 18, fontWeight: 800, color: "#f8fafc" }}>{t.symbol}</span>
                            {t.signal && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(0,255,135,0.1)", color: "#00ff87" }}>{t.signal}</span>}
                            {daysToE !== null && daysToE <= 7 && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(248,113,113,0.1)", color: "#f87171" }}>⚠️ Earnings {daysToE}d</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "#475569" }}>{t.sector} • Entered {t.date}</div>
                        </div>
                        <button onClick={() => removeFromPortfolio(t.id)} style={{ padding: "4px 12px", borderRadius: 6, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171", fontSize: 10, fontFamily: "inherit", cursor: "pointer" }}>✕ Remove</button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginTop: 12 }}>
                        {[
                          ["Entry", `₹${t.entry?.toLocaleString("en-IN")}`, "#60a5fa"],
                          ["Stop", `₹${t.stop?.toLocaleString("en-IN")}`, "#f87171"],
                          ["Target 1", `₹${t.target1?.toLocaleString("en-IN")}`, "#4ade80"],
                          ["Shares", t.shares, "#94a3b8"],
                          ["At Risk", `₹${t.riskAmount?.toLocaleString("en-IN")}`, "#fbbf24"],
                        ].map(([k, v, c]) => (
                          <div key={k} style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: "#475569", marginBottom: 3 }}>{k}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>📭</div>
                <div style={{ fontSize: 14, color: "#64748b", marginBottom: 8 }}>No open positions</div>
                <div style={{ fontSize: 12, color: "#334155" }}>Analyze a stock in Signals tab and add it to your portfolio</div>
              </div>
            )}
          </div>
        )}

        {/* ── ASK SIGNL TAB ── */}
        {activeTab === "ask" && (
          <div className="fade">
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>🧠 Ask Signl</h1>
              <div style={{ fontSize: 12, color: "#475569" }}>Your personal AI market advisor — ask anything about stocks or trading strategy</div>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <input value={askQuery} onChange={e => setAskQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && askSignl()}
                placeholder="e.g. Should I hold Infosys? What will RBI rate cut do to banking stocks?"
                style={{ flex: 1, minWidth: 260, padding: "13px 16px", borderRadius: 10, background: "rgba(15,23,42,0.9)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0", fontSize: 13, fontFamily: "inherit" }} />
              <button onClick={askSignl} disabled={loadingAsk}
                style={{ padding: "13px 28px", borderRadius: 10, background: loadingAsk ? "rgba(0,255,135,0.04)" : "rgba(0,255,135,0.12)", border: "1px solid rgba(0,255,135,0.3)", color: "#00ff87", fontSize: 13, fontFamily: "inherit", fontWeight: 700, minWidth: 120 }}>
                {loadingAsk ? "⟳ Thinking..." : "ASK →"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
              {["Best stocks this week?", "How to set a stop loss?", "Is Nifty bullish now?", "Explain FII vs DII"].map((q, i) => (
                <button key={i} onClick={() => setAskQuery(q)} style={{ padding: "6px 14px", borderRadius: 20, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8", fontSize: 11, fontFamily: "inherit" }}>{q}</button>
              ))}
            </div>
            {askResponse && (
              <div style={{ background: "rgba(0,255,135,0.04)", border: "1px solid rgba(0,255,135,0.15)", borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: 9, color: "#64748b", letterSpacing: "0.2em", marginBottom: 14 }}>ॐ SIGNL SAYS</div>
                <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.85, whiteSpace: "pre-wrap" }}>{askResponse}</div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
