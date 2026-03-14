#!/usr/bin/env bash
##############################################################################
# BRAHMA INTELLIGENCE — Deployment Script
##############################################################################

set -euo pipefail

REGION="ap-south-1"
ENV="production"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
UNIVERSE_BUCKET="brahma-universe-${ENV}"
FRONTEND_BUCKET="brahma-frontend-${ENV}"

log() { echo "[$(date '+%H:%M:%S')] $1"; }
err() { echo "[ERROR] $1" >&2; exit 1; }

if [[ -z "${ANTHROPIC_KEY:-}" ]]; then
  err "ANTHROPIC_KEY environment variable is required. Run: ANTHROPIC_KEY='sk-ant-...' ./deploy.sh"
fi

DEPLOY_TARGET="${1:-all}"

##############################################################################
# STEP 1 — TERRAFORM INFRASTRUCTURE
##############################################################################

deploy_infra() {
  log "=== DEPLOYING AWS INFRASTRUCTURE ==="

  aws s3api create-bucket \
    --bucket brahma-terraform-state \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" 2>/dev/null || true
  aws s3api put-bucket-versioning \
    --bucket brahma-terraform-state \
    --versioning-configuration Status=Enabled 2>/dev/null || true

  cd infra
  terraform init
  terraform plan -var="anthropic_api_key=${ANTHROPIC_KEY}" -out=tfplan
  terraform apply tfplan
  cd ..
  log "Infrastructure deployed"
}

##############################################################################
# STEP 2 — BUILD AND DEPLOY LAMBDA FUNCTIONS
##############################################################################

build_lambda() {
  local name="$1"
  local src_dir="lambdas/${name}"
  local zip_path="/tmp/brahma-${name}.zip"

  log "Building Lambda: ${name}"

  local build_dir="/tmp/brahma-build-${name}"
  rm -rf "$build_dir"
  mkdir -p "$build_dir"

  cp "${src_dir}/index.js" "$build_dir/"

  mkdir -p "${build_dir}/shared"
  cp lambdas/shared/indicators.js "${build_dir}/shared/"
  cp lambdas/shared/yahoo.js      "${build_dir}/shared/"
  cp lambdas/shared/cache.js      "${build_dir}/shared/"
  cp lambdas/shared/secrets.js    "${build_dir}/shared/"

  cp lambdas/package.json "$build_dir/"
  cd "$build_dir"
  npm install --omit=dev --silent
  cd - > /dev/null

  cd "$build_dir"
  zip -r "$zip_path" . -q
  cd - > /dev/null

  aws s3 cp "$zip_path" "s3://${UNIVERSE_BUCKET}/lambda-zips/${name}.zip" --region "$REGION"
  log "Uploaded ${name}.zip to S3"

  aws lambda update-function-code \
    --function-name "brahma-${name}" \
    --s3-bucket "$UNIVERSE_BUCKET" \
    --s3-key "lambda-zips/${name}.zip" \
    --region "$REGION" \
    --output table 2>/dev/null || log "Lambda brahma-${name} not yet created (run infra first)"

  rm -rf "$build_dir" "$zip_path"
}

deploy_lambdas() {
  log "=== DEPLOYING LAMBDA FUNCTIONS ==="
  for fn in signal scan nifty news ask sector; do
    build_lambda "$fn"
  done
  for fn in nifty500-fetcher pre-market-scan refresh; do
    build_lambda "$fn"
  done
  log "All Lambdas deployed"
}

##############################################################################
# STEP 3 — BUILD AND DEPLOY FRONTEND
##############################################################################

deploy_frontend() {
  log "=== DEPLOYING FRONTEND ==="

  cd frontend

  API_URL=$(cd ../infra && terraform output -raw api_gateway_url 2>/dev/null || echo "")
  if [[ -z "$API_URL" ]]; then
    err "Could not get API Gateway URL. Deploy infra first."
  fi

  log "API URL: $API_URL"

  cat > .env.production << EOF
VITE_API_BASE_URL=${API_URL}
VITE_APP_ENV=production
EOF

  npm install --silent
  rm -rf dist node_modules/.vite
  npm run build

  # Sync JS/CSS assets with long cache
  aws s3 sync dist/ "s3://${FRONTEND_BUCKET}/" \
    --region "$REGION" \
    --delete \
    --cache-control "public, max-age=31536000, immutable" \
    --exclude "index.html"

  # index.html — never cache
  aws s3 cp dist/index.html "s3://${FRONTEND_BUCKET}/index.html" \
    --region "$REGION" \
    --cache-control "no-cache, no-store, must-revalidate"

  # Invalidate CloudFront — find dist ID by domain, fallback to hardcoded
  DIST_ID=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?contains(DomainName,'cloudfront.net')].Id" \
    --output text 2>/dev/null | tr '\t' '\n' | head -1 || echo "")

  if [[ -z "$DIST_ID" ]]; then
    DIST_ID="EUO92GOZUSW8D"
    log "Using hardcoded distribution ID: $DIST_ID"
  fi

  aws cloudfront create-invalidation \
    --distribution-id "$DIST_ID" \
    --paths "/*" \
    --output table
  log "CloudFront cache invalidated: $DIST_ID"

  cd ..
  log "Frontend deployed"
}

##############################################################################
# STEP 4 — TRIGGER INITIAL DATA FETCH
##############################################################################

trigger_initial_fetch() {
  log "=== TRIGGERING INITIAL NIFTY 500 FETCH ==="

  aws lambda invoke \
    --function-name brahma-nifty500-fetcher \
    --region "$REGION" \
    /tmp/nifty500-response.json \
    --log-type Tail \
    --query 'LogResult' \
    --output text | base64 -d | tail -5

  cat /tmp/nifty500-response.json
  log "Nifty 500 fetch complete"

  log "Waiting 30s before running initial scan..."
  sleep 30

  aws lambda invoke \
    --function-name brahma-pre-market-scan \
    --region "$REGION" \
    /tmp/scan-response.json

  cat /tmp/scan-response.json
  log "Initial scan complete — Redis populated"
}

##############################################################################
# MAIN
##############################################################################

case "$DEPLOY_TARGET" in
  infra)    deploy_infra ;;
  lambdas)  deploy_lambdas ;;
  frontend) deploy_frontend ;;
  all)
    deploy_infra
    deploy_lambdas
    deploy_frontend
    trigger_initial_fetch
    log ""
    log "=============================="
    log " BRAHMA INTELLIGENCE DEPLOYED"
    log "=============================="
    ;;
  *)
    err "Usage: ./deploy.sh [infra|lambdas|frontend|all]"
    ;;
esac
