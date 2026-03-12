# BRAHMA INTELLIGENCE — Complete Deployment Guide

## Prerequisites

Install these before starting:

```bash
# AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

# Terraform
wget https://releases.hashicorp.com/terraform/1.7.0/terraform_1.7.0_linux_amd64.zip
unzip terraform_1.7.0_linux_amd64.zip && sudo mv terraform /usr/local/bin/

# Node.js 20
nvm install 20 && nvm use 20

# Verify
aws --version && terraform --version && node --version
```

---

## Step 1 — Configure AWS

```bash
aws configure
# AWS Access Key ID: [your key]
# AWS Secret Access Key: [your secret]
# Default region: ap-south-1
# Default output format: json
```

Create an IAM user with these policies:
- AmazonS3FullAccess
- AWSLambda_FullAccess
- AmazonAPIGatewayAdministrator
- AmazonElastiCacheFullAccess
- AmazonDynamoDBFullAccess
- SecretsManagerReadWrite
- CloudFrontFullAccess
- AmazonRoute53FullAccess
- AmazonVPCFullAccess
- IAMFullAccess
- CloudWatchLogsFullAccess
- AmazonEventBridgeFullAccess

---

## Step 2 — Get Your Anthropic API Key

1. Go to https://console.anthropic.com/settings/keys
2. Create a new key
3. Copy it — you'll need it in the next step
4. **Do NOT paste it anywhere in the code**

---

## Step 3 — Deploy Everything

```bash
cd brahma  # project root

# Make deploy script executable
chmod +x deploy.sh

# Deploy all (infra + lambdas + frontend + initial data fetch)
# Your Anthropic key is passed as environment variable — never stored in code
ANTHROPIC_KEY="sk-ant-api03-your-key-here" ./deploy.sh all
```

This will:
1. Create all AWS infrastructure via Terraform (~8 minutes)
2. Build and deploy all 9 Lambda functions
3. Build and deploy the React frontend to S3 + CloudFront
4. Trigger the first Nifty 500 fetch
5. Trigger the first pre-market scan to warm up Redis

---

## Step 4 — Configure Your Domain (brahma.in)

After `terraform apply` completes:

```bash
# Get the CloudFront domain
terraform -chdir=infra output cloudfront_url

# Get the API Gateway URL
terraform -chdir=infra output api_gateway_url
```

In your domain registrar (GoDaddy / Namecheap / Cloudflare):

1. Create a CNAME record: `brahma.in` → `<cloudfront domain from output>`
2. Create a CNAME record: `www.brahma.in` → `<cloudfront domain from output>`
3. Create a CNAME record: `api.brahma.in` → `<api gateway URL from output>`

ACM certificate validation (DNS validation):
```bash
# Terraform will show you the CNAME records needed for SSL cert validation
# Add those CNAME records to your DNS
# Certificate becomes valid within 5-30 minutes
```

---

## Step 5 — Verify Deployment

```bash
# Test Nifty regime endpoint
curl https://api.brahma.in/nifty | python3 -m json.tool | head -30

# Test sector endpoint
curl https://api.brahma.in/sector | python3 -m json.tool | head -30

# Test scan endpoint (may take 4-5s first time, <1ms after)
curl https://api.brahma.in/scan | python3 -m json.tool | head -30

# Test signal endpoint (real 2yr data + Claude)
curl -X POST https://api.brahma.in/signal \
  -H "Content-Type: application/json" \
  -d '{"symbol":"RELIANCE"}' | python3 -m json.tool | head -50

# Test news endpoint
curl https://api.brahma.in/news | python3 -m json.tool | head -30

# Test Ask Brahma (streaming)
curl -X POST https://api.brahma.in/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"What is RSI and how should I use it for NSE stocks?"}' \
  --no-buffer
```

---

## Cron Jobs (Auto-configured by Terraform)

| Schedule | Lambda | What it does |
|----------|--------|--------------|
| 6:00 AM IST daily | brahma-nifty500-fetcher | Fetches official Nifty 500 CSV → S3 |
| 7:45 AM IST daily | brahma-pre-market-scan | Full 500-stock scan → Redis |
| Every 15 mins | brahma-pre-market-scan | Keeps Top 5 fresh during market hours |
| Every 5 mins | brahma-refresh | Refreshes hot_stocks (demand-driven) |

---

## Cost Breakdown (Monthly)

| Service | Cost |
|---------|------|
| Lambda (all 9 functions) | ~$0–2 |
| ElastiCache Redis t4g.micro | ~$13 |
| API Gateway | ~$0.50 |
| CloudFront + S3 | ~$1 |
| DynamoDB (on-demand) | ~$0 |
| Secrets Manager | ~$0.40 |
| NAT Gateway | ~$4 |
| Route 53 | ~$0.50 |
| Anthropic API (~500 calls/day) | ~$15–25 |
| **TOTAL** | **~$35–45/mo** |

---

## Updating Code

### Update a Lambda function:
```bash
ANTHROPIC_KEY="sk-ant-..." ./deploy.sh lambdas
```

### Update frontend only:
```bash
ANTHROPIC_KEY="sk-ant-..." ./deploy.sh frontend
```

### Update infrastructure (after changing main.tf):
```bash
ANTHROPIC_KEY="sk-ant-..." ./deploy.sh infra
```

---

## Rotating the Anthropic API Key

No code changes needed. Just update the secret:

```bash
aws secretsmanager update-secret \
  --secret-id brahma/production/api-keys \
  --secret-string '{"ANTHROPIC_API_KEY":"sk-ant-new-key-here"}' \
  --region ap-south-1
```

Lambda functions will pick up the new key on their next cold start.

---

## Monitoring

```bash
# View Lambda logs
aws logs tail /aws/lambda/brahma-signal --follow --region ap-south-1
aws logs tail /aws/lambda/brahma-scan --follow --region ap-south-1
aws logs tail /aws/lambda/brahma-nifty500-fetcher --follow --region ap-south-1

# View Redis cache status (requires access to private subnet)
# Best done via AWS Console → ElastiCache → Metrics
```

---

## What Is Real vs What Is Labeled

Every response from the API includes honest labels:

| Field | Status |
|-------|--------|
| All prices, OHLCV | ✅ Real — Yahoo Finance |
| RSI, MACD, ATR, SMA, EMA, BB, Stoch | ✅ Real — computed from real OHLCV |
| Support/Resistance | ✅ Real — pivot point detection on real highs/lows |
| Backtest stats | ✅ Real — run on 2yr actual historical data |
| Earnings dates | ✅ Real — Yahoo Finance calendarEvents |
| Sector index scores | ✅ Real — ^NSEBANK, ^CNXIT etc. from Yahoo Finance |
| Nifty regime | ✅ Real — ^NSEI data + SMA50/200 calculation |
| Stock universe | ✅ Real — official Nifty 500 CSV from niftyindices.com, daily |
| OBV, CMF | ✅ Real — volume indicators from real OHLCV |
| Target days | ⚠️ ATR-formula estimate — labeled as such in response |
| Brahma Score | ⚠️ Rule-based, not backtest-optimised — labeled in response |
| AI signal narrative | ⚠️ Claude inference from real indicators — labeled as AI analysis |
| FII/DII sentiment | ❌ Removed — NSE data requires paid license |
| Elliott Wave | ❌ Removed — was algorithmic approximation |

---

## Project Structure

```
brahma/
├── lambdas/
│   ├── shared/
│   │   ├── indicators.js     # All technical analysis formulas
│   │   ├── yahoo.js          # Yahoo Finance fetcher
│   │   ├── cache.js          # Redis helper
│   │   └── secrets.js        # AWS Secrets Manager
│   ├── signal/index.js       # POST /signal — core engine
│   ├── scan/index.js         # GET /scan — Nifty 500 scanner
│   ├── nifty/index.js        # GET /nifty — regime detection
│   ├── news/index.js         # GET /news — RSS + AI analysis
│   ├── ask/index.js          # POST /ask — streaming Q&A
│   ├── sector/index.js       # GET /sector — sector rankings
│   ├── nifty500-fetcher/     # Cron: 6am IST daily
│   ├── pre-market-scan/      # Cron: 7:45am + every 15 mins
│   └── refresh/              # Cron: every 5 mins
├── frontend/                 # React 18 + Vite (migrate brahma-intelligence.jsx here)
├── infra/
│   └── main.tf               # Complete AWS infrastructure
└── deploy.sh                 # One-command deployment
```
