##############################################################################
# BRAHMA INTELLIGENCE — AWS Infrastructure
# Region: ap-south-1 (Mumbai) — closest to Indian users
#
# Resources created:
#   - S3 buckets (frontend + universe)
#   - CloudFront distribution
#   - API Gateway HTTP API
#   - Lambda functions (6 compute + 3 cron)
#   - ElastiCache Redis (t4g.micro)
#   - DynamoDB table
#   - Secrets Manager secret
#   - IAM roles and policies
#   - EventBridge rules (cron jobs)
#   - VPC, subnets, security groups
#   - Route 53 records
#   - ACM certificate
##############################################################################

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket = "brahma-terraform-state"
    key    = "production/terraform.tfstate"
    region = "ap-south-1"
  }
}

provider "aws" {
  region = var.aws_region
}

# ACM cert must be in us-east-1 for CloudFront
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

##############################################################################
# VARIABLES
##############################################################################

variable "aws_region"        { default = "ap-south-1" }
variable "domain_name"       { default = "" }
variable "api_domain"        { default = "" }
variable "environment"       { default = "production" }
variable "anthropic_api_key" {
  sensitive   = true
  description = "Anthropic API key — passed via TF_VAR_anthropic_api_key env var. Never hardcode."
}

##############################################################################
# VPC — Lambda and Redis run in private subnet
##############################################################################

resource "aws_vpc" "brahma" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = { Name = "brahma-vpc" }
}

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.brahma.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "${var.aws_region}a"
  tags = { Name = "brahma-private-a" }
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.brahma.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "${var.aws_region}b"
  tags = { Name = "brahma-private-b" }
}

resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.brahma.id
  cidr_block              = "10.0.10.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true
  tags = { Name = "brahma-public-a" }
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.brahma.id
  tags   = { Name = "brahma-igw" }
}

# NAT Gateway for Lambda outbound (Yahoo Finance, Anthropic, niftyindices)
resource "aws_eip" "nat" { domain = "vpc" }

resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public_a.id
  tags          = { Name = "brahma-nat" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.brahma.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat.id
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.brahma.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
}

resource "aws_route_table_association" "private_a" {
  subnet_id      = aws_subnet.private_a.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_b" {
  subnet_id      = aws_subnet.private_b.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

# Security Groups
resource "aws_security_group" "lambda" {
  name   = "brahma-lambda-sg"
  vpc_id = aws_vpc.brahma.id
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "brahma-lambda-sg" }
}

resource "aws_security_group" "redis" {
  name   = "brahma-redis-sg"
  vpc_id = aws_vpc.brahma.id
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
  }
  tags = { Name = "brahma-redis-sg" }
}

##############################################################################
# S3 BUCKETS
##############################################################################

resource "aws_s3_bucket" "frontend" {
  bucket = "brahma-frontend-${var.environment}"
  tags   = { Name = "brahma-frontend" }
}

resource "aws_s3_bucket" "universe" {
  bucket = "brahma-universe-${var.environment}"
  tags   = { Name = "brahma-universe" }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "universe" {
  bucket                  = aws_s3_bucket.universe.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

##############################################################################
# CLOUDFRONT
##############################################################################

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "brahma-frontend-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_200" # NA + EU + Asia

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "S3-brahma-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-brahma-frontend"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
  }

  # SPA routing — return index.html for 404s
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# Allow CloudFront to read S3
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
        }
      }
    }]
  })
}

##############################################################################
# SECRETS MANAGER — Anthropic key
##############################################################################

resource "aws_secretsmanager_secret" "brahma" {
  name        = "brahma/production/api-keys"
  description = "Brahma Intelligence API keys — Anthropic"
  tags        = { Name = "brahma-secrets" }
}

resource "aws_secretsmanager_secret_version" "brahma" {
  secret_id     = aws_secretsmanager_secret.brahma.id
  secret_string = jsonencode({
    ANTHROPIC_API_KEY = var.anthropic_api_key
  })
}

##############################################################################
# IAM ROLES
##############################################################################

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_exec" {
  name               = "brahma-lambda-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "brahma-lambda-policy"
  role = aws_iam_role.lambda_exec.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # Logs
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
      # Secrets Manager — ONLY this one secret
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.brahma.arn
      },
      # S3 — universe bucket only
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
        Resource = [
          aws_s3_bucket.universe.arn,
          "${aws_s3_bucket.universe.arn}/*"
        ]
      },
      # VPC networking
      {
        Effect   = "Allow"
        Action   = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface"
        ]
        Resource = "*"
      },
      # Lambda invoke (for pre-market-scan to invoke scan-lambda)
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = "arn:aws:lambda:${var.aws_region}:*:function:brahma-*"
      },
      # DynamoDB
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"]
        Resource = aws_dynamodb_table.users.arn
      }
    ]
  })
}

##############################################################################
# ELASTICACHE REDIS
##############################################################################

resource "aws_elasticache_subnet_group" "brahma" {
  name       = "brahma-redis-subnets"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "brahma-redis"
  engine               = "redis"
  node_type            = "cache.t4g.micro"   # Graviton ARM — 20% cheaper than t3
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  engine_version       = "7.1"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.brahma.name
  security_group_ids   = [aws_security_group.redis.id]
  at_rest_encryption_enabled = false  # t4g.micro doesn't support encryption
  tags                 = { Name = "brahma-redis" }
}

##############################################################################
# DYNAMODB
##############################################################################

resource "aws_dynamodb_table" "users" {
  name         = "brahma-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  attribute {
    name = "userId"
    type = "S"
  }
  tags = { Name = "brahma-users" }
}

##############################################################################
# LAMBDA FUNCTIONS
##############################################################################

locals {
  lambda_env = {
    REDIS_URL            = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379"
    BRAHMA_SECRET_ARN    = aws_secretsmanager_secret.brahma.arn
    UNIVERSE_BUCKET      = aws_s3_bucket.universe.bucket
    FRONTEND_ORIGIN      = "*"
    SCAN_FUNCTION_NAME   = "brahma-scan"
    AWS_REGION_OVERRIDE  = var.aws_region
  }
  vpc_config = {
    subnet_ids         = [aws_subnet.private_a.id, aws_subnet.private_b.id]
    security_group_ids = [aws_security_group.lambda.id]
  }
}

# Assumes Lambda zip files are built and uploaded to S3 by CI/CD
# See deploy.sh for the build commands

resource "aws_lambda_function" "signal" {
  function_name = "brahma-signal"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  timeout       = 30
  memory_size   = 128
  s3_bucket     = aws_s3_bucket.universe.bucket
  s3_key        = "lambda-zips/signal.zip"
  environment { variables = local.lambda_env }
  vpc_config {
    subnet_ids         = local.vpc_config.subnet_ids
    security_group_ids = local.vpc_config.security_group_ids
  }
  tags = { Name = "brahma-signal" }
}

resource "aws_lambda_function" "scan" {
  function_name = "brahma-scan"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  timeout       = 60
  memory_size   = 512
  s3_bucket     = aws_s3_bucket.universe.bucket
  s3_key        = "lambda-zips/scan.zip"
  environment { variables = local.lambda_env }
  vpc_config {
    subnet_ids         = local.vpc_config.subnet_ids
    security_group_ids = local.vpc_config.security_group_ids
  }
  tags = { Name = "brahma-scan" }
}

resource "aws_lambda_function" "nifty" {
  function_name = "brahma-nifty"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  timeout       = 15
  memory_size   = 128
  s3_bucket     = aws_s3_bucket.universe.bucket
  s3_key        = "lambda-zips/nifty.zip"
  environment { variables = local.lambda_env }
  vpc_config {
    subnet_ids         = local.vpc_config.subnet_ids
    security_group_ids = local.vpc_config.security_group_ids
  }
  tags = { Name = "brahma-nifty" }
}

resource "aws_lambda_function" "news" {
  function_name = "brahma-news"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  timeout       = 25
  memory_size   = 256
  s3_bucket     = aws_s3_bucket.universe.bucket
  s3_key        = "lambda-zips/news.zip"
  environment { variables = local.lambda_env }
  vpc_config {
    subnet_ids         = local.vpc_config.subnet_ids
    security_group_ids = local.vpc_config.security_group_ids
  }
  tags = { Name = "brahma-news" }
}

resource "aws_lambda_function" "ask" {
  function_name = "brahma-ask"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  timeout       = 60
  memory_size   = 256
  s3_bucket     = aws_s3_bucket.universe.bucket
  s3_key        = "lambda-zips/ask.zip"
  environment { variables = local.lambda_env }
  vpc_config {
    subnet_ids         = local.vpc_config.subnet_ids
    security_group_ids = local.vpc_config.security_group_ids
  }
  tags = { Name = "brahma-ask" }
}

resource "aws_lambda_function" "sector" {
  function_name = "brahma-sector"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  timeout       = 30
  memory_size   = 256
  s3_bucket     = aws_s3_bucket.universe.bucket
  s3_key        = "lambda-zips/sector.zip"
  environment { variables = local.lambda_env }
  vpc_config {
    subnet_ids         = local.vpc_config.subnet_ids
    security_group_ids = local.vpc_config.security_group_ids
  }
  tags = { Name = "brahma-sector" }
}

# CRON LAMBDAS
resource "aws_lambda_function" "nifty500_fetcher" {
  function_name = "brahma-nifty500-fetcher"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  timeout       = 60
  memory_size   = 128
  s3_bucket     = aws_s3_bucket.universe.bucket
  s3_key        = "lambda-zips/nifty500-fetcher.zip"
  environment { variables = local.lambda_env }
  vpc_config {
    subnet_ids         = local.vpc_config.subnet_ids
    security_group_ids = local.vpc_config.security_group_ids
  }
  tags = { Name = "brahma-nifty500-fetcher" }
}

resource "aws_lambda_function" "pre_market_scan" {
  function_name = "brahma-pre-market-scan"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  timeout       = 120
  memory_size   = 128
  s3_bucket     = aws_s3_bucket.universe.bucket
  s3_key        = "lambda-zips/pre-market-scan.zip"
  environment { variables = local.lambda_env }
  vpc_config {
    subnet_ids         = local.vpc_config.subnet_ids
    security_group_ids = local.vpc_config.security_group_ids
  }
  tags = { Name = "brahma-pre-market-scan" }
}

resource "aws_lambda_function" "refresh" {
  function_name = "brahma-refresh"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  timeout       = 60
  memory_size   = 256
  s3_bucket     = aws_s3_bucket.universe.bucket
  s3_key        = "lambda-zips/refresh.zip"
  environment { variables = local.lambda_env }
  vpc_config {
    subnet_ids         = local.vpc_config.subnet_ids
    security_group_ids = local.vpc_config.security_group_ids
  }
  tags = { Name = "brahma-refresh" }
}

##############################################################################
# API GATEWAY HTTP API
##############################################################################

resource "aws_apigatewayv2_api" "brahma" {
  name          = "brahma-api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins  = ["*"]
    allow_methods  = ["GET", "POST", "OPTIONS"]
    allow_headers  = ["content-type", "authorization"]
    max_age        = 300
  }
}

resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.brahma.id
  name        = "$default"
  auto_deploy = true
}

# Lambda integrations
locals {
  lambda_functions = {
    signal = aws_lambda_function.signal.invoke_arn
    scan   = aws_lambda_function.scan.invoke_arn
    nifty  = aws_lambda_function.nifty.invoke_arn
    news   = aws_lambda_function.news.invoke_arn
    ask    = aws_lambda_function.ask.invoke_arn
    sector = aws_lambda_function.sector.invoke_arn
  }
}

resource "aws_apigatewayv2_integration" "signal" {
  api_id                 = aws_apigatewayv2_api.brahma.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.signal.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "scan" {
  api_id                 = aws_apigatewayv2_api.brahma.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.scan.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "nifty" {
  api_id                 = aws_apigatewayv2_api.brahma.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.nifty.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "news" {
  api_id                 = aws_apigatewayv2_api.brahma.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.news.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "ask" {
  api_id                 = aws_apigatewayv2_api.brahma.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.ask.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "sector" {
  api_id                 = aws_apigatewayv2_api.brahma.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.sector.invoke_arn
  payload_format_version = "2.0"
}

# Routes
resource "aws_apigatewayv2_route" "signal" {
  api_id    = aws_apigatewayv2_api.brahma.id
  route_key = "POST /signal"
  target    = "integrations/${aws_apigatewayv2_integration.signal.id}"
}

resource "aws_apigatewayv2_route" "scan" {
  api_id    = aws_apigatewayv2_api.brahma.id
  route_key = "GET /scan"
  target    = "integrations/${aws_apigatewayv2_integration.scan.id}"
}

resource "aws_apigatewayv2_route" "nifty" {
  api_id    = aws_apigatewayv2_api.brahma.id
  route_key = "GET /nifty"
  target    = "integrations/${aws_apigatewayv2_integration.nifty.id}"
}

resource "aws_apigatewayv2_route" "news" {
  api_id    = aws_apigatewayv2_api.brahma.id
  route_key = "GET /news"
  target    = "integrations/${aws_apigatewayv2_integration.news.id}"
}

resource "aws_apigatewayv2_route" "ask" {
  api_id    = aws_apigatewayv2_api.brahma.id
  route_key = "POST /ask"
  target    = "integrations/${aws_apigatewayv2_integration.ask.id}"
}

resource "aws_apigatewayv2_route" "ask_options" {
  api_id    = aws_apigatewayv2_api.brahma.id
  route_key = "OPTIONS /ask"
  target    = "integrations/${aws_apigatewayv2_integration.ask.id}"
}

resource "aws_apigatewayv2_route" "signal_options" {
  api_id    = aws_apigatewayv2_api.brahma.id
  route_key = "OPTIONS /signal"
  target    = "integrations/${aws_apigatewayv2_integration.signal.id}"
}

resource "aws_apigatewayv2_route" "sector" {
  api_id    = aws_apigatewayv2_api.brahma.id
  route_key = "GET /sector"
  target    = "integrations/${aws_apigatewayv2_integration.sector.id}"
}

# Lambda permissions for API Gateway
resource "aws_lambda_permission" "apigw_signal" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.signal.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.brahma.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_scan" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scan.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.brahma.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_nifty" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.nifty.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.brahma.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_news" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.news.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.brahma.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_ask" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ask.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.brahma.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_sector" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sector.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.brahma.execution_arn}/*/*"
}

##############################################################################
# EVENTBRIDGE CRON JOBS
##############################################################################

# 6:00 AM IST = 00:30 UTC
resource "aws_cloudwatch_event_rule" "nifty500_daily" {
  name                = "brahma-nifty500-daily"
  description         = "Fetch Nifty 500 list daily at 6:00 AM IST"
  schedule_expression = "cron(30 0 * * ? *)"
}

resource "aws_cloudwatch_event_target" "nifty500_daily" {
  rule = aws_cloudwatch_event_rule.nifty500_daily.name
  arn  = aws_lambda_function.nifty500_fetcher.arn
}

resource "aws_lambda_permission" "nifty500_daily" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.nifty500_fetcher.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.nifty500_daily.arn
}

# 7:45 AM IST = 02:15 UTC
resource "aws_cloudwatch_event_rule" "pre_market_scan" {
  name                = "brahma-pre-market-scan"
  description         = "Pre-market full scan at 7:45 AM IST"
  schedule_expression = "cron(15 2 * * ? *)"
}

resource "aws_cloudwatch_event_target" "pre_market_scan" {
  rule = aws_cloudwatch_event_rule.pre_market_scan.name
  arn  = aws_lambda_function.pre_market_scan.arn
}

resource "aws_lambda_permission" "pre_market_scan" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_market_scan.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.pre_market_scan.arn
}

# Every 15 minutes during market hours (9:00–15:30 IST = 03:30–10:00 UTC)
resource "aws_cloudwatch_event_rule" "market_hours_scan" {
  name                = "brahma-market-hours-scan"
  description         = "Re-scan top 5 every 15 mins during market hours"
  schedule_expression = "rate(15 minutes)"
}

resource "aws_cloudwatch_event_target" "market_hours_scan" {
  rule = aws_cloudwatch_event_rule.market_hours_scan.name
  arn  = aws_lambda_function.pre_market_scan.arn
}

resource "aws_lambda_permission" "market_hours_scan" {
  statement_id  = "AllowEventBridgeMarketHours"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_market_scan.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.market_hours_scan.arn
}

# Hot stocks refresh every 5 minutes
resource "aws_cloudwatch_event_rule" "stock_refresh" {
  name                = "brahma-stock-refresh"
  description         = "Refresh hot stocks every 5 minutes"
  schedule_expression = "rate(5 minutes)"
}

resource "aws_cloudwatch_event_target" "stock_refresh" {
  rule = aws_cloudwatch_event_rule.stock_refresh.name
  arn  = aws_lambda_function.refresh.arn
}

resource "aws_lambda_permission" "stock_refresh" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.refresh.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.stock_refresh.arn
}

##############################################################################
# OUTPUTS
##############################################################################

output "cloudfront_url"     { value = "https://${aws_cloudfront_distribution.frontend.domain_name}" }
output "api_gateway_url"    { value = aws_apigatewayv2_api.brahma.api_endpoint }
output "redis_endpoint"     { value = aws_elasticache_cluster.redis.cache_nodes[0].address }
output "frontend_bucket"    { value = aws_s3_bucket.frontend.bucket }
output "universe_bucket"    { value = aws_s3_bucket.universe.bucket }
output "secret_arn"         { value = aws_secretsmanager_secret.brahma.arn }
