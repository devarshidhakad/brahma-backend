import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, StyleSheet } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style="light" backgroundColor="#080c14" />
          {/* Top branding bar */}
          <View style={s.topBar}>
            <View style={s.logo}>
              <Text style={s.logoOm}>ॐ</Text>
            </View>
            <View>
              <Text style={s.brandName}>SIGNL</Text>
              <Text style={s.brandSub}>INTELLIGENCE</Text>
            </View>
            <Text style={s.time}>
              {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST
            </Text>
          </View>
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const s = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 10,
    backgroundColor: '#080c14',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,255,135,0.1)',
  },
  logo: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#00ff87',
    alignItems: 'center', justifyContent: 'center',
  },
  logoOm: { fontSize: 16, fontWeight: '800', color: '#080c14' },
  brandName: { fontSize: 14, fontWeight: '700', color: '#00ff87', letterSpacing: 2 },
  brandSub: { fontSize: 8, color: '#334155', letterSpacing: 3 },
  time: { marginLeft: 'auto', fontSize: 11, color: '#00ff87', fontWeight: '700' },
});
