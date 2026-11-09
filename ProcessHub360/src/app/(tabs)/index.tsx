import React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp, useLoad } from '../../ctx/AppContext';
import { Btn, ErrorBox, Gap, Loading, Row, Stat, Txt } from '../../ui/kit';
import { C, S } from '../../lib/theme';
import { formatWeight } from '../../core/units';

export default function Dashboard() {
  const app = useApp(); const { t, money, can } = app; const router = useRouter();
  const { data, loading, error, reload } = useLoad(async (a) => ({ d: await a.repo.accounts.dashboard(), sync: await a.repo.sync.pending() }));
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: S.lg }} refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} />}>
      {can('jobs.create') ? <Btn label={t('newOrder')} icon="add-circle-outline" onPress={() => router.push('/order/new')} /> : null}
      <Gap />
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {!data && loading ? <Loading /> : null}
      {data ? (() => { const { d, sync } = data; return (
        <>
          <Row wrap gap={S.md} style={{ alignItems: 'stretch' }}>
            <Stat label={t('ordersToday')} value={String(d.ordersToday)} />
            <Stat label={t('pendingJobs')} value={String(d.pendingJobs)} tone={d.pendingJobs ? C.accent : undefined} />
            <Stat label={t('readyForDelivery')} value={String(d.readyJobs)} tone={C.info} />
            <Stat label={t('completedToday')} value={String(d.completedToday)} tone={C.ok} />
            <Stat label={t('inputWeight')} value={formatWeight(d.inputTodayBase)} />
            <Stat label={t('outputWeight')} value={formatWeight(d.outputTodayBase)} />
            <Stat label={t('yieldToday')} value={d.yieldBpToday === null ? '—' : `${(d.yieldBpToday / 100).toFixed(1)}%`} />
            <Stat label={t('lowStock')} value={String(d.lowStock)} tone={d.lowStock ? C.danger : undefined} />
            {can('accounts.view') ? <>
              <Stat label={t('processingBilled')} value={money(d.billedTodayMinor)} />
              <Stat label={t('collected')} value={money(d.collectedTodayMinor)} tone={C.ok} />
              <Stat label={t('expenses')} value={money(d.expensesTodayMinor)} />
              <Stat label={t('outstanding')} value={money(d.outstandingMinor)} tone={d.outstandingMinor ? C.danger : undefined} />
            </> : null}
          </Row>
          <Gap />
          <Txt v="small">{sync > 0 ? `${sync} ${t('pendingSync')}` : t('allSynced')} · {t('offline')}</Txt>
          <View style={{ height: 24 }} />
        </>); })() : null}
    </ScrollView>
  );
}
