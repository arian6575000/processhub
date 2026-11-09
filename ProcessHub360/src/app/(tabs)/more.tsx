import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../ctx/AppContext';
import { Card, Row, Screen, Txt } from '../../ui/kit';
import { C, S } from '../../lib/theme';
import type { Permission } from '../../core/rbac';
import type { Key } from '../../lib/i18n';

const ITEMS: { label: Key; icon: keyof typeof Ionicons.glyphMap; route: string; perm?: Permission }[] = [
  { label: 'processingSetup', icon: 'settings-outline', route: '/definition', perm: 'definitions.manage' },
  { label: 'cashAndExpenses', icon: 'cash-outline', route: '/cash', perm: 'accounts.view' },
  { label: 'users', icon: 'shield-checkmark-outline', route: '/users', perm: 'users.manage' },
  { label: 'syncStatus', icon: 'sync-outline', route: '/sync', perm: 'sync.manage' },
  { label: 'settings', icon: 'options-outline', route: '/settings', perm: 'settings.manage' },
];

export default function More() {
  const { t, can, lock, session } = useApp(); const router = useRouter();
  return (
    <Screen>
      <Txt v="small" style={{ marginBottom: S.md }}>{session.name} · {session.role.system ? t(`role_${session.role.id}` as Key) : session.role.name}</Txt>
      {ITEMS.filter((i) => !i.perm || can(i.perm)).map((i) => (
        <Card key={i.route} onPress={() => router.push(i.route as any)}><Row><Ionicons name={i.icon} size={24} color={C.primary} /><Txt v="h">{t(i.label)}</Txt></Row></Card>
      ))}
      <Card onPress={lock}><Row><Ionicons name="lock-closed-outline" size={24} color={C.primary} /><Txt v="h">{t('lock')}</Txt></Row></Card>
    </Screen>
  );
}
