import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, I18nManager } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { Repo } from '../db/repo';
import type { Settings } from '../db/types';
import { DEFAULT_SETTINGS } from '../db/types';
import { Key, tr, trMsg } from '../lib/i18n';
import { hasPermission, Permission, RoleDef } from '../core/rbac';
import { formatMoney } from '../core/money';

export interface Session { id: string; name: string; role: RoleDef }
interface Ctx {
  repo: Repo; settings: Settings; saveSettings(s: Partial<Settings>): Promise<void>;
  lang: 'en' | 'ur'; rtl: boolean; t(k: Key): string; msg(m: string): string; money(minor: number): string;
  session: Session; can(p: Permission): boolean; lock(): void;
  toast(msg: string, kind?: 'ok' | 'error'): void; toastState: { msg: string; kind: 'ok' | 'error' } | null;
  confirm(title: string, message: string, onYes: () => void): void;
  tick: number; bump(): void;
}
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error('AppProvider missing'); return c; };

export function AppProvider({ repo, session, onLock, children }: { repo: Repo; session: Session; onLock: () => void; children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [toastState, setToast] = useState<Ctx['toastState']>(null);
  const [tick, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { repo.settings.get().then(setSettings); }, [repo]);
  useEffect(() => { I18nManager.allowRTL(false); }, []);

  const value = useMemo<Ctx>(() => {
    const lang = settings.language;
    return {
      repo, settings, lang, rtl: lang === 'ur', session, tick,
      t: (k) => tr(lang, k), msg: (m) => trMsg(lang, m), money: (m) => formatMoney(m, settings.currency),
      can: (p) => hasPermission(session.role, p), lock: onLock,
      saveSettings: async (s) => { const next = await repo.settings.save({ ...settings, ...s }); setSettings(next); },
      toast: (msg, kind = 'ok') => { setToast({ msg: kind === 'error' ? trMsg(lang, msg) : msg, kind }); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setToast(null), 2600); },
      toastState,
      confirm: (title, message, onYes) => Alert.alert(title, message, [{ text: tr(lang, 'cancel'), style: 'cancel' }, { text: tr(lang, 'confirm'), style: 'destructive', onPress: onYes }]),
      bump: () => setTick((x) => x + 1),
    };
  }, [repo, settings, session, tick, toastState, onLock]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

/** Runs `fn` every time the screen gains focus (and when data is bumped). Returns [data, loading, reload]. */
export function useLoad<T>(fn: (app: Ctx) => Promise<T>, deps: any[] = []): { data: T | null; loading: boolean; error: string | null; reload(): void } {
  const app = useApp();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(() => {
    let live = true;
    fn(app).then((d) => { if (live) { setData(d); setError(null); setLoading(false); } }).catch((e) => { if (live) { setError(String(e?.message ?? e)); setLoading(false); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.tick, app.settings.language, ...deps]);
  useFocusEffect(run);
  return { data, loading, error, reload: app.bump };
}
export const useRtl = () => useContext(AppCtx)?.rtl ?? false;
export const useLang = () => useContext(AppCtx)?.lang ?? 'en';
