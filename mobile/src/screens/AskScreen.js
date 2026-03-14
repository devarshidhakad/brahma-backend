import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { callSignl } from '../shared/api';
import { colors } from '../shared/theme';

const SUGGESTIONS = [
  'What is the Nifty 50 and why does it matter?',
  'How do I read RSI for buy/sell signals?',
  'Explain sector rotation in Indian markets',
  'What is the difference between SMA and EMA?',
  'How should I manage risk in volatile markets?',
  'What is a golden cross signal?',
];

const ASK_SYSTEM_PROMPT = `You are SIGNL — India's elite AI stock advisor. Answer questions about Indian stocks, NSE/BSE markets, and trading strategy directly and expertly. Use Indian market context (Nifty, Sensex, SEBI, RBI). Be concise but insightful. End every response with: "⚠️ Educational signal only. Not SEBI-registered investment advice."`;

export default function AskScreen() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef();

  async function sendMessage(text) {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');
    const userMsg = { role: 'user', text: q };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const answer = await callSignl(q, ASK_SYSTEM_PROMPT, 1000);
      setMessages(prev => [...prev, { role: 'signl', text: answer }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'signl', text: '❌ ' + e.message }]);
    }
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.header}>
          <Text style={s.headerTitle}>🪬 Ask Signl</Text>
          <Text style={s.headerSub}>AI advisor for Indian markets</Text>
        </View>

        <ScrollView ref={scrollRef} style={s.messages} contentContainerStyle={s.messagesContent}>
          {messages.length === 0 && (
            <View style={s.suggestionsBox}>
              <Text style={s.suggestLabel}>SUGGESTED QUESTIONS</Text>
              {SUGGESTIONS.map((s_, i) => (
                <TouchableOpacity key={i} style={s.suggestion} onPress={() => sendMessage(s_)}>
                  <Text style={s.suggestionText}>{s_}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {messages.map((msg, i) => (
            <View key={i} style={[s.bubble, msg.role === 'user' ? s.userBubble : s.signlBubble]}>
              {msg.role === 'signl' && <Text style={s.bubbleFrom}>SIGNL</Text>}
              <Text style={[s.bubbleText, msg.role === 'user' ? s.userText : s.signlText]}>
                {msg.text}
              </Text>
            </View>
          ))}

          {loading && (
            <View style={s.signlBubble}>
              <Text style={s.bubbleFrom}>SIGNL</Text>
              <ActivityIndicator size="small" color={colors.green} />
            </View>
          )}
        </ScrollView>

        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder="Ask about Indian markets..."
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            returnKeyType="send"
          />
          <TouchableOpacity style={[s.sendBtn, { opacity: loading || !input.trim() ? 0.5 : 1 }]}
            onPress={() => sendMessage()} disabled={loading || !input.trim()}>
            <Text style={s.sendBtnText}>▶</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { padding: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.borderDim },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  headerSub: { fontSize: 11, color: colors.textMuted },
  messages: { flex: 1 },
  messagesContent: { padding: 16, gap: 12, paddingBottom: 8 },
  suggestionsBox: { gap: 8 },
  suggestLabel: { fontSize: 9, color: colors.textMuted, letterSpacing: 2, marginBottom: 4 },
  suggestion: { backgroundColor: colors.bgCard, borderRadius: 10, borderWidth: 1, borderColor: colors.borderDim, padding: 12 },
  suggestionText: { color: colors.textSecondary, fontSize: 13 },
  bubble: { borderRadius: 14, padding: 12, maxWidth: '90%', gap: 4 },
  userBubble: { backgroundColor: 'rgba(0,255,135,0.12)', alignSelf: 'flex-end', borderWidth: 1, borderColor: 'rgba(0,255,135,0.2)' },
  signlBubble: { backgroundColor: colors.bgCard, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.borderDim },
  bubbleFrom: { fontSize: 8, color: colors.green, fontWeight: '700', letterSpacing: 1.5 },
  bubbleText: { fontSize: 13, lineHeight: 20 },
  userText: { color: colors.textPrimary },
  signlText: { color: colors.textSecondary },
  inputRow: { flexDirection: 'row', padding: 12, gap: 10, borderTopWidth: 1, borderTopColor: colors.borderDim, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.borderDim, padding: 12, color: colors.textPrimary, fontSize: 13, maxHeight: 100 },
  sendBtn: { backgroundColor: colors.green, borderRadius: 12, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: colors.bg, fontSize: 16, fontWeight: '800' },
});
