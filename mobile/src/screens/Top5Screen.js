import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { callSignl, fetchScan, parseJSON } from '../shared/api';
import { TOP5_PROMPT } from '../shared/prompts';
import { colors, SIGNAL_COLORS } from '../shared/theme';

export default function Top5Screen() {
  const [top5, setTop5] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [expanded, setExpanded] = useState(null);

  async function runScan() {
    setLoading(true);
    setTop5(null);
    setExpanded(null);
    try {
      setStatus('⚡ Scanning Nifty 500 sectors...');
      const scanData = await fetchScan();

      const rankedSectors = scanData.topSectors || [];
      const candidates = scanData.top10 || scanData.top5 || [];
      if (!candidates.length) throw new Error('No qualifying stocks found');

      setStatus(`🧠 AI ranking top ${Math.min(candidates.length, 7)} candidates...`);

      // Build real data map and context — same as web
      const realDataMap = {};
      const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      const dataContext = candidates.slice(0, 7).map(stock => {
        const aboveSma50  = stock.sma50  ? stock.price > stock.sma50  : null;
        const aboveSma200 = stock.sma200 ? stock.price > stock.sma200 : null;
        const target2 = stock.target1 && stock.atr
          ? Math.round((stock.target1 + stock.atr * 2) * 100) / 100
          : null;

        realDataMap[stock.symbol] = {
          price: stock.price, rsi14: stock.rsi,
          macd: { line: stock.macd, signal: stock.macd > 0 ? 'Positive' : 'Negative' },
          aboveSma50, aboveSma200, goldenCross: stock.goldenCross,
          atr: stock.atr, stoch: stock.stoch, volSignal: stock.volSignal,
          w52pos: stock.w52pos, stopLoss: stock.stopLoss,
          target1: stock.target1, target2,
          sma20: stock.sma20, sma50: stock.sma50, sma200: stock.sma200,
          sr: stock.sr, changePct: stock.changePct,
          high52w: stock.high52w, low52w: stock.low52w,
          cmf: stock.cmf, signal: stock.signal, score: stock.score,
        };

        const rrRatio = stock.atr
          ? ((stock.target1 - stock.price) / Math.max(stock.price - stock.stopLoss, 1)).toFixed(1)
          : 'N/A';

        return `${stock.symbol} [${stock.sector}] SignlScore=${stock.score} Signal=${stock.signal}:
  CMP=₹${stock.price} | Change=${stock.changePct}% | Volume=${stock.volSignal} | CMF=${stock.cmf}
  RSI=${stock.rsi} | MACD=${stock.macd > 0 ? 'Positive' : 'Negative'} | Stoch=${stock.stoch}
  SMA20=₹${stock.sma20} SMA50=₹${stock.sma50} (${aboveSma50 ? 'ABOVE' : 'BELOW'}) SMA200=${stock.sma200 ? `₹${stock.sma200}(${aboveSma200 ? 'ABOVE' : 'BELOW'})` : 'N/A (6mo data)'}
  ATR=${stock.atr} | GoldenCross=${stock.goldenCross} | 52W_Position=${stock.w52pos}%
  Support1=₹${stock.sr?.support1} Resistance1=₹${stock.sr?.resistance1}
  StopLoss=₹${stock.stopLoss} T1=₹${stock.target1} (+${stock.upsidePct}%) T2=₹${target2} (+${stock.upsidePct2}%)
  RiskReward=1:${stock.rr || rrRatio}`;
      }).join('\n\n');

      const raw = await callSignl(
        `Today is ${today}. SECTOR SCAN complete. Top sectors: ${rankedSectors.join(', ')}.\n\nCANDIDATES (real NSE data):\n${dataContext}\n\nPick the best 5. Use only these candidates. All data is real.`,
        TOP5_PROMPT,
        8000
      );

      const parsed = parseJSON(raw);
      if (!parsed) throw new Error('AI response truncated. Please retry.');

      if (parsed.picks) {
        parsed.picks = parsed.picks.map(pick => {
          const rd = realDataMap[pick.symbol];
          if (rd) {
            pick.currentPrice = rd.price;
            pick.stopLoss     = rd.stopLoss;
            pick.target1      = rd.target1;
            pick.target2      = rd.target2;
            pick.realData     = rd;
          }
          return pick;
        });
      }

      parsed.topSectors = rankedSectors;
      setTop5(parsed);
    } catch (e) {
      setStatus('❌ ' + e.message);
    }
    setLoading(false);
    if (top5) setStatus('');
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        <View style={s.header}>
          <Text style={s.headerTitle}>🏆 Signl's Top 5 Daily Picks</Text>
          <Text style={s.headerSub}>Sector Rotation → Signl Score → AI Ranked</Text>
        </View>

        {!top5 && !loading && (
          <View>
            <Text style={s.steps}>
              1. Detect top performing sectors today{'\n'}
              2. Scan 30-50 stocks within those sectors{'\n'}
              3. Rank by Signl Score (filter upside ≥2%, R:R ≥1.5){'\n'}
              4. AI picks best 5
            </Text>
            <TouchableOpacity style={s.scanBtn} onPress={runScan}>
              <Text style={s.scanBtnText}>⚡ START SECTOR SCAN</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && (
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color={colors.green} />
            <Text style={s.loadingText}>{status}</Text>
          </View>
        )}

        {top5 && (
          <View style={s.resultsBox}>
            <View style={s.resultsMeta}>
              <Text style={s.metaText}>Top Sectors: {top5.topSectors?.join(', ')}</Text>
              <Text style={s.metaText}>{top5.marketCondition}</Text>
              <Text style={[s.metaText, { color: colors.green }]}>{top5.marketRegime}</Text>
            </View>

            {top5.picks?.map((pick, i) => {
              const sigColor = SIGNAL_COLORS[pick.signal] || colors.textSecondary;
              const isOpen = expanded === i;

              return (
                <TouchableOpacity key={i} style={[s.pickCard, { borderColor: sigColor + '30' }]}
                  onPress={() => setExpanded(isOpen ? null : i)} activeOpacity={0.8}>

                  {/* Pick header */}
                  <View style={s.pickHeader}>
                    <View style={s.rankBadge}>
                      <Text style={s.rankText}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}</Text>
                    </View>
                    <View style={s.pickInfo}>
                      <Text style={s.pickSymbol}>{pick.symbol}</Text>
                      <Text style={s.pickName}>{pick.name}</Text>
                      <View style={s.pickTags}>
                        <View style={[s.tag, { backgroundColor: colors.purple + '15' }]}>
                          <Text style={[s.tagText, { color: colors.purple }]}>{pick.sector}</Text>
                        </View>
                        <View style={[s.tag, { backgroundColor: colors.yellow + '15' }]}>
                          <Text style={[s.tagText, { color: colors.yellow }]}>⏱ {pick.holdingPeriod}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={s.pickRight}>
                      <View style={[s.signalBadge, { backgroundColor: sigColor + '20', borderColor: sigColor + '50' }]}>
                        <Text style={[s.signalText, { color: sigColor }]}>{pick.signal}</Text>
                      </View>
                      <Text style={s.scoreText}>{pick.score}</Text>
                      <Text style={s.scoreLabel}>SCORE</Text>
                    </View>
                  </View>

                  {/* CMP + Key Levels */}
                  <View style={s.priceRow}>
                    {[
                      { label: 'CMP', value: `₹${pick.realData?.price?.toLocaleString('en-IN') || pick.currentPrice}`, sub: `${pick.realData?.changePct > 0 ? '+' : ''}${pick.realData?.changePct ?? ''}%`, color: colors.textPrimary },
                      { label: 'ENTRY', value: `₹${pick.entryZone?.low?.toLocaleString('en-IN')}`, sub: `–₹${pick.entryZone?.high?.toLocaleString('en-IN')}`, color: colors.blue },
                      { label: 'STOP', value: `₹${pick.stopLoss?.toLocaleString('en-IN')}`, sub: pick.stopLossPercent, color: colors.red },
                      { label: 'T1', value: `₹${pick.target1?.toLocaleString('en-IN')}`, sub: `${pick.target1Percent} · ${pick.target1Days}d`, color: colors.greenDim },
                      { label: 'T2', value: `₹${pick.target2?.toLocaleString('en-IN')}`, sub: pick.target2Percent, color: colors.green },
                    ].map(({ label, value, sub, color }) => (
                      <View key={label} style={[s.priceBox, { borderColor: color + '25', backgroundColor: color + '08' }]}>
                        <Text style={[s.priceLabel, { color }]}>{label}</Text>
                        <Text style={s.priceValue}>{value}</Text>
                        <Text style={[s.priceSub, { color }]}>{sub}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Expanded details */}
                  {isOpen && (
                    <View style={s.expandedBox}>
                      <Text style={s.tradeSetup}>🏦 {pick.tradeSetup}</Text>
                      <Text style={s.topReason}>💡 {pick.topReason}</Text>

                      {pick.technicalConfluence?.length > 0 && (
                        <View>
                          <Text style={s.expandLabel}>⚡ TECHNICAL CONFLUENCE</Text>
                          <View style={s.tagRow}>
                            {pick.technicalConfluence.map((t, j) => (
                              <View key={j} style={[s.tag, { backgroundColor: colors.purple + '12' }]}>
                                <Text style={[s.tagText, { color: colors.purple }]}>📊 {t}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {pick.institutionalAngle && (
                        <Text style={s.institutionalText}>🏛️ <Text style={{ fontWeight: '700' }}>Smart Money:</Text> {pick.institutionalAngle}</Text>
                      )}

                      {pick.catalysts?.length > 0 && (
                        <View>
                          <Text style={s.expandLabel}>KEY CATALYSTS</Text>
                          <View style={s.tagRow}>
                            {pick.catalysts.map((c, j) => (
                              <View key={j} style={[s.tag, { backgroundColor: colors.green + '08' }]}>
                                <Text style={[s.tagText, { color: colors.greenDim }]}>✓ {c}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      <View style={s.metaRow}>
                        <View style={[s.metaBadge, { backgroundColor: pick.riskLevel === 'LOW' ? colors.greenDim + '15' : colors.yellow + '15' }]}>
                          <Text style={[s.metaBadgeText, { color: pick.riskLevel === 'LOW' ? colors.greenDim : colors.yellow }]}>Risk: {pick.riskLevel}</Text>
                        </View>
                        <View style={[s.metaBadge, { backgroundColor: colors.green + '10' }]}>
                          <Text style={[s.metaBadgeText, { color: colors.green }]}>{pick.confidence} CONFIDENCE</Text>
                        </View>
                        <View style={[s.metaBadge, { backgroundColor: colors.yellow + '10' }]}>
                          <Text style={[s.metaBadgeText, { color: colors.yellow }]}>R:R {pick.riskReward}</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  <Text style={s.tapHint}>{isOpen ? '▲ Less' : '▼ More details'}</Text>
                </TouchableOpacity>
              );
            })}

            <Text style={s.disclaimer}>{top5.disclaimer}</Text>
            <TouchableOpacity style={s.refreshBtn} onPress={runScan}>
              <Text style={s.refreshBtnText}>🔄 Re-scan</Text>
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
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  headerSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  steps: { color: colors.textSecondary, fontSize: 13, lineHeight: 22, marginBottom: 24 },
  scanBtn: { backgroundColor: 'rgba(0,255,135,0.12)', borderWidth: 1, borderColor: 'rgba(0,255,135,0.3)', borderRadius: 12, padding: 18, alignItems: 'center' },
  scanBtnText: { color: colors.green, fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  loadingBox: { alignItems: 'center', paddingVertical: 40, gap: 16 },
  loadingText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  resultsBox: { gap: 12 },
  resultsMeta: { gap: 4, marginBottom: 8 },
  metaText: { fontSize: 12, color: colors.textSecondary },
  pickCard: { backgroundColor: colors.bgCard, borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  pickHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  rankBadge: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 18 },
  pickInfo: { flex: 1, gap: 2 },
  pickSymbol: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  pickName: { fontSize: 11, color: colors.textSecondary },
  pickTags: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 4 },
  pickRight: { alignItems: 'flex-end', gap: 4 },
  signalBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  signalText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  scoreText: { fontSize: 22, fontWeight: '800', color: colors.green },
  scoreLabel: { fontSize: 8, color: colors.textMuted, letterSpacing: 1 },
  priceRow: { flexDirection: 'row', gap: 6 },
  priceBox: { flex: 1, borderRadius: 8, borderWidth: 1, padding: 8, alignItems: 'center' },
  priceLabel: { fontSize: 7, letterSpacing: 1, marginBottom: 4 },
  priceValue: { fontSize: 11, fontWeight: '700', color: colors.textPrimary },
  priceSub: { fontSize: 9, marginTop: 2 },
  expandedBox: { gap: 10, borderTopWidth: 1, borderTopColor: colors.borderDim, paddingTop: 12 },
  tradeSetup: { fontSize: 12, color: colors.purple, lineHeight: 18 },
  topReason: { fontSize: 13, color: colors.textPrimary, lineHeight: 20 },
  expandLabel: { fontSize: 9, color: colors.textMuted, letterSpacing: 1.5, marginBottom: 6 },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tag: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 10 },
  institutionalText: { fontSize: 11, color: colors.yellow, lineHeight: 18 },
  metaRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  metaBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  metaBadgeText: { fontSize: 10, fontWeight: '600' },
  tapHint: { textAlign: 'center', fontSize: 10, color: colors.textMuted },
  disclaimer: { fontSize: 10, color: colors.textMuted, textAlign: 'center', lineHeight: 16 },
  refreshBtn: { alignItems: 'center', padding: 12 },
  refreshBtnText: { color: colors.textMuted, fontSize: 12 },
});
