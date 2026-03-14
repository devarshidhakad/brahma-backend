import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { callSignl, fetchNews, fetchNiftyRegime, parseJSON } from '../shared/api';
import { MOOD_PROMPT } from '../shared/prompts';
import { colors } from '../shared/theme';

export default function BriefScreen() {
  const [mood, setMood] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [regime, setRegime] = useState(null);

  async function generateBrief() {
    setLoading(true);
    setMood(null);
    try {
      // Step 1: Fetch real nifty regime
      setStatus('📡 Fetching Nifty data...');
      let regimeData = null;
      try {
        const r = await fetchNiftyRegime();
        regimeData = r;
        setRegime(r);
      } catch (_) {}

      // Step 2: Fetch real news headlines
      setStatus('📰 Fetching real Indian market news...');
      let realHeadlines = [];
      try {
        const nj = await fetchNews();
        realHeadlines = nj.articles?.slice(0, 5) || [];
      } catch (_) {}

      // Step 3: Build context from REAL data only
      const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const niftyContext = regimeData
        ? `Nifty 50: ₹${regimeData.nifty?.price} | RSI: ${regimeData.nifty?.rsi} | Regime: ${regimeData.regime?.regime}`
        : 'Nifty data not available.';
      const headlineContext = realHeadlines.length
        ? realHeadlines.map((h, i) => `${i + 1}. [${h.source}] ${h.title}`).join('\n')
        : 'No headlines available.';

      const globalContext = `REAL MARKET DATA (fetched now):
${niftyContext}

TOP NEWS FROM INDIAN FINANCIAL RSS (real headlines):
${headlineContext}`;

      setStatus('🧠 SIGNL is meditating on the markets...');
      const raw = await callSignl(
        `Today is ${today}. Here is REAL market data:\n${globalContext}\n\nWrite the morning briefing using ONLY these real numbers. Do not invent any data.`,
        MOOD_PROMPT,
        2000
      );
      const parsed = parseJSON(raw);
      if (!parsed) throw new Error('Response truncated. Please retry.');
      setMood(parsed);
    } catch (e) {
      setStatus('❌ ' + e.message);
    }
    setLoading(false);
    if (!mood) setStatus('');
  }

  const moodColor = {
    'Strongly Bullish': colors.green,
    'Bullish': colors.greenDim,
    'Neutral': colors.yellow,
    'Cautious': '#fb923c',
    'Bearish': colors.red,
    'Strongly Bearish': '#ff4444',
  }[mood?.mood] || colors.textSecondary;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={generateBrief} tintColor={colors.green} />}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>🪔 Morning Intelligence Brief</Text>
          <Text style={s.headerDate}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        </View>

        {/* Regime pill */}
        {regime && (
          <View style={[s.regimePill, { borderColor: colors.purple + '40', backgroundColor: colors.purple + '10' }]}>
            <Text style={[s.regimeText, { color: colors.purple }]}>
              {regime.regime?.regime} | RSI {regime.nifty?.rsi} | Nifty ₹{regime.nifty?.price}
            </Text>
          </View>
        )}

        {/* Generate button */}
        {!mood && !loading && (
          <TouchableOpacity style={s.generateBtn} onPress={generateBrief}>
            <Text style={s.generateBtnText}>⚡ GENERATE TODAY'S BRIEF</Text>
          </TouchableOpacity>
        )}

        {/* Loading */}
        {loading && (
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color={colors.green} />
            <Text style={s.loadingText}>{status || 'Loading...'}</Text>
          </View>
        )}

        {/* Brief content */}
        {mood && (
          <View style={s.briefBox}>
            {/* Mood badge */}
            <View style={[s.moodBadge, { backgroundColor: moodColor + '20', borderColor: moodColor + '50' }]}>
              <Text style={[s.moodText, { color: moodColor }]}>{mood.mood?.toUpperCase()}</Text>
              <Text style={s.themeText}>{mood.topTheme}</Text>
            </View>

            {/* Briefing */}
            <Text style={s.sectionLabel}>TODAY'S BRIEFING</Text>
            <Text style={s.briefingText}>{mood.briefing}</Text>

            {/* Cues */}
            {mood.globalCue && (
              <View style={s.cueBox}>
                <Text style={s.cueLabel}>🌍 Global</Text>
                <Text style={s.cueText}>{mood.globalCue}</Text>
              </View>
            )}
            {mood.domesticCue && (
              <View style={s.cueBox}>
                <Text style={s.cueLabel}>🇮🇳 Domestic</Text>
                <Text style={s.cueText}>{mood.domesticCue}</Text>
              </View>
            )}

            {/* Key Risk */}
            {mood.keyRisk && (
              <View style={[s.cueBox, { borderColor: colors.red + '30', backgroundColor: colors.red + '08' }]}>
                <Text style={[s.cueLabel, { color: colors.red }]}>⚠️ Key Risk</Text>
                <Text style={s.cueText}>{mood.keyRisk}</Text>
              </View>
            )}

            {/* Top Trades */}
            {mood.topTrades?.length > 0 && (
              <View>
                <Text style={s.sectionLabel}>TOP TRADE IDEAS</Text>
                {mood.topTrades.map((t, i) => (
                  <View key={i} style={s.tradeRow}>
                    <Text style={s.tradeNum}>{i + 1}</Text>
                    <Text style={s.tradeText}>{t}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Refresh */}
            <TouchableOpacity style={s.refreshBtn} onPress={generateBrief}>
              <Text style={s.refreshBtnText}>🔄 Refresh Brief</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 16 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, letterSpacing: 0.5 },
  headerDate: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  regimePill: { borderRadius: 8, borderWidth: 1, padding: 10, marginBottom: 16 },
  regimeText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  generateBtn: {
    backgroundColor: 'rgba(0,255,135,0.12)', borderWidth: 1, borderColor: 'rgba(0,255,135,0.3)',
    borderRadius: 12, padding: 18, alignItems: 'center', marginVertical: 24,
  },
  generateBtnText: { color: colors.green, fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  loadingBox: { alignItems: 'center', paddingVertical: 40, gap: 16 },
  loadingText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  briefBox: { gap: 16 },
  moodBadge: { borderRadius: 12, borderWidth: 1, padding: 16, alignItems: 'center', gap: 4 },
  moodText: { fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  themeText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  sectionLabel: { fontSize: 9, color: colors.textMuted, letterSpacing: 2, marginBottom: 6, marginTop: 8 },
  briefingText: { fontSize: 14, color: colors.textPrimary, lineHeight: 22 },
  cueBox: {
    borderRadius: 8, borderWidth: 1, borderColor: colors.borderDim,
    backgroundColor: 'rgba(255,255,255,0.02)', padding: 12, gap: 4,
  },
  cueLabel: { fontSize: 11, fontWeight: '700', color: colors.purple },
  cueText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  tradeRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 8 },
  tradeNum: { color: colors.green, fontWeight: '800', fontSize: 13, width: 18 },
  tradeText: { flex: 1, color: colors.textPrimary, fontSize: 13, lineHeight: 20 },
  refreshBtn: { marginTop: 8, alignItems: 'center', padding: 12 },
  refreshBtnText: { color: colors.textMuted, fontSize: 12 },
});
