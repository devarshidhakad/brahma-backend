/**
 * SIGNL — Shared API Layer (Mobile)
 * Same backend as web app. Same Lambda endpoints. Real data only.
 * API_BASE points to same API Gateway.
 */

const API_BASE = 'https://dlh8hd7xsj.execute-api.ap-south-1.amazonaws.com';

// ── CORE AI CALL — same as web callSignl ────────────────────
export async function callSignl(userMessage, systemPrompt, maxTokens = 4000) {
  const response = await fetch(`${API_BASE}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: userMessage, systemPrompt, maxTokens }),
  });
  if (!response.ok) throw new Error('Backend error ' + response.status);
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  if (!data.answer) throw new Error('No answer from backend');
  return data.answer;
}

// ── FETCH NIFTY REGIME ────────────────────────────────────────
export async function fetchNiftyRegime() {
  const res = await fetch(`${API_BASE}/nifty`);
  if (!res.ok) throw new Error('Nifty API error ' + res.status);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Nifty fetch failed');
  return json;
}

// ── FETCH STOCK SIGNAL ────────────────────────────────────────
export async function fetchSignal(symbol) {
  const res = await fetch(`${API_BASE}/signal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol }),
  });
  if (!res.ok) throw new Error('Signal API error ' + res.status);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Signal fetch failed');
  return json;
}

// ── FETCH TOP 5 SCAN ──────────────────────────────────────────
export async function fetchScan() {
  const res = await fetch(`${API_BASE}/scan`);
  if (!res.ok) throw new Error('Scan API error ' + res.status);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Scan failed');
  return json;
}

// ── FETCH NEWS ────────────────────────────────────────────────
export async function fetchNews() {
  const res = await fetch(`${API_BASE}/news`);
  if (!res.ok) throw new Error('News API error ' + res.status);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'News fetch failed');
  return json;
}

// ── FETCH SECTOR RANKINGS ─────────────────────────────────────
export async function fetchSectors() {
  const res = await fetch(`${API_BASE}/sector`);
  if (!res.ok) throw new Error('Sector API error ' + res.status);
  const json = await res.json();
  return json;
}

// ── PARSE JSON FROM CLAUDE RESPONSE ──────────────────────────
export function parseJSON(raw) {
  try {
    if (!raw || typeof raw !== 'string' || raw.trim() === '') return null;
    const clean = raw.replace(/```json|```/g, '').trim();
    const obj = clean.match(/\{[\s\S]*\}/);
    const arr = clean.match(/\[[\s\S]*\]/);
    try { if (obj) return JSON.parse(obj[0]); } catch (e) {}
    try { if (arr) return JSON.parse(arr[0]); } catch (e) {}
    return JSON.parse(clean);
  } catch (e) {
    console.error('[parseJSON] failed:', raw?.slice(0, 100), e.message);
    return null;
  }
}

// ── DETECT MARKET REGIME ──────────────────────────────────────
export function detectRegime(niftyData) {
  if (!niftyData) return { regime: 'UNKNOWN', color: '#94a3b8', emoji: '❓', advice: 'Fetching...', positionMult: 0.75 };
  const { price, sma50, sma200, atr } = niftyData;
  const volatility = atr / price;
  if (volatility > 0.015) return { regime: 'HIGH VOLATILITY', color: '#f87171', emoji: '⚡', advice: 'Reduce position sizes 50%. Only STRONG BUY signals.', positionMult: 0.5 };
  if (price > sma50 && price > sma200 && sma50 > sma200) return { regime: 'BULL MARKET', color: '#00ff87', emoji: '🐂', advice: 'Full position sizes. Ride momentum. Hold to Target 2.', positionMult: 1.0 };
  if (price < sma50 && price < sma200 && sma50 < sma200) return { regime: 'BEAR MARKET', color: '#f87171', emoji: '🐻', advice: 'Half positions only. Only STRONG BUY. Exit at Target 1.', positionMult: 0.4 };
  if (price > sma200 && price < sma50) return { regime: 'PULLBACK IN UPTREND', color: '#fbbf24', emoji: '📉', advice: 'Good buying opportunity. Wait for bounce.', positionMult: 0.75 };
  if (price < sma200 && price > sma50) return { regime: 'RELIEF RALLY', color: '#fb923c', emoji: '📈', advice: 'Caution. Short-term bounce only.', positionMult: 0.5 };
  return { regime: 'SIDEWAYS', color: '#60a5fa', emoji: '↔️', advice: 'Range-bound. Buy support, sell resistance.', positionMult: 0.65 };
}
