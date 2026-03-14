/**
 * BRAHMA INTELLIGENCE — Nifty 500 Fetcher Lambda
 * Runs daily at 6:00 AM IST via EventBridge Scheduler.
 *
 * Fetches the OFFICIAL Nifty 500 constituents list from niftyindices.com.
 * This works from an AWS IP (unlike Vercel serverless which gets blocked).
 *
 * Stores result in S3 as: nifty500/nifty500_YYYY-MM-DD.json
 * Also overwrites: nifty500/nifty500_latest.json
 *
 * The stock universe is NEVER hardcoded anywhere in this codebase.
 * If this Lambda fails, the scan-lambda will use the most recent successful fetch.
 */

'use strict';

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });

const BUCKET = process.env.UNIVERSE_BUCKET || 'brahma-universe';

// Official Nifty 500 CSV URL
const NIFTY500_URL = 'https://archives.nseindia.com/content/indices/ind_nifty500list.csv';

/**
 * Parse the Nifty 500 CSV.
 * Format: Company Name,Industry,Symbol,ISIN Code,Series
 * Returns array of { symbol, name, industry }
 */
function parseNifty500CSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV has fewer than 2 lines');

  // Skip header row
  const stocks = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle quoted fields
    const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
    if (parts.length < 3) continue;

    const name     = parts[0];
    const industry = parts[1];
    const symbol   = parts[2];

    if (!symbol || symbol.length < 1) continue;
    // Filter out index lines or malformed entries
    if (symbol === 'Symbol' || !/^[A-Z0-9&-]+$/.test(symbol)) continue;

    stocks.push({ symbol, name, industry });
  }

  if (stocks.length < 100) {
    throw new Error(`Only ${stocks.length} stocks parsed — CSV may have changed format`);
  }

  return stocks;
}

/**
 * Group stocks by sector (industry → our sector names)
 */
function groupBySector(stocks) {
  const sectorMap = {
    'BANK': 'Banking', 'FINANCIAL': 'Finance', 'FINANCE': 'Finance',
    'INFORMATION TECHNOLOGY': 'IT', 'IT-': 'IT', 'SOFTWARE': 'IT',
    'PHARMACEUTICAL': 'Pharma', 'PHARMACEUTICALS': 'Pharma', 'HEALTHCARE': 'Pharma',
    'AUTOMOBILE': 'Auto', 'AUTO': 'Auto',
    'OIL': 'Energy', 'GAS': 'Energy', 'ENERGY': 'Energy', 'POWER': 'Energy',
    'FAST MOVING': 'FMCG', 'FMCG': 'FMCG',
    'CONSTRUCTION': 'Infra', 'CEMENT': 'Infra', 'INFRASTRUCTURE': 'Infra',
    'METALS': 'Metal', 'MINING': 'Metal', 'STEEL': 'Metal',
    'REAL ESTATE': 'Realty', 'REALTY': 'Realty',
    'TELECOM': 'Telecom', 'TELECOMMUNICATION': 'Telecom',
    'CONSUMER': 'Consumer', 'MEDIA': 'Consumer',
  };

  const grouped = {};
  stocks.forEach(({ symbol, name, industry }) => {
    const industryUpper = (industry || '').toUpperCase();
    let sector = 'Others';
    for (const [key, val] of Object.entries(sectorMap)) {
      if (industryUpper.includes(key)) {
        sector = val;
        break;
      }
    }
    if (!grouped[sector]) grouped[sector] = [];
    grouped[sector].push({ symbol, name, industry });
  });

  return grouped;
}

module.exports.handler = async (event) => {
  console.log('[NIFTY500-FETCHER] Starting fetch at', new Date().toISOString());

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  try {
    // Fetch official CSV from niftyindices.com
    const response = await fetch(NIFTY500_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/csv,text/plain,*/*',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`niftyindices.com returned ${response.status}`);
    }

    const csvText = await response.text();
    console.log(`[NIFTY500-FETCHER] Downloaded ${csvText.length} bytes`);

    // Parse CSV
    const stocks = parseNifty500CSV(csvText);
    console.log(`[NIFTY500-FETCHER] Parsed ${stocks.length} stocks`);

    const bySector = groupBySector(stocks);

    const payload = {
      fetchedAt:   new Date().toISOString(),
      date:        today,
      totalStocks: stocks.length,
      source:      'https://archives.nseindia.com/content/indices/ind_nifty500list.csv',
      stocks,      // flat array: [{ symbol, name, industry }]
      bySector,    // grouped by our sector names
    };

    const bodyStr = JSON.stringify(payload, null, 2);

    // Write dated file
    await s3.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         `nifty500/nifty500_${today}.json`,
      Body:        bodyStr,
      ContentType: 'application/json',
    }));

    // Overwrite latest
    await s3.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         'nifty500/nifty500_latest.json',
      Body:        bodyStr,
      ContentType: 'application/json',
    }));

    console.log(`[NIFTY500-FETCHER] Saved ${stocks.length} stocks to S3`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        date: today,
        totalStocks: stocks.length,
        sectors: Object.keys(bySector).map(s => ({ sector: s, count: bySector[s].length })),
      }),
    };

  } catch (err) {
    console.error('[NIFTY500-FETCHER] Error:', err.message);
    // Non-fatal: log and exit. Next day's cron will retry.
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
