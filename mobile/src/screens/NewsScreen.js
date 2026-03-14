import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { callSignl, fetchNews, parseJSON } from '../shared/api';
import { NEWS_ANALYZE_PROMPT } from '../shared/prompts';
import { colors, IMPACT_COLORS } from '../shared/theme';

export default function NewsScreen() {
  const [newsData, setNewsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  async function loadNews() {
    setLoading(true);
    setNewsData(null);
    try {
      setStatus('📰 Fetching real Indian financial headlines...');
      const nj = await fetchNews();
      if (!nj.articles?.length) throw new Error('No articles found');

      const articles = nj.articles;
      const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const headlineList = articles.map((h, i) => `${i + 1}. [${h.source}] ${h.title}`).join('\n');

      setStatus('🧠 SIGNL is analyzing headlines...');
      const raw = await callSignl(
        `Today is ${today}. Here are REAL headlines from Indian financial RSS feeds:\n\n${headlineList}\n\nAnalyze each real headline. Do not add or invent any headlines.`,
        NEWS_ANALYZE_PROMPT,
        3000
      );

      const analyzed = parseJSON(raw);
      const merged = (analyzed?.analyzedHeadlines || []).map((a, i) => ({
        ...a,
        link: articles[i]?.link || null,
        pubDate: articles[i]?.pubDate || null,
        sectors: articles[i]?.sectors || a.affectedSectors || [],
      }));

      setNewsData({
        headlines: merged,
        keyRisk: analyzed?.keyRisk,
        keyOpportunity: analyzed?.keyOpportunity,
        sectorRotation: analyzed?.sectorRotation,
      });
    } catch (e) {
      setStatus('❌ ' + e.message);
    }
    setLoading(false);
    if (newsData) setStatus('');
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        <Text style={s.headerTitle}>🌐 Market News</Text>
        <Text style={s.headerSub}>Real RSS feeds + AI impact analysis</Text>

        {!newsData && !loading && (
          <TouchableOpacity style={s.loadBtn} onPress={loadNews}>
            <Text style={s.loadBtnText}>📰 LOAD TODAY'S NEWS</Text>
          </TouchableOpacity>
        )}

        {loading && (
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color={colors.green} />
            <Text style={s.loadingText}>{status}</Text>
          </View>
        )}

        {newsData && (
          <View style={s.newsBox}>
            {/* Summary cards */}
            {newsData.keyRisk && (
              <View style={[s.summaryCard, { borderColor: colors.red + '30', backgroundColor: colors.red + '08' }]}>
                <Text style={[s.summaryLabel, { color: colors.red }]}>⚠️ KEY RISK</Text>
                <Text style={s.summaryText}>{newsData.keyRisk}</Text>
              </View>
            )}
            {newsData.keyOpportunity && (
              <View style={[s.summaryCard, { borderColor: colors.green + '30', backgroundColor: colors.green + '08' }]}>
                <Text style={[s.summaryLabel, { color: colors.green }]}>🚀 KEY OPPORTUNITY</Text>
                <Text style={s.summaryText}>{newsData.keyOpportunity}</Text>
              </View>
            )}
            {newsData.sectorRotation && (
              <View style={[s.summaryCard, { borderColor: colors.purple + '30', backgroundColor: colors.purple + '08' }]}>
                <Text style={[s.summaryLabel, { color: colors.purple }]}>🔄 SECTOR ROTATION</Text>
                <Text style={s.summaryText}>{newsData.sectorRotation}</Text>
              </View>
            )}

            {/* Headlines */}
            <Text style={s.sectionLabel}>ANALYZED HEADLINES</Text>
            {newsData.headlines.map((item, i) => {
              const impactColor = IMPACT_COLORS[item.impact] || colors.textSecondary;
              return (
                <TouchableOpacity key={i} style={s.headlineCard} activeOpacity={0.8}
                  onPress={() => item.link && Linking.openURL(item.link)}>
                  {/* Impact badge */}
                  <View style={[s.impactBadge, { backgroundColor: impactColor + '20', borderColor: impactColor + '40' }]}>
                    <Text style={[s.impactText, { color: impactColor }]}>{item.impact}</Text>
                    <View style={[s.severityDot, { backgroundColor: impactColor }]} />
                    <Text style={[s.severityText, { color: impactColor }]}>{item.severity}/5</Text>
                  </View>

                  {/* Title */}
                  <Text style={s.headlineTitle}>{item.title}</Text>
                  <Text style={s.headlineSource}>{item.source} · {item.timeframe}</Text>

                  {/* Trading action */}
                  <View style={s.actionBox}>
                    <Text style={s.actionLabel}>💡 Trading Action</Text>
                    <Text style={s.actionText}>{item.tradingAction}</Text>
                  </View>

                  {/* Affected */}
                  {(item.affectedSectors?.length > 0 || item.affectedStocks?.length > 0) && (
                    <View style={s.affectedRow}>
                      {item.affectedSectors?.slice(0, 2).map((sec, j) => (
                        <View key={j} style={[s.chip, { backgroundColor: colors.blue + '12' }]}>
                          <Text style={[s.chipText, { color: colors.blue }]}>{sec}</Text>
                        </View>
                      ))}
                      {item.affectedStocks?.slice(0, 3).map((sym, j) => (
                        <View key={j} style={[s.chip, { backgroundColor: colors.green + '10' }]}>
                          <Text style={[s.chipText, { color: colors.greenDim }]}>{sym}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {item.link && <Text style={s.tapToRead}>Tap to read full article →</Text>}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={s.refreshBtn} onPress={loadNews}>
              <Text style={s.refreshBtnText}>🔄 Refresh News</Text>
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
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  headerSub: { fontSize: 11, color: colors.textMuted, marginBottom: 20 },
  loadBtn: { backgroundColor: 'rgba(0,255,135,0.12)', borderWidth: 1, borderColor: 'rgba(0,255,135,0.3)', borderRadius: 12, padding: 18, alignItems: 'center', marginVertical: 24 },
  loadBtnText: { color: colors.green, fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  loadingBox: { alignItems: 'center', paddingVertical: 40, gap: 16 },
  loadingText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  newsBox: { gap: 12 },
  summaryCard: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 6 },
  summaryLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  summaryText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  sectionLabel: { fontSize: 9, color: colors.textMuted, letterSpacing: 2, marginBottom: 6, marginTop: 4 },
  headlineCard: { backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.borderDim, padding: 14, gap: 10 },
  impactBadge: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  impactText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  severityDot: { width: 6, height: 6, borderRadius: 3 },
  severityText: { fontSize: 10, fontWeight: '600' },
  headlineTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, lineHeight: 20 },
  headlineSource: { fontSize: 10, color: colors.textMuted },
  actionBox: { backgroundColor: 'rgba(0,255,135,0.06)', borderRadius: 8, padding: 10, gap: 4 },
  actionLabel: { fontSize: 9, color: colors.green, fontWeight: '700', letterSpacing: 1 },
  actionText: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  affectedRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 10 },
  tapToRead: { fontSize: 10, color: colors.textMuted, textAlign: 'right' },
  refreshBtn: { alignItems: 'center', padding: 12 },
  refreshBtnText: { color: colors.textMuted, fontSize: 12 },
});
