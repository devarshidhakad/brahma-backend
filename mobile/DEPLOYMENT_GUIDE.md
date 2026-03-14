# Brahma Intelligence — Mobile App Deployment Guide

## Overview

The mobile app is built with **Expo + React Native**. It uses the **exact same AWS Lambda backend** as the web app. No backend changes needed.

```
brahma-backend/
├── frontend/        ← Web app (unchanged)
├── lambdas/         ← Same backend for both web + mobile
├── infra/           ← Same Terraform (unchanged)
└── mobile/          ← New Expo mobile app
```

---

## Prerequisites

Install these once on your Mac:

```bash
# Node.js 20+ (already installed if you have the web app running)
node --version

# Install Expo CLI globally
npm install -g expo-cli eas-cli

# Verify
expo --version
eas --version
```

---

## Step 1 — Copy Mobile Folder into Your Repo

```bash
# Copy the brahma-mobile folder into your project
cp -r brahma-mobile ~/Devarshi_Apps/brahma-backend/mobile

# Navigate into it
cd ~/Devarshi_Apps/brahma-backend/mobile

# Install dependencies
npm install
```

---

## Step 2 — Run Locally (Test on Your Phone)

```bash
cd ~/Devarshi_Apps/brahma-backend/mobile

# Start Expo dev server
npx expo start
```

This shows a **QR code** in your terminal.

**To test on your phone:**
1. Install the **Expo Go** app from App Store / Play Store
2. Open Expo Go → Scan the QR code
3. The app loads on your phone instantly
4. Every change you make auto-reloads

This is the fastest way to test — no build needed.

---

## Step 3 — Create Expo Account (Required for Builds)

```bash
# Create free account at expo.dev, then login
eas login

# Initialize EAS in your project
cd ~/Devarshi_Apps/brahma-backend/mobile
eas init

# This creates a projectId in app.json automatically
```

---

## Step 4 — Build for Android (Play Store)

### 4a. Build APK (for testing, direct install)

```bash
cd ~/Devarshi_Apps/brahma-backend/mobile

# Build APK — no Play Store, just download and install
eas build --platform android --profile preview
```

- Build runs in Expo's cloud (no Android Studio needed on your Mac)
- Takes ~10-15 minutes
- Download the `.apk` file from the link shown
- Share `.apk` with anyone to install directly

### 4b. Build AAB (for Play Store submission)

```bash
# Build production AAB for Play Store
eas build --platform android --profile production
```

---

## Step 5 — Publish on Play Store

### 5a. Set up Google Play Console

1. Go to **play.google.com/console**
2. Pay one-time $25 USD developer fee
3. Create new app → "Brahma Intelligence"
4. Fill in: app description, category (Finance), screenshots, icon

### 5b. Create Service Account for EAS

1. In Play Console → Setup → API access → Link to Google Cloud project
2. Create service account → Download JSON key
3. Save as `~/Devarshi_Apps/brahma-backend/mobile/google-service-account.json`

### 5c. Submit to Play Store

```bash
cd ~/Devarshi_Apps/brahma-backend/mobile

# Submit the production AAB to Play Store
eas submit --platform android --profile production
```

### 5d. Play Store Review

- Internal testing: available immediately to testers you add
- Closed testing: 2-3 days review
- Production: 3-7 days review (first submission)
- Subsequent updates: usually reviewed within hours

---

## Step 6 — Build for iOS (App Store)

### 6a. Requirements

- **Apple Developer Account** — $99 USD/year at developer.apple.com
- **Mac with Xcode** OR use EAS cloud build (no Mac needed)

### 6b. Register your app

```bash
# Login with your Apple ID
eas credentials

# EAS will automatically:
# - Create App ID in Apple Developer Portal
# - Create provisioning profile
# - Create signing certificate
# Just press Enter when asked
```

### 6c. Build for iOS

```bash
cd ~/Devarshi_Apps/brahma-backend/mobile

# Build iOS app in Expo cloud (no Xcode needed)
eas build --platform ios --profile production
```

- Takes ~20-30 minutes in Expo cloud
- Downloads a `.ipa` file

### 6d. Submit to App Store

Update `eas.json` with your Apple credentials:

```json
"ios": {
  "appleId": "devarshidhakad@gmail.com",
  "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
  "appleTeamId": "YOUR_TEAM_ID"
}
```

Find `ascAppId`: App Store Connect → My Apps → Your App → App Information → Apple ID

Find `appleTeamId`: developer.apple.com → Account → Membership → Team ID

```bash
# Submit to App Store
eas submit --platform ios --profile production
```

### 6e. App Store Connect setup

1. Go to **appstoreconnect.apple.com**
2. My Apps → + → New App → "Brahma Intelligence"
3. Fill in: description, keywords, screenshots (required sizes below)
4. Category: Finance
5. Submit for review

**Required iOS screenshots:**
- iPhone 6.7" (1290×2796) — at least 3
- iPhone 6.5" (1242×2688) — at least 3
- iPad Pro 12.9" (2048×2732) — if `supportsTablet: true`

Take screenshots using the iOS Simulator in Xcode, or use Expo Go.

### 6f. App Store Review

- First submission: 1-3 days
- **Financial apps need disclaimer:** Already included — "Not SEBI-registered investment advice"
- Subsequent updates: usually 24 hours

---

## Step 7 — App Icons and Splash Screen

Create these image files in `~/Devarshi_Apps/brahma-backend/mobile/assets/`:

| File | Size | Description |
|---|---|---|
| `icon.png` | 1024×1024 | Main app icon (no transparency) |
| `splash.png` | 1284×2778 | Splash screen |
| `adaptive-icon.png` | 1024×1024 | Android adaptive icon foreground |
| `favicon.png` | 48×48 | Web favicon |

**Design tip:** Use the Brahma ॐ symbol on dark background `#080c14` with green `#00ff87` accent.

You can use Canva, Figma, or any design tool.

---

## Step 8 — Over-the-Air Updates (OTA)

After your app is live, you can push **JavaScript updates without App Store review**:

```bash
cd ~/Devarshi_Apps/brahma-backend/mobile

# Push update to all users instantly
eas update --branch production --message "Fix signal display"
```

- Works for JS/UI changes only
- Native code changes (new libraries) still need full rebuild + store submission
- Users get the update next time they open the app

---

## Update Both Web and Mobile Together

Since both share the same backend:

```bash
cd ~/Devarshi_Apps/brahma-backend

# Deploy backend changes (affects both web and mobile)
ANTHROPIC_KEY="sk-ant-..." ./deploy.sh lambdas

# Deploy web frontend
ANTHROPIC_KEY="sk-ant-..." ./deploy.sh frontend

# Deploy mobile update (JS only, no store review)
cd mobile
eas update --branch production --message "Update description"
```

---

## Folder Structure Reference

```
mobile/
├── App.js                    ← Entry point, top bar, navigation container
├── app.json                  ← Expo config (bundle ID, version, icons)
├── eas.json                  ← Build profiles for dev/preview/production
├── package.json              ← Dependencies
├── babel.config.js           ← Babel config
├── assets/                   ← icon.png, splash.png (you create these)
└── src/
    ├── shared/
    │   ├── api.js            ← All API calls (same endpoints as web)
    │   ├── prompts.js        ← All Claude prompts (identical to web)
    │   └── theme.js          ← Colors and constants
    ├── screens/
    │   ├── BriefScreen.js    ← Morning Intelligence Brief
    │   ├── Top5Screen.js     ← Top 5 Sector Picks
    │   ├── SignalsScreen.js  ← Stock Signal Analysis
    │   ├── NewsScreen.js     ← News + AI Analysis
    │   ├── PortfolioScreen.js← Portfolio Tracker
    │   └── AskScreen.js      ← Ask Brahma Chat
    └── navigation/
        └── AppNavigator.js   ← Bottom tab navigation
```

---

## Quick Command Reference

```bash
# Test on phone (no build)
npx expo start

# Android APK (share directly, no Play Store)
eas build --platform android --profile preview

# Android Play Store build
eas build --platform android --profile production
eas submit --platform android

# iOS App Store build
eas build --platform ios --profile production
eas submit --platform ios

# Push JS update to live users (no review)
eas update --branch production --message "Update message"

# View build status
eas build:list
```

---

## Costs

| Service | Cost |
|---|---|
| Expo EAS Build (free tier) | 30 builds/month free |
| Expo EAS Build (paid) | $29/month for unlimited |
| Google Play Developer | $25 one-time |
| Apple Developer Program | $99/year |
| Backend (same as web) | ~$35/month (unchanged) |

---

## App Store Listing Tips

**Title:** Brahma Intelligence - NSE Signals

**Subtitle (iOS):** AI-Powered Indian Stock Analysis

**Keywords:** NSE, BSE, Nifty, stock signals, technical analysis, Indian stocks, trading, AI

**Description:**
```
Brahma Intelligence is an AI-powered market analysis platform for Indian retail investors and traders.

FEATURES:
• Morning Intelligence Brief — daily AI market briefing
• Top 5 Daily Picks — AI-ranked stocks with real NSE data
• Stock Signals — deep technical analysis for any NSE/BSE stock
• News Analysis — real Indian financial headlines with AI impact analysis
• Portfolio Tracker — manage open trades with risk management
• Ask Brahma — AI advisor for all your market questions

DATA:
• Real-time prices from Yahoo Finance
• Official Nifty 500 stock universe from NSE
• AI analysis powered by Claude (Anthropic)

DISCLAIMER:
Brahma Intelligence provides AI-generated signals for educational purposes only. We are not SEBI-registered investment advisors. All trading decisions are your own responsibility.
```
