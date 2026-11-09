import React, { useState } from 'react';
import { useApp, useLoad } from '../ctx/AppContext';
import { useLicense } from '../ui/LicenseGate';
import { Badge, Btn, Card, ErrorBox, Field, Loading, Row, Screen, SectionTitle, Select, Txt } from '../ui/kit';
import { S } from '../lib/theme';
import { fill } from '../lib/i18n';
import type { Key } from '../lib/i18n';
import type { RoleDef } from '../core/rbac';

export default function Users() {
  const { t, repo, toast, bump, session, msg } = useApp();
  const roleName = (r?: RoleDef) => (r ? (r.system ? t(`role_${r.id}` as Key) : r.name) : ''); const lic = useLicense();
  const { data, error, reload } = useLoad(async (a) => ({ users: await a.repo.md.listUsers(), roles: await a.repo.md.listRoles(), log: await a.repo.md.activity(15) }));
  const [name, setName] = useState(''), [pin, setPin] = useState(''), [role, setRole] = useState<string | null>('operator');
  if (error) return <Screen><ErrorBox message={error} onRetry={reload} /></Screen>;
  if (!data) return <Screen scroll={false}><Loading /></Screen>;
  const active = data.users.filter((u) => u.active).length;
  const max = lic.payload?.max_users ?? null;
  const add = async () => { try { if (max !== null && active >= max) throw new Error(fill(t('licenseUsers'), { n: max })); await repo.md.createUser({ name, roleId: role!, pin }, session.id); setName(''); setPin(''); bump(); toast(t('saved')); } catch (e: any) { toast(e.message, 'error'); } };
  return (
    <Screen>
      {max !== null ? <Txt v="small" style={{ marginBottom: S.sm }}>{active} / {max} {t('usersWord')}</Txt> : null}
      {data.users.map((u) => (
        <Card key={u.id}><Row style={{ justifyContent: 'space-between' }}><Txt v="h">{u.name}</Txt><Badge label={roleName(data.roles.find((r) => r.id === u.roleId)) || u.roleId} tone={u.active ? 'ok' : 'neutral'} /></Row>
          {u.id !== session.id ? <Btn label={u.active ? t('disable') : t('enable')} kind="ghost" onPress={async () => { try { await repo.md.setUserActive(u.id, !u.active, session.id); bump(); } catch (e: any) { toast(e.message, 'error'); } }} /> : null}</Card>
      ))}
      <SectionTitle>{t('add')}</SectionTitle>
      <Field label={t('name')} value={name} onChangeText={setName} />
      <Select label={t('role')} value={role} options={data.roles.map((r) => ({ value: r.id, label: roleName(r) }))} onChange={setRole} />
      <Field label={t('pin')} value={pin} onChangeText={setPin} keyboardType="number-pad" secure maxLength={8} />
      <Btn label={t('add')} onPress={add} disabled={!name || pin.length < 4} />
      <SectionTitle>{t('history')}</SectionTitle>
      {data.log.map((l) => <Txt key={l.id} v="small">{new Date(l.at).toLocaleString()} · {data.users.find((u) => u.id === l.user_id)?.name ?? '-'} · {l.action}{l.detail ? ` · ${l.detail}` : ''}</Txt>)}
    </Screen>
  );
}
