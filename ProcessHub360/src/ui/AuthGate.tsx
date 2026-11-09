// First run: create the owner. Afterwards: choose a user and enter the PIN. The app locks itself after a minute in the background.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import type { Repo } from '../db/repo';
import type { Session } from '../ctx/AppContext';
import { validPinFormat } from '../core/pin';
import { Btn, Chip, Field, Gap, LangSwitch, Loading, Row, Screen, Txt } from './kit';
import { C, S } from '../lib/theme';
import { Key, tr } from '../lib/i18n';
import { useLicense } from './LicenseGate';

export function AuthGate({ repo, lang, onLang, children }: { repo: Repo; lang: 'en' | 'ur'; onLang: (l: 'en' | 'ur') => void; children: (s: Session, lock: () => void) => React.ReactNode }) {
  const lic = useLicense();
  const t = (k: Key) => tr(lang, k);
  const [phase, setPhase] = useState<'loading' | 'setup' | 'login' | 'in'>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [pin, setPin] = useState(''); const [name, setName] = useState(''); const [biz, setBiz] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const bgAt = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!(await repo.md.hasUsers())) { setPhase('setup'); return; }
    const us = (await repo.md.listUsers()).filter((u) => u.active);
    setUsers(us); setUid((cur) => cur ?? us[0]?.id ?? null); setPhase('login');
  }, [repo]);
  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') bgAt.current = Date.now();
      else if (s === 'active' && bgAt.current && Date.now() - bgAt.current > 60000) { bgAt.current = null; setSession(null); refresh(); }
    });
    return () => sub.remove();
  }, [refresh]);

  const lock = useCallback(() => { setSession(null); setPin(''); refresh(); }, [refresh]);

  const doSetup = async () => {
    setErr(null);
    if (!name.trim()) return setErr(t('ownerNameReq'));
    if (!validPinFormat(pin)) return setErr(t('pinFormat'));
    setBusy(true);
    try {
      const s = await repo.settings.get(); if (biz.trim()) await repo.settings.save({ ...s, businessName: biz.trim() });
      const id = await repo.md.createUser({ name, roleId: 'owner', pin });
      const r = await repo.md.login(id, pin);
      if (r.ok) { setSession({ id: r.user.id, name: r.user.name, role: r.user.role }); setPhase('in'); }
    } catch (e: any) { setErr(String(e?.message ?? e)); } finally { setBusy(false); }
  };
  const doLogin = async () => {
    if (!uid) return; setErr(null); setBusy(true);
    try {
      const r = await repo.md.login(uid, pin);
      if (r.ok) { setSession({ id: r.user.id, name: r.user.name, role: r.user.role }); setPhase('in'); setPin(''); }
      else setErr(r.reason === 'locked' ? `${t('tooMany')} ${new Date(r.lockedUntil ?? 0).toLocaleTimeString()}` : r.reason === 'inactive' ? t('userDisabled') : t('wrongPin'));
    } finally { setBusy(false); }
  };

  if (phase === 'in' && session) return <>{children(session, lock)}</>;
  if (phase === 'loading') return <Screen scroll={false}><Loading /></Screen>;
  return (
    <Screen>
      <View style={{ paddingTop: 60 }}>
        <LangSwitch lang={lang} onChange={onLang} />
        <Gap />
        <Txt v="title" color={C.primary}>{phase === 'setup' ? t('setupTitle') : t('appName')}</Txt>
        {lic.daysLeft !== null && lic.daysLeft <= 14 ? <Txt color={C.accent} style={{ marginTop: S.sm }}>{lic.daysLeft} {t('licenseDays')}</Txt> : null}
        <Gap />
        {phase === 'setup' ? (
          <>
            <Field label={t('business')} value={biz} onChangeText={setBiz} />
            <Field label={t('ownerName')} value={name} onChangeText={setName} />
            <Field label={t('pin')} value={pin} onChangeText={setPin} keyboardType="number-pad" secure maxLength={8} />
          </>
        ) : (
          <>
            <Txt v="small" style={{ marginBottom: S.sm }}>{t('whoIsThis')}</Txt>
            <Row wrap gap={S.sm} style={{ marginBottom: S.lg }}>{users.map((u) => <Chip key={u.id} label={u.name} active={uid === u.id} onPress={() => { setUid(u.id); setErr(null); }} />)}</Row>
            <Field label={t('enterPin')} value={pin} onChangeText={setPin} keyboardType="number-pad" secure maxLength={8} autoFocus />
          </>
        )}
        {err ? <Txt color={C.danger} style={{ marginBottom: S.md }}>{err}</Txt> : null}
        <Btn label={phase === 'setup' ? t('save') : t('login')} onPress={phase === 'setup' ? doSetup : doLogin} loading={busy} disabled={pin.length < 4} />
      </View>
    </Screen>
  );
}
