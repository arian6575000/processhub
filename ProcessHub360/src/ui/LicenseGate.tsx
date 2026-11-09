// Blocks the app until a valid, device-bound ProcessHub 360 license is present. Exposes the verified license to the rest of the app.
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Payload } from '../license/licenseCore';
import { activateLicense, checkSavedLicense, CheckResult, REASON_KEYS } from '../license/licenseClient';
import { getDeviceId } from '../license/deviceId';
import { DEV_BYPASS } from '../license/config';
import { Btn, Card, Field, Gap, LangSwitch, Loading, Screen, Txt } from './kit';
import { C, S } from '../lib/theme';
import { Key, tr } from '../lib/i18n';

interface LicenseInfo { payload: Payload | null; daysLeft: number | null; devBypass: boolean; feature(key: string, def?: boolean): boolean }
const LicCtx = createContext<LicenseInfo | null>(null);
export const useLicense = () => { const c = useContext(LicCtx); if (!c) throw new Error('LicenseGate missing'); return c; };

export function LicenseGate({ lang, onLang, children }: { lang: 'en' | 'ur'; onLang: (l: 'en' | 'ur') => void; children: React.ReactNode }) {
  const t = (k: Key) => tr(lang, k);
  const [state, setState] = useState<'checking' | CheckResult>('checking');
  const [deviceId, setDeviceId] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { getDeviceId().then(setDeviceId).catch(() => setDeviceId('?')); checkSavedLicense().then(setState); }, []);
  const activate = useCallback(async () => { setBusy(true); try { setState(await activateLicense(key)); } finally { setBusy(false); } }, [key]);

  if (DEV_BYPASS) return <LicCtx.Provider value={{ payload: null, daysLeft: null, devBypass: true, feature: (_k, d = true) => d }}>{children}</LicCtx.Provider>;
  if (state === 'checking') return <Screen scroll={false}><Loading /></Screen>;
  if (state.ok) {
    const p = state.payload;
    return <LicCtx.Provider value={{ payload: p, daysLeft: state.daysLeft, devBypass: false, feature: (k, d = true) => (p.features?.[k] === undefined ? d : p.features[k] === true) }}>{children}</LicCtx.Provider>;
  }
  const reason = state.reason;
  return (
    <Screen>
      <View style={{ paddingTop: 60 }}>
        <LangSwitch lang={lang} onChange={onLang} />
        <Gap />
        <Txt v="title" color={C.primary}>{t('appName')}</Txt>
        <Gap />
        <Card>
          <Txt v="small">{t('deviceId')}</Txt>
          <Txt v="h" style={{ letterSpacing: 1 }}>{deviceId}</Txt>
          <Gap h={S.sm} />
          <Btn label={copied ? t('copied') : t('copy')} kind="secondary" icon="copy-outline" onPress={async () => { await Clipboard.setStringAsync(deviceId); setCopied(true); }} />
        </Card>
        <Field label={t('pasteLicense')} value={key} onChangeText={setKey} multiline />
        {reason !== 'format' || key ? <Txt color={C.danger} style={{ marginBottom: S.md }}>{t(REASON_KEYS[reason] as Key)}</Txt> : null}
        <Btn label={t('activate')} onPress={activate} loading={busy} disabled={!key.trim()} />
      </View>
    </Screen>
  );
}
