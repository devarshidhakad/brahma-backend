import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { colors } from '../shared/theme';

import BriefScreen    from '../screens/BriefScreen';
import Top5Screen     from '../screens/Top5Screen';
import SignalsScreen  from '../screens/SignalsScreen';
import NewsScreen     from '../screens/NewsScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import AskScreen      from '../screens/AskScreen';

const Tab = createBottomTabNavigator();

const TABS = [
  { name: 'Brief',     component: BriefScreen,     icon: '🪔', label: 'Brief' },
  { name: 'Top5',      component: Top5Screen,       icon: '🏆', label: 'Top 5' },
  { name: 'Signals',   component: SignalsScreen,    icon: '📊', label: 'Signals' },
  { name: 'News',      component: NewsScreen,       icon: '🌐', label: 'News' },
  { name: 'Portfolio', component: PortfolioScreen,  icon: '💼', label: 'Portfolio' },
  { name: 'Ask',       component: AskScreen,        icon: '🪬', label: 'Ask' },
];

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0d1420',
          borderTopColor: 'rgba(0,255,135,0.1)',
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 60,
        },
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      {TABS.map(tab => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            tabBarLabel: tab.label,
            tabBarIcon: ({ focused }) => (
              <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.5 }}>{tab.icon}</Text>
            ),
          }}
        />
      ))}
    </Tab.Navigator>
  );
}
