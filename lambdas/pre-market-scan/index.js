/**
 * BRAHMA INTELLIGENCE — Pre-Market Scan Lambda
 * Runs daily at 7:45 AM IST via EventBridge Scheduler.
 * Also runs every 15 minutes during market hours (9:00 AM - 3:30 PM IST).
 *
 * Invokes the scan Lambda and pre-stores results in Redis.
 * This is why the first user click of the day returns in <1ms.
 */

'use strict';

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'ap-south-1' });

const SCAN_FUNCTION_NAME = process.env.SCAN_FUNCTION_NAME || 'brahma-scan';

module.exports.handler = async (event) => {
  console.log('[PRE-MARKET-SCAN] Starting at', new Date().toISOString());

  try {
    // Invoke the scan Lambda directly (bypasses API Gateway, no auth needed)
    const response = await lambda.send(new InvokeCommand({
      FunctionName:   SCAN_FUNCTION_NAME,
      InvocationType: 'RequestResponse',
      // Pass event that bypasses cache check (force refresh)
      Payload: JSON.stringify({ forceRefresh: true }),
    }));

    const result = JSON.parse(Buffer.from(response.Payload).toString());
    const body = JSON.parse(result.body || '{}');

    console.log(`[PRE-MARKET-SCAN] Complete. Qualified: ${body.qualifiedCount}, Top sector: ${body.topSectors?.[0]}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        qualifiedCount:  body.qualifiedCount,
        topSectors:      body.topSectors,
        universeDate:    body.universeDate,
      }),
    };

  } catch (err) {
    console.error('[PRE-MARKET-SCAN] Error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
