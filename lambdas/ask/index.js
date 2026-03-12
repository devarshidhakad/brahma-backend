/**
 * BRAHMA INTELLIGENCE — Ask Lambda
 * POST /ask { question: "..." }
 *
 * Streams Claude response token-by-token.
 * Fetches current Nifty regime as context before calling Claude.
 * Uses Lambda response streaming (requires InvokeWithResponseStream).
 */

'use strict';

const { getSecrets }       = require('../shared/secrets');
const { cacheGet }         = require('../shared/cache');

const SYSTEM_PROMPT = `You are BRAHMA — India's most trusted AI market advisor for NSE/BSE equity markets.

You are talking to an Indian retail investor or trader.

YOUR RULES:
1. Always ground your answers in technical analysis principles and real market data when available.
2. You will be given the current Nifty market regime and sector data if available — use it.
3. Never claim to have real-time price data you don't have. Say "based on the regime data provided" not "the current price is X".
4. Do NOT give specific buy/sell calls for individual stocks in response to a question unless the user has asked for a signal on a specific stock (tell them to use the Signals tab).
5. Always add a disclaimer for specific investment advice.
6. Keep answers concise — 3-5 paragraphs maximum.
7. Use INR amounts, NSE symbols, and Indian market context.
8. FII/DII data is not available. Do not claim to know FII flows unless you're asked a general question about FII impact.

You are allowed to discuss: technical analysis, market regimes, sector rotation, trading strategies, risk management, how to read indicators, NSE/BSE mechanics, and general Indian market education.`;

module.exports.handler = awslambda.streamifyResponse(async (event, responseStream) => {
  const metadata = {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  };

  // For OPTIONS preflight
  if (event.requestContext?.http?.method === 'OPTIONS') {
    responseStream.write('');
    responseStream.end();
    return;
  }

  const httpResponseMetadata = require('@aws-sdk/client-lambda').pipeline;

  try {
    const body = JSON.parse(event.body || '{}');
    const question = (body.question || '').trim();
    if (!question) {
      responseStream.write(JSON.stringify({ error: 'question is required' }));
      responseStream.end();
      return;
    }

    // Fetch current market context from cache
    let marketContext = '';
    const regime = await cacheGet('nifty:regime');
    if (regime?.regime) {
      marketContext = `\nCURRENT MARKET CONTEXT (real data from Nifty):
- Nifty 50: ${regime.nifty?.price} (${regime.nifty?.changePct > 0 ? '+' : ''}${regime.nifty?.changePct}%)
- Market Regime: ${regime.regime?.regime}
- SMA50: ${regime.nifty?.sma50 || 'N/A'}
- SMA200: ${regime.nifty?.sma200 || 'N/A (requires 200 days)'}
- RSI: ${regime.nifty?.rsi || 'N/A'}
- Regime advice: ${regime.regime?.advice}`;
    }

    const sectors = await cacheGet('sector:rankings');
    if (sectors?.sectors?.length) {
      const top3 = sectors.sectors.slice(0, 3).map(s => `${s.sector}(${s.score})`).join(', ');
      marketContext += `\n- Top sectors today: ${top3}`;
    }

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
        max_tokens: 1000,
        stream: true,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `${marketContext}\n\nUSER QUESTION: ${question}`,
        }],
      }),
      signal: AbortSignal.timeout(55000),
    });

    if (!claudeResponse.ok) {
      const err = await claudeResponse.text();
      responseStream.write(JSON.stringify({ error: `Claude API: ${claudeResponse.status} ${err}` }));
      responseStream.end();
      return;
    }

    // Stream response text
    const reader = claudeResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            responseStream.write(parsed.delta.text);
          }
        } catch (_) { /* skip malformed events */ }
      }
    }

    responseStream.end();

  } catch (err) {
    console.error('[ASK] Error:', err.message);
    responseStream.write(JSON.stringify({ error: err.message }));
    responseStream.end();
  }
});
