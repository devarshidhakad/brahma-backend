import React, { useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { callSignl, fetchSignal, parseJSON } from '../shared/api';
import { SIGNAL_PROMPT } from '../shared/prompts';
import { colors, SIGNAL_COLORS } from '../shared/theme';

const POPULAR = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy' },
  { symbol: 'TCS', name: 'Tata Consultancy', sector: 'IT' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Banking' },
  { symbol: 'INFY', name: 'Infosys', sector: 'IT' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Banking' },
  { symbol: 'SUNPHARMA', name: 'Sun Pharma', sector: 'Pharma' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', sector: 'Auto' },
  { symbol: 'ZOMATO', name: 'Zomato', sector: 'Consumer' },
];

export default function SignalsScreen() {
  const [query, setQuery] = useState('');
  const [signal, setSignal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [selectedStock, setSelectedStock] = useState(null);

  async function analyzeStock(stock) {
    setLoading(true);
    setSignal(null);
    setSelectedStock(stock);
    setStatus(`📡 Fetching real NSE data for ${stock.symbol}...`);

    try {
      // Fetch real data from Lambda
      const json = await fetchSignal(stock.symbol);
      const { price, indicators } = json;

      const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const rrRatio = indicators.atr ? ((indicators.target1 - price.current) / (price.current - indicators.stopLoss)).toFixed(1) : 'N/A';

      setStatus('🧠 SIGNL is analyzing...');

      const userMessage = `Analyze ${stock.name} (${stock.symbol}.NS) — ${stock.sector} sector.
Today: ${today}

REAL NSE DATA — ${indicators.daysAnalyzed} TRADING DAYS (Yahoo Finance)

PRICE ACTION:
  Current Price:    ₹${price.current}
  Prev Close:       ₹${price.prev} | Change: ${price.change >= 0 ? '+' : ''}₹${price.change} (${price.changePct}%)
  Day Range:        ₹${price.dayLow} – ₹${price.dayHigh}
  52W Range:        ₹${price.w52l} – ₹${price.w52h} | Position: ${price.w52pos}%

VOLUME:
  Volume Signal:    ${indicators.volSignal}
  
MOMENTUM:
  RSI 14-day:       ${indicators.rsi14}
  MACD Line:        ${indicators.macd?.line} (${indicators.macd?.line > 0 ? 'Positive' : 'Negative'})
  Stochastic:       ${indicators.stoch}

MOVING AVERAGES:
  SMA 20:  ₹${indicators.sma20} → Price ${indicators.aboveSma20 ? 'ABOVE' : 'BELOW'}
  SMA 50:  ₹${indicators.sma50} → Price ${indicators.aboveSma50 ? 'ABOVE' : 'BELOW'}
  SMA 200: ₹${indicators.sma200} → Price ${indicators.aboveSma200 ? 'ABOVE' : 'BELOW'}
  EMA 9:   ₹${indicators.ema9} | EMA 21: ₹${indicators.ema21}
  Golden Cross: ${indicators.goldenCross ? 'YES ✅' : 'NO ❌'}

BOLLINGER BANDS:
  Upper: ₹${indicators.bb?.upper} | Middle: ₹${indicators.bb?.middle} | Lower: ₹${indicators.bb?.lower}

SUPPORT/RESISTANCE:
  Support:    ₹${indicators.sr?.support}
  Resistance: ₹${indicators.sr?.resistance}
  
LEVELS:
  ATR Stop Loss: ₹${indicators.stopLoss}
  Target 1:      ₹${indicators.target1}
  Target 2:      ₹${indicators.target2}
  R:R:           1:${rrRatio}`;

      const raw = await callSignl(userMessage, SIGNAL_PROMPT, 6000);
      const parsed = parseJSON(raw);
      if (!parsed) throw new Error('Response truncated. Please retry.');

      setSignal({
        ...parsed,
        currentPrice: price.current,
        changePct: price.changePct,
        symbol: stock.symbol,
        name: stock.name,
        sector: stock.sector,
      });
    } catch (e) {
      setStatus('❌ ' + e.message);
    }
    setLoading(false);
    if (signal) setStatus('');
  }

  async function searchAndAnalyze() {
    const q = query.trim().toUpperCase();
    if (!q) return;
    await analyzeStock({ symbol: q, name: q, sector: 'NSE' });
  }

  const sigColor = SIGNAL_COLORS[signal?.signal] || colors.textSecondary;

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

          <Text style={s.headerTitle}>📊 Stock Signals</Text>

          {/* Search */}
          <View style={s.searchRow}>
            <TextInput
              style={s.searchInput}
              placeholder="NSE symbol e.g. RELIANCE"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="characters"
              returnKeyType="search"
              onSubmitEditing={searchAndAnalyze}
            />
            <TouchableOpacity style={s.searchBtn} onPress={searchAndAnalyze}>
              <Text style={s.searchBtnText}>GO</Text>
            </TouchableOpacity>
          </View>

          {/* Popular stocks */}
          {!signal && !loading && (
            <View>
              <Text style={s.sectionLabel}>POPULAR STOCKS</Text>
              {POPULAR.map(stock => (
                <TouchableOpacity key={stock.symbol} style={s.stockRow}
                  onPress={() => analyzeStock(stock)} activeOpacity={0.7}>
                  <View>
                    <Text style={s.stockSymbol}>{stock.symbol}</Text>
                    <Text style={s.stockName}>{stock.name}</Text>
                  </View>
                  <View style={[s.sectorTag, { backgroundColor: colors.purple + '15' }]}>
                    <Text style={[s.sectorTagText, { color: colors.purple }]}>{stock.sector}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Loading */}
          {loading && (
            <View style={s.loadingBox}>
              <ActivityIndicator size="large" color={colors.green} />
              <Text style={s.loadingText}>{status}</Text>
            </View>
          )}

          {/* Signal result */}
          {signal && !loading && (
            <View style={s.signalBox}>
              {/* Stock header */}
              <View style={s.signalHeader}>
                <View>
                  <Text style={s.signalSymbol}>{signal.symbol}</Text>
                  <Text style={s.signalName}>{signal.name}</Text>
                </View>
                <View style={s.priceCol}>
                  <Text style={s.cmpText}>₹{signal.currentPrice?.toLocaleString('en-IN')}</Text>
                  <Text style={[s.changeText, { color: signal.changePct >= 0 ? colors.green : colors.red }]}>
                    {signal.changePct >= 0 ? '+' : ''}{signal.changePct}%
                  </Text>
                </View>
              </View>

              {/* Signal badge */}
              <View style={[s.signalBadge, { backgroundColor: sigColor + '20', borderColor: sigColor + '50' }]}>
                <Text style={[s.signalBadgeText, { color: sigColor }]}>{signal.signal}</Text>
                <Text style={s.scoreText}>Score: {signal.score}/100</Text>
              </View>

              {/* Trade setup */}
              <View style={s.setupBox}>
                <Text style={s.setupText}>🏦 {signal.tradeSetup}</Text>
              </View>

              {/* Summary */}
              <Text style={s.summaryText}>{signal.summary}</Text>

              {/* Price levels */}
              <View style={s.levelsGrid}>
                {[
                  { label: '📍 ENTRY LOW', value: `₹${signal.entryZone?.low?.toLocaleString('en-IN')}`, color: colors.blue },
                  { label: '📍 ENTRY HIGH', value: `₹${signal.entryZone?.high?.toLocaleString('en-IN')}`, color: colors.blue },
                  { label: '🛑 STOP LOSS', value: `₹${signal.stopLoss?.price?.toLocaleString('en-IN')}`, color: colors.red, sub: signal.stopLoss?.percent },
                  { label: '🎯 TARGET 1', value: `₹${signal.target1?.price?.toLocaleString('en-IN')}`, color: colors.greenDim, sub: `${signal.target1?.percent} · ${signal.target1?.days}d` },
                  { label: '🎯 TARGET 2', value: `₹${signal.target2?.price?.toLocaleString('en-IN')}`, color: colors.green, sub: `${signal.target2?.percent} · ${signal.target2?.days}d` },
                  { label: '📊 R:R', value: signal.riskReward, color: colors.yellow, sub: signal.riskLevel + ' RISK' },
                ].map(({ label, value, color, sub }) => (
                  <View key={label} style={[s.levelBox, { borderColor: color + '25', backgroundColor: color + '06' }]}>
                    <Text style={[s.levelLabel, { color }]}>{label}</Text>
                    <Text style={s.levelValue}>{value}</Text>
                    {sub && <Text style={[s.levelSub, { color }]}>{sub}</Text>}
                  </View>
                ))}
              </View>

              {/* Reasons */}
              {signal.reasons?.length > 0 && (
                <View>
                  <Text style={s.sectionLabel}>WHY THIS SIGNAL</Text>
                  {signal.reasons.map((r, i) => (
                    <Text key={i} style={s.reasonText}>• {r}</Text>
                  ))}
                </View>
              )}

              {/* Risks */}
              {signal.risks?.length > 0 && (
                <View>
                  <Text style={[s.sectionLabel, { color: colors.red }]}>RISKS</Text>
                  {signal.risks.map((r, i) => (
                    <Text key={i} style={[s.reasonText, { color: colors.red + 'cc' }]}>⚠️ {r}</Text>
                  ))}
                </View>
              )}

              {/* Holding period */}
              <View style={s.holdingRow}>
                <Text style={s.holdingLabel}>Holding Period:</Text>
                <Text style={s.holdingValue}>{signal.holdingPeriod}</Text>
              </View>
              <View style={s.holdingRow}>
                <Text style={s.holdingLabel}>Position Size:</Text>
                <Text style={s.holdingValue}>{signal.positionSizing}</Text>
              </View>

              <Text style={s.disclaimer}>⚠️ AI-generated signal for educational purposes only. Not SEBI-registered investment advice.</Text>

              <TouchableOpacity style={s.newSearchBtn} onPress={() => { setSignal(null); setQuery(''); }}>
                <Text style={s.newSearchBtnText}>🔍 Search another stock</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: 16 },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  searchInput: { flex: 1, backgroundColor: colors.bgCard, borderRadius: 10, borderWidth: 1, borderColor: colors.borderDim, padding: 12, color: colors.textPrimary, fontSize: 14, letterSpacing: 1 },
  searchBtn: { backgroundColor: colors.green, borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
  searchBtnText: { color: colors.bg, fontWeight: '800', fontSize: 13 },
  sectionLabel: { fontSize: 9, color: colors.textMuted, letterSpacing: 2, marginBottom: 10 },
  stockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.borderDim },
  stockSymbol: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  stockName: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  sectorTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sectorTagText: { fontSize: 10, fontWeight: '600' },
  loadingBox: { alignItems: 'center', paddingVertical: 40, gap: 16 },
  loadingText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  signalBox: { gap: 14 },
  signalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  signalSymbol: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  signalName: { fontSize: 12, color: colors.textSecondary },
  priceCol: { alignItems: 'flex-end' },
  cmpText: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  changeText: { fontSize: 13, fontWeight: '600' },
  signalBadge: { borderRadius: 10, borderWidth: 1, padding: 14, alignItems: 'center', gap: 4 },
  signalBadgeText: { fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  scoreText: { color: colors.textSecondary, fontSize: 12 },
  setupBox: { backgroundColor: colors.purple + '10', borderRadius: 10, borderWidth: 1, borderColor: colors.purple + '25', padding: 12 },
  setupText: { color: colors.purple, fontSize: 13, lineHeight: 20 },
  summaryText: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  levelsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  levelBox: { width: '48%', borderRadius: 10, borderWidth: 1, padding: 10 },
  levelLabel: { fontSize: 8, letterSpacing: 1, marginBottom: 4 },
  levelValue: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  levelSub: { fontSize: 10, marginTop: 2 },
  reasonText: { fontSize: 12, color: colors.textSecondary, lineHeight: 20, marginBottom: 4 },
  holdingRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  holdingLabel: { fontSize: 12, color: colors.textMuted, width: 110 },
  holdingValue: { fontSize: 12, color: colors.textPrimary, fontWeight: '600' },
  disclaimer: { fontSize: 10, color: colors.textMuted, lineHeight: 16 },
  newSearchBtn: { alignItems: 'center', padding: 14, backgroundColor: colors.bgCard, borderRadius: 10, borderWidth: 1, borderColor: colors.borderDim },
  newSearchBtnText: { color: colors.textSecondary, fontSize: 13 },
});
