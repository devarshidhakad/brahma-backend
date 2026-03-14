import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, SIGNAL_COLORS } from '../shared/theme';

export default function PortfolioScreen() {
  const [portfolio, setPortfolio] = useState([]);
  const [capital, setCapital] = useState(500000);

  useEffect(() => {
    AsyncStorage.getItem('brahma_portfolio').then(v => {
      if (v) setPortfolio(JSON.parse(v));
    });
    AsyncStorage.getItem('brahma_capital').then(v => {
      if (v) setCapital(parseFloat(v));
    });
  }, []);

  async function removeTrade(id) {
    Alert.alert('Remove Trade', 'Mark this trade as closed?', [
      { text: 'Cancel' },
      {
        text: 'Close Trade', style: 'destructive',
        onPress: async () => {
          const updated = portfolio.filter(t => t.id !== id);
          setPortfolio(updated);
          await AsyncStorage.setItem('brahma_portfolio', JSON.stringify(updated));
        },
      },
    ]);
  }

  const totalInvested = portfolio.reduce((s, t) => s + (t.amount || 0), 0);
  const totalRisk = portfolio.reduce((s, t) => s + (t.riskAmount || 0), 0);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        <Text style={s.headerTitle}>💼 Portfolio</Text>

        {/* Capital summary */}
        <View style={s.summaryCard}>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>CAPITAL</Text>
            <Text style={s.summaryValue}>₹{capital.toLocaleString('en-IN')}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>DEPLOYED</Text>
            <Text style={s.summaryValue}>₹{totalInvested.toLocaleString('en-IN')}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>AT RISK</Text>
            <Text style={[s.summaryValue, { color: colors.red }]}>₹{totalRisk.toLocaleString('en-IN')}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>OPEN TRADES</Text>
            <Text style={s.summaryValue}>{portfolio.length}</Text>
          </View>
        </View>

        {portfolio.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyTitle}>No open trades</Text>
            <Text style={s.emptyText}>Add trades from the Signals or Top 5 tabs. Your portfolio will appear here.</Text>
          </View>
        ) : (
          portfolio.map(trade => (
            <View key={trade.id} style={s.tradeCard}>
              <View style={s.tradeHeader}>
                <View>
                  <Text style={s.tradeSymbol}>{trade.symbol}</Text>
                  <Text style={s.tradeDate}>{trade.date}</Text>
                </View>
                <View style={s.tradeRight}>
                  {trade.signal && (
                    <View style={[s.signalBadge, { backgroundColor: (SIGNAL_COLORS[trade.signal] || colors.textSecondary) + '20' }]}>
                      <Text style={[s.signalText, { color: SIGNAL_COLORS[trade.signal] || colors.textSecondary }]}>{trade.signal}</Text>
                    </View>
                  )}
                  <TouchableOpacity onPress={() => removeTrade(trade.id)} style={s.closeBtn}>
                    <Text style={s.closeBtnText}>✕ Close</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={s.tradeDetails}>
                {[
                  { label: 'Entry', value: `₹${trade.entry?.toLocaleString('en-IN')}` },
                  { label: 'Stop', value: `₹${trade.stop?.toLocaleString('en-IN')}`, color: colors.red },
                  { label: 'T1', value: `₹${trade.target1?.toLocaleString('en-IN')}`, color: colors.greenDim },
                  { label: 'T2', value: `₹${trade.target2?.toLocaleString('en-IN')}`, color: colors.green },
                  { label: 'Shares', value: trade.shares },
                  { label: 'Amount', value: `₹${trade.amount?.toLocaleString('en-IN')}` },
                  { label: 'Risk', value: `₹${trade.riskAmount?.toLocaleString('en-IN')}`, color: colors.red },
                  { label: 'Risk %', value: `${trade.riskPct}%` },
                ].map(({ label, value, color }) => (
                  <View key={label} style={s.detailBox}>
                    <Text style={s.detailLabel}>{label}</Text>
                    <Text style={[s.detailValue, color && { color }]}>{value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  summaryCard: { backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.borderDim, padding: 16, gap: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 10, color: colors.textMuted, letterSpacing: 1 },
  summaryValue: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textSecondary },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  tradeCard: { backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.borderDim, padding: 14, gap: 12 },
  tradeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tradeSymbol: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  tradeDate: { fontSize: 10, color: colors.textMuted },
  tradeRight: { gap: 6, alignItems: 'flex-end' },
  signalBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  signalText: { fontSize: 10, fontWeight: '700' },
  closeBtn: { backgroundColor: 'rgba(248,113,113,0.1)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  closeBtnText: { color: colors.red, fontSize: 10, fontWeight: '600' },
  tradeDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailBox: { width: '23%', gap: 2 },
  detailLabel: { fontSize: 8, color: colors.textMuted, letterSpacing: 0.5 },
  detailValue: { fontSize: 11, fontWeight: '600', color: colors.textPrimary },
});
