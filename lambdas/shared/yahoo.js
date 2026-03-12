/**
 * BRAHMA INTELLIGENCE — Yahoo Finance Data Fetcher
 * All market data comes from Yahoo Finance v8 chart API.
 * No paid data sources. No hardcoded prices.
 */

'use strict';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

/**
 * Fetch OHLCV data for a single NSE/BSE stock.
 * @param {string} symbol  - NSE symbol without .NS suffix
 * @param {string} range   - '2y' for signal engine, '6mo' for scan
 * @param {string} interval - '1d'
 * @returns {object|null}  - parsed OHLCV + meta, or null on failure
 */
async function fetchStockData(symbol, range = '2y', interval = '1d') {
  const nseSymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;
  const url = `${BASE}/${encodeURIComponent(nseSymbol)}?interval=${interval}&range=${range}`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      // Try BSE if NSE fails
      if (!symbol.includes('.')) {
        return fetchStockData(`${symbol}.BO`, range, interval);
      }
      return null;
    }

    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const timestamps = result.timestamp || [];
    const q = result.indicators?.quote?.[0];
    const adjClose = result.indicators?.adjclose?.[0]?.adjclose;

    if (!q || !timestamps.length) return null;

    // Build clean OHLCV array — filter out null bars
    const bars = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (q.close[i] == null || q.open[i] == null) continue;
      bars.push({
        time: timestamps[i],
        open:   Math.round(q.open[i]   * 100) / 100,
        high:   Math.round(q.high[i]   * 100) / 100,
        low:    Math.round(q.low[i]    * 100) / 100,
        close:  Math.round(q.close[i]  * 100) / 100,
        volume: q.volume[i] || 0,
        adjClose: adjClose ? Math.round(adjClose[i] * 100) / 100 : null,
      });
    }

    if (bars.length < 30) return null;

    // Earnings data if available
    let earningsDate = null;
    let daysToEarnings = null;
    try {
      const earningsResult = json?.chart?.result?.[0]?.events?.earnings;
      if (earningsResult) {
        const future = Object.values(earningsResult)
          .filter(e => e.date * 1000 > Date.now())
          .sort((a, b) => a.date - b.date);
        if (future.length > 0) {
          earningsDate = new Date(future[0].date * 1000).toISOString().split('T')[0];
          daysToEarnings = Math.ceil((future[0].date * 1000 - Date.now()) / 86400000);
        }
      }
    } catch (_) { /* earnings not critical */ }

    return {
      symbol: symbol.replace('.NS', '').replace('.BO', ''),
      exchange: nseSymbol.endsWith('.BO') ? 'BSE' : 'NSE',
      bars,
      meta: {
        currentPrice:      meta.regularMarketPrice,
        previousClose:     meta.chartPreviousClose || meta.previousClose,
        high52w:           meta.fiftyTwoWeekHigh,
        low52w:            meta.fiftyTwoWeekLow,
        marketCap:         meta.marketCap || null,
        currency:          meta.currency || 'INR',
        longName:          meta.longName || meta.shortName || symbol,
        exchangeName:      meta.exchangeName || 'NSE',
        earningsDate,
        daysToEarnings,
      },
    };
  } catch (err) {
    if (err.name === 'TimeoutError') return null;
    return null;
  }
}

/**
 * Fetch a sector/index ticker (^NSEBANK, ^CNXIT etc.)
 */
async function fetchIndexData(ticker, range = '3mo') {
  const url = `${BASE}/${encodeURIComponent(ticker)}?interval=1d&range=${range}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const q = result.indicators.quote[0];
    const bars = [];
    const timestamps = result.timestamp || [];
    for (let i = 0; i < timestamps.length; i++) {
      if (q.close[i] == null) continue;
      bars.push({
        time:   timestamps[i],
        close:  q.close[i],
        high:   q.high[i],
        low:    q.low[i],
        volume: q.volume[i] || 0,
      });
    }

    return {
      ticker,
      bars,
      meta: {
        currentPrice:  result.meta.regularMarketPrice,
        previousClose: result.meta.chartPreviousClose,
        currency:      result.meta.currency,
      },
    };
  } catch (_) {
    return null;
  }
}

/**
 * Fetch multiple stocks in parallel with concurrency limit.
 * Yahoo Finance rate-limits aggressive parallel requests.
 * Batch size 25 with 300ms gap is safe.
 */
async function fetchMultipleStocks(symbols, range = '6mo', batchSize = 25, delayMs = 300) {
  const results = {};
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(sym => fetchStockData(sym, range))
    );
    batchResults.forEach((res, idx) => {
      results[batch[idx]] = res.status === 'fulfilled' ? res.value : null;
    });
    // Delay between batches to avoid rate limiting
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return results;
}

module.exports = { fetchStockData, fetchIndexData, fetchMultipleStocks };
