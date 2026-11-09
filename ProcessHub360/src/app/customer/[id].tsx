import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp, useLoad } from '../../ctx/AppContext';
import { Badge, Btn, Card, Empty, ErrorBox, Loading, Row, Screen, SectionTitle, Txt } from '../../ui/kit';
import { C, S } from '../../lib/theme';
import { jobTone, statusKey } from '../../ui/status';

export default function CustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter();
  const { t, money, can, repo, toast, bump, confirm } = useApp();
  const { data, loading, error, reload } = useLoad(async (a) => ({ c: await a.repo.md.getCustomer(id), ledger: await a.repo.orders.customerLedger(id), jobs: await a.repo.orders.listJobs({ customerId: id }) }), [id]);
  if (error) return <Screen><ErrorBox message={error} onRetry={reload} /></Screen>;
  if (!data) return <Screen scroll={false}><Loading /></Screen>;
  const { c, ledger, jobs } = data;
  const lab = (l: string) => (l.startsWith('Job ') ? `${t('jobWord')} ${l.slice(4)}` : l === 'Payment' ? t('paymentWord') : l === 'Advance' ? t('advanceWord') : l === 'Refund' ? t('refund') : l);
  const del = () => confirm(t('delete'), c?.name ?? '', async () => { try { await repo.md.deleteCustomer(id); bump(); router.back(); } catch (e: any) { toast(e.message, 'error'); } });
  return (
    <Screen>
      <Txt v="title">{c?.name}</Txt>
      {c?.phone ? <Txt>{c.phone}</Txt> : null}{c?.address ? <Txt v="small">{c.address}</Txt> : null}
      <Card style={{ marginTop: S.lg }}>
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('charges')}</Txt><Txt>{money(ledger.billedMinor)}</Txt></Row>
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('paid')}</Txt><Txt color={C.ok}>{money(ledger.paidMinor)}</Txt></Row>
        <Row style={{ justifyContent: 'space-between' }}><Txt v="h">{t('balance')}</Txt><Txt v="h" color={ledger.balanceMinor > 0 ? C.danger : C.ok}>{money(ledger.balanceMinor)}</Txt></Row>
      </Card>
      {can('jobs.create') ? <Btn label={t('newOrder')} icon="add-circle-outline" onPress={() => router.push({ pathname: '/order/new', params: { customerId: id } })} /> : null}
      <SectionTitle>{t('jobs')}</SectionTitle>
      {jobs.length === 0 ? <Empty icon="layers-outline" title={t('noJobs')} /> : jobs.map((j) => (
        <Card key={j.id} onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })}><Row style={{ justifyContent: 'space-between' }}><Txt v="h">{j.token}</Txt><Badge label={t(statusKey(j.status))} tone={jobTone(j.status)} /></Row><Txt v="small">{j.definitionName} · {money(j.chargeMinor)}</Txt></Card>
      ))}
      <SectionTitle>{t('ledger')}</SectionTitle>
      {ledger.entries.length === 0 ? <Txt v="small">—</Txt> : [...ledger.entries].reverse().map((e, i) => (
        <Row key={i} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
          <Txt v="small" style={{ flex: 1 }}>{new Date(e.at).toLocaleDateString()} · {lab(e.label)}</Txt>
          <Txt v="small" color={e.creditMinor ? C.ok : C.ink}>{e.debitMinor ? `+${money(e.debitMinor)}` : `-${money(e.creditMinor)}`}</Txt>
        </Row>
      ))}
      {can('customers.manage') ? <><SectionTitle> </SectionTitle><Btn label={t('delete')} kind="ghost" onPress={del} /></> : null}
    </Screen>
  );
}
