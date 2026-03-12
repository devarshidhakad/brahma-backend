/**
 * BRAHMA INTELLIGENCE — Secrets Manager
 *
 * The Anthropic API key is NEVER in:
 *   - Source code
 *   - Environment variables
 *   - Git history
 *   - CloudWatch logs
 *
 * It lives only in AWS Secrets Manager and in Lambda memory at runtime.
 * Fetched once per cold start. Cached in module scope for warm invocations.
 */

'use strict';

const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require('@aws-sdk/client-secrets-manager');

const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-south-1' });

// Module-level cache — populated on first cold start, reused on warm invocations
let cachedSecrets = null;

const SECRET_ARN = process.env.BRAHMA_SECRET_ARN; // set in Lambda env (non-sensitive ARN)

/**
 * Fetch all Brahma secrets from AWS Secrets Manager.
 * Returns { anthropicKey }.
 * Throws if secret cannot be fetched.
 */
async function getSecrets() {
  if (cachedSecrets) return cachedSecrets;

  if (!SECRET_ARN) {
    throw new Error('BRAHMA_SECRET_ARN environment variable not set');
  }

  const command = new GetSecretValueCommand({ SecretId: SECRET_ARN });
  const response = await smClient.send(command);

  if (!response.SecretString) {
    throw new Error('Secret has no string value');
  }

  const parsed = JSON.parse(response.SecretString);

  if (!parsed.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not found in secret');
  }

  // Store in module scope — never written to disk, never logged
  cachedSecrets = {
    anthropicKey: parsed.ANTHROPIC_API_KEY,
  };

  return cachedSecrets;
}

module.exports = { getSecrets };
