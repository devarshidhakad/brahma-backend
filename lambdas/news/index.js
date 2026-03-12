/**
 * BRAHMA INTELLIGENCE — News Lambda
 * GET /news
 *
 * Fetches real headlines from ET Markets + Moneycontrol + LiveMint RSS.
 * Passes ONLY real headlines to Claude — not invented.
 * Claude analyzes sector impact and trade actions.
 * Cached 30 minutes.
 */

'use strict';

const { getSecrets }           = require('../shared/secrets');
const { cacheGet, cacheSet }   = require('../shared/cache');

const RSS_FEEDS = [
  {
    name: 'Economic Times Markets',
    url: 'https://economictimes.indiatimes.com/markets/rss.cms',
  },
  {
    name: 'Moneycontrol Markets',
    url: 'https://www.moneycontrol.com/rss/marketsindia.xml',
  },
  {
    name: 'LiveMint Markets',
    url: 'https://www.livemint.com/rss/markets',
  },
];

/**
 * Parse RSS XML to extract headlines.
 * Uses simple regex — avoids needing xml2js as a Lambda dependency.
 */
function parseRSS(xmlText, sourceName) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xmlText)) !== null && items.length < 6) {
    const item = match[1];
    const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
    const descMatch  = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/);
    const pubMatch   = item.match(/<pubDate>(.*?)<\/pubDate>/);
    const title = titleMatch ? (titleMatch[1] || titleMatch[2] || '').trim() : '';
    const desc  = descMatch  ? (descMatch[1]  || descMatch[2]  || '').trim() : '';
    const pubDate = pubMatch ? pubMatch[1].trim() : '';
    if (title && title.length > 10) {
      items.push({ title, description: desc.slice(0, 200), pubDate, source: sourceName });
    }
  }
  return items;
}

/**
 * Fetch all RSS feeds in parallel.
 */
async function fetchAllNews() {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async ({ name, url }) => {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml, text/xml' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
      const text = await response.text();
      return parseRSS(text, name);
    })
  );

  const all = [];
  results.forEach(r => {
    if (r.status === 'fulfilled') all.push(...r.value);
  });

  // Deduplicate by similar title (simple check)
  const seen = new Set();
  return all.filter(item => {
    const key = item.title.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}

const NEWS_PROMPT = `You are BRAHMA — chief news analyst for Indian equity markets.

You are given REAL headlines fetched live from ET Markets, Moneycontrol, and LiveMint RSS feeds.
Every headline below is real. Do not invent headlines. Do not change what the headlines say.

YOUR RULES:
1. Use ONLY the headlines provided — no invented news.
2. FII/DII data is not available. Do not mention specific FII flows unless a headline explicitly states them.
3. Label your analysis as AI inference, not fact.
4. Trade actions must cite which specific headline prompted them.

Return ONLY valid JSON, no markdown, no backticks:
{
  "headlines": [
    {
      "title": "<exact headline from input — do not change>",
      "source": "<source name from input>",
      "impact": "Strongly Positive" | "Positive" | "Neutral" | "Negative" | "Strongly Negative",
      "affectedSectors": ["<sector1>", "<sector2>"],
      "affectedStocks": ["<SYMBOL1>", "<SYMBOL2>"],
      "severity": <1-5>,
      "tradeAction": "<specific action citing the headline: e.g. 'Monitor HDFCBANK — RBI policy positive for banking'>",
      "timeframe": "Intraday" | "This week" | "This month"
    }
  ],
  "overallSentiment": <0-100>,
  "indianMarketImpact": "<2 sentences based only on the real headlines above>",
  "keyRisk": "<biggest risk visible in today's headlines>",
  "keyOpportunity": "<biggest opportunity visible in today's headlines>",
  "sectorFlow": "<which sectors appear to have positive/negative news today based on headlines>",
  "analysisNote": "AI inference from real headlines. Not investment advice. Not SEBI-registered."
}`;

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

  const cacheKey = 'news:latest';
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return { statusCode: 200, headers, body: JSON.stringify({ ...cached, fromCache: true }) };
  }

  try {
    // Fetch real headlines
    const headlines = await fetchAllNews();
    if (headlines.length === 0) {
      throw new Error('All RSS feeds failed — no headlines available');
    }

    console.log(`[NEWS] Fetched ${headlines.length} real headlines`);

    const { anthropicKey } = await getSecrets();

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `${NEWS_PROMPT}\n\nREAL HEADLINES:\n${JSON.stringify(headlines, null, 2)}`,
        }],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!claudeResponse.ok) {
      throw new Error(`Claude API error: ${claudeResponse.status}`);
    }

    const claudeData = await claudeResponse.json();
    const rawText = claudeData.content?.[0]?.text || '';
    let analysis;
    try {
      analysis = JSON.parse(rawText);
    } catch (_) {
      analysis = { error: 'Claude returned non-JSON', rawHeadlines: headlines };
    }

    const result = {
      success: true,
      generatedAt: new Date().toISOString(),
      rawHeadlines: headlines,
      analysis,
      feedsUsed: RSS_FEEDS.map(f => f.name),
      fromCache: false,
    };

    await cacheSet(cacheKey, result, 1800); // 30 minutes

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    console.error('[NEWS] Error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
