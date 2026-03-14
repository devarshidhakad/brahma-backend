'use strict';

const { getSecrets } = require('./shared/secrets');
const { cacheGet }   = require('./shared/cache');

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const DEFAULT_SYSTEM_PROMPT = `You are BRAHMA — India's most trusted AI market advisor for NSE/BSE equity markets.

You are talking to an Indian retail investor or trader.

YOUR RULES:
1. Always ground your answers in technical analysis principles and real market data when available.
2. You will be given the current Nifty market regime and sector data if available — use it.
3. Never claim to have real-time price data you don't have. Say "based on the regime data provided".
4. Do NOT give specific buy/sell calls unless asked (tell them to use the Signals tab).
5. Always add a disclaimer for specific investment advice.
6. Keep answers concise — 3-5 paragraphs maximum.
7. Use INR amounts, NSE symbols, and Indian market context.
8. FII/DII data is not available.

You are allowed to discuss: technical analysis, market regimes, sector rotation, trading strategies,
risk management, how to read indicators, NSE/BSE mechanics, and general Indian market education.`;

module.exports.handler = async (event) => {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  try {
    const body       = JSON.parse(event.body || '{}');
    const question   = (body.question || '').trim();
    const systemPrompt = (body.systemPrompt || '').trim() || DEFAULT_SYSTEM_PROMPT;
    // Allow caller to specify max_tokens — TOP5 needs 4000, others need less
    const maxTokens  = Math.min(parseInt(body.maxTokens) || 4000, 8000);

    if (!question) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'question is required' }),
      };
    }

    // Add market context only for default chat prompt
    let marketContext = '';
    const isDefaultPrompt = !body.systemPrompt;
    if (isDefaultPrompt) {
      try {
        const regime = await cacheGet('nifty:regime');
        if (regime?.regime) {
          marketContext = `\nCURRENT MARKET CONTEXT (real Nifty data):
- Nifty 50: ${regime.nifty?.price} (${regime.nifty?.changePct > 0 ? '+' : ''}${regime.nifty?.changePct}%)
- Market Regime: ${regime.regime?.regime}
- RSI: ${regime.nifty?.rsi || 'N/A'}
- Regime advice: ${regime.regime?.advice}`;
        }
        const sectors = await cacheGet('sector:rankings');
        if (sectors?.sectors?.length) {
          const top3 = sectors.sectors.slice(0, 3).map(s => `${s.sector}(${s.score})`).join(', ');
          marketContext += `\n- Top sectors today: ${top3}`;
        }
      } catch (_) {}
    }

    const { anthropicKey } = await getSecrets();

    const userContent = isDefaultPrompt
      ? `${marketContext}\n\nUSER QUESTION: ${question}`
      : question;

    // Use Sonnet for all calls - reliable JSON output, no backtick wrapping
    const model = 'claude-sonnet-4-20250514';

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: AbortSignal.timeout(28000),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error('[ASK] Claude API error:', claudeRes.status, err);
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: `Claude API error: ${claudeRes.status}` }),
      };
    }

    const data   = await claudeRes.json();
    const answer = data.content?.[0]?.text || '';

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true, answer }),
    };

  } catch (err) {
    console.error('[ASK] Error:', err.message);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
