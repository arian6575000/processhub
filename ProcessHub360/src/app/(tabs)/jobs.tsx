import React, { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp, useLoad } from '../../ctx/AppContext';
import { Badge, Card, Chip, Empty, ErrorBox, Fab, Loading, Row, Txt } from '../../ui/kit';
import { C, S } from '../../lib/theme';
import { formatWeight } from '../../core/units';
import { jobTone, statusKey } from '../../ui/status';
import type { JobStatus } from '../../core/tokens';

const FILTERS: { key: string; statuses?: JobStatus[]; label: 'jobs' | 'pending' | 'ready' | 'delivered' }[] = [
  { key: 'all', label: 'jobs' }, { key: 'pending', statuses: ['received', 'in_progress'], label: 'pending' },
  { key: 'ready', statuses: ['ready', 'partially_delivered'], label: 'ready' }, { key: 'done', statuses: ['delivered'], label: 'delivered' },
];

export default function Jobs() {
  const { t, money, can } = useApp(); const router = useRouter();
  const [f, setF] = useState('all');
  const { data, loading, error, reload } = useLoad((a) => a.repo.orders.listJobs({ statuses: FILTERS.find((x) => x.key === f)?.statuses }), [f]);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Row wrap gap={S.sm} style={{ padding: S.lg, paddingBottom: S.sm }}>{FILTERS.map((x) => <Chip key={x.key} label={t(x.label)} active={f === x.key} onPress={() => setF(x.key)} />)}</Row>
      {error ? <View style={{ padding: S.lg }}><ErrorBox message={error} onRetry={reload} /></View> : null}
      {!data && loading ? <Loading /> : (
        <FlatList data={data ?? []} keyExtractor={(j) => j.id} contentContainerStyle={{ padding: S.lg, paddingTop: 0, paddingBottom: 100 }} onRefresh={reload} refreshing={false}
          ListEmptyComponent={<Empty icon="layers-outline" title={t('noJobs')} hint={t('noJobsHint')} />}
          renderItem={({ item: j }) => (
            <Card onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })}>
              <Row style={{ justifyContent: 'space-between' }}><Txt v="h">{j.token}</Txt><Badge label={t(statusKey(j.status))} tone={jobTone(j.status)} /></Row>
              <Txt>{j.definitionName}{j.customerName ? ` · ${j.customerName}` : j.ownership === 'business' ? ` · ${t('ownStock')}` : ''}</Txt>
              <Txt v="small">{formatWeight(j.inputBase)}{j.ownership === 'customer' ? ` · ${money(j.chargeMinor)}` : ''}</Txt>
            </Card>
          )} />
      )}
      {can('jobs.create') ? <Fab label={t('newOrder')} onPress={() => router.push('/order/new')} /> : null}
    </View>
  );
}
