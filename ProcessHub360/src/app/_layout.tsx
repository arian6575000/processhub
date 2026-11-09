import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getRepo } from '../lib/db';
import type { Repo } from '../db/repo';
import { AppProvider, useApp } from '../ctx/AppContext';
import { LicenseGate } from '../ui/LicenseGate';
import { AuthGate } from '../ui/AuthGate';
import { ErrorBox, Loading, ToastHost, Screen } from '../ui/kit';
import { C } from '../lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Shell() {
  const { toastState, t, rtl } = useApp();
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: C.primary }, headerTintColor: '#fff', headerTitleStyle: rtl ? { fontFamily: 'UrduNastaliq', fontWeight: 'normal' } : { fontWeight: '700' }, contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="order/new" options={{ title: t('newOrder') }} />
        <Stack.Screen name="job/[id]" options={{ title: t('jobs') }} />
        <Stack.Screen name="customer/new" options={{ title: t('customers') }} />
        <Stack.Screen name="customer/[id]" options={{ title: t('customers') }} />
        <Stack.Screen name="material/new" options={{ title: t('materials') }} />
        <Stack.Screen name="material/[id]" options={{ title: t('stock') }} />
        <Stack.Screen name="definition/index" options={{ title: t('processingSetup') }} />
        <Stack.Screen name="definition/edit" options={{ title: t('processingSetup') }} />
        <Stack.Screen name="cash" options={{ title: t('cashAndExpenses') }} />
        <Stack.Screen name="users" options={{ title: t('users') }} />
        <Stack.Screen name="sync" options={{ title: t('syncStatus') }} />
        <Stack.Screen name="settings" options={{ title: t('settings') }} />
      </Stack>
      <ToastHost toast={toastState} />
    </View>
  );
}

export default function Root() {
  // The Urdu font is a plain file: drop any Nastaliq .ttf (Alvi Nastaleeq, Faisal, Jameel Noori ...) over assets/fonts/UrduNastaliq.ttf.
  const [fontsLoaded] = useFonts({ UrduNastaliq: require('../../assets/fonts/UrduNastaliq.ttf') });
  const [repo, setRepo] = useState<Repo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getRepo().then(setRepo).catch((e) => setError(String(e?.message ?? e))); }, []);
  useEffect(() => { if (fontsLoaded && (repo || error)) SplashScreen.hideAsync().catch(() => {}); }, [fontsLoaded, repo, error]);

  if (error) return <Screen><ErrorBox message={`The database could not be opened: ${error}`} /></Screen>;
  if (!repo || !fontsLoaded) return <Screen scroll={false}><Loading /></Screen>;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LangBridge repo={repo} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Reads the saved language once so the license screen can speak it, then mounts the gates. */
function LangBridge({ repo }: { repo: Repo }) {
  const [lang, setLang] = useState<'en' | 'ur' | null>(null);
  useEffect(() => { repo.settings.get().then((s) => setLang(s.language)); }, [repo]);
  const changeLang = async (l: 'en' | 'ur') => { const s = await repo.settings.get(); await repo.settings.save({ ...s, language: l }); setLang(l); };
  if (!lang) return <Screen scroll={false}><Loading /></Screen>;
  return (
    <LicenseGate lang={lang} onLang={changeLang}>
      <AuthGate repo={repo} lang={lang} onLang={changeLang}>
        {(session, lock) => (<AppProvider repo={repo} session={session} onLock={lock}><Shell /></AppProvider>)}
      </AuthGate>
    </LicenseGate>
  );
}
