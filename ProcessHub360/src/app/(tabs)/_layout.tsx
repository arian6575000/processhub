import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../lib/theme';
import { useApp } from '../../ctx/AppContext';

const ic = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: any; size: number }) => <Ionicons name={name} size={size} color={color} />;

export default function TabsLayout() {
  const { t, settings, rtl } = useApp();
  return (
    <Tabs screenOptions={{ headerStyle: { backgroundColor: C.primary }, headerTintColor: '#fff', headerTitleStyle: rtl ? { fontFamily: 'UrduNastaliq', fontWeight: 'normal' } : { fontWeight: '700' }, tabBarActiveTintColor: C.primary, tabBarInactiveTintColor: C.muted, tabBarLabelStyle: rtl ? { fontSize: 12, fontFamily: 'UrduNastaliq' } : { fontSize: 12 }, tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 6 } }}>
      <Tabs.Screen name="index" options={{ title: settings.businessName || t('appName'), tabBarLabel: t('home'), tabBarIcon: ic('speedometer-outline') }} />
      <Tabs.Screen name="jobs" options={{ title: t('jobs'), tabBarIcon: ic('layers-outline') }} />
      <Tabs.Screen name="customers" options={{ title: t('customers'), tabBarIcon: ic('people-outline') }} />
      <Tabs.Screen name="materials" options={{ title: t('stock'), tabBarIcon: ic('cube-outline') }} />
      <Tabs.Screen name="more" options={{ title: t('more'), tabBarIcon: ic('menu-outline') }} />
    </Tabs>
  );
}
