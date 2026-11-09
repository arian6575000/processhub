import React, { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Share } from 'react-native';
import { useApp, useLoad } from '../../ctx/AppContext';
import { Badge, Btn, Card, ErrorBox, Field, Gap, Loading, Row, Screen, SectionTitle, Select, Txt, WeightField, weightToGrams } from '../../ui/kit';
import { C, S } from '../../lib/theme';
import { formatWeight } from '../../core/units';
import { parseMoney } from '../../core/money';
import { jobTone, payTone, stageTone, statusKey } from '../../ui/status';
import type { LineRole } from '../../core/processing';
import type { Key } from '../../lib/i18n';

type OutRole = Exclude<LineRole, 'input' | 'intermediate'>;

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, money, can, repo, toast, bump, confirm, session, settings } = useApp();
  const { data, error, reload } = useLoad(async (a) => {
    const job = await a.repo.orders.getJob(id);
    return { job, order: await a.repo.orders.getOrder(job.orderId), sum: await a.repo.orders.orderSummary(job.orderId), mats: await a.repo.md.listMaterials(), deliveries: await a.repo.kernel.db.getAllAsync<any>('SELECT qty_base, at FROM deliveries WHERE job_id = ? ORDER BY at', [id]) };
  }, [id]);
  const [busy, setBusy] = useState(false);
  const [lineMat, setLineMat] = useState<string | null>(null), [lineRole, setLineRole] = useState<OutRole>('output'), [lineW, setLineW] = useState(''), [lineU, setLineU] = useState<'kg' | 'mann' | 'g'>('kg');
  const [pending, setPending] = useState<{ materialId: string; role: OutRole; qtyBase: number }[] | null>(null);
  const [delW, setDelW] = useState(''), [delU, setDelU] = useState<'kg' | 'mann' | 'g'>('kg');
  const [pay, setPay] = useState(''), [method, setMethod] = useState('cash');
  const [expense, setExpense] = useState('');

  if (error) return <Screen><ErrorBox message={error} onRetry={reload} /></Screen>;
  if (!data) return <Screen scroll={false}><Loading /></Screen>;
  const { job, sum, mats, deliveries } = data;
  const matName = (mid: string) => mats.find((m) => m.id === mid)?.name ?? '?';
  const jobSum = sum.jobs.find((j) => j.jobId === job.id);
  const editable = job.status === 'received' || job.status === 'in_progress' || (job.status === 'ready' && !job.stockPosted);
  const lines = pending ?? job.lines.filter((l) => l.role !== 'input').map((l) => ({ materialId: l.materialId, role: l.role as OutRole, qtyBase: l.qtyBase }));

  const run = async (fn: () => Promise<void>, ok = true) => { setBusy(true); try { await fn(); bump(); if (ok) toast(t('saved')); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } };
  const act = (a: Parameters<typeof repo.orders.jobAction>[1]) => run(() => repo.orders.jobAction(job.id, a, session.id));
  const stageDef = (i: number) => job.workflow.stages[i];

  const receipt = () => Share.share({ message: [settings.businessName || 'ProcessHub 360', `${t('token')}: ${job.token}`, `${t('customer')}: ${job.customerName || '-'}`, `${job.definitionName}`, `${t('inputWeight')}: ${formatWeight(job.inputBase)}`,
    job.ownership === 'customer' ? `${t('total')}: ${money(job.chargeMinor)}` : '', jobSum ? `${t('paid')}: ${money(jobSum.paidMinor)}  ${t('balance')}: ${money(jobSum.balanceMinor)}` : ''].filter(Boolean).join('\n') });

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}><Txt v="title">{job.token}</Txt><Badge label={t(statusKey(job.status))} tone={jobTone(job.status)} /></Row>
      <Txt>{job.definitionName} · {job.customerName || (job.ownership === 'business' ? t('ownStock') : t('walkIn'))}</Txt>
      <Txt v="small">{formatWeight(job.inputBase)} · {t('workflowWord')} v{job.workflow.version}{job.bags ? ` · ${job.bags} ${t('bags')}` : ''}</Txt>
      <Gap h={S.sm} /><Btn label={t('shareReceipt')} kind="secondary" icon="share-outline" onPress={receipt} />

      <SectionTitle>{t('stages')}</SectionTitle>
      {job.runtime.stages.map((s, i) => {
        const d = stageDef(i);
        return (
          <Card key={s.key}>
            <Row style={{ justifyContent: 'space-between' }}><Txt v="h">{i + 1}. {d.name}</Txt><Badge label={t(statusKey(s.status))} tone={stageTone(s.status)} /></Row>
            <Txt v="small">{d.mandatory ? t('mandatory') : t('optional')}{d.requiresQc ? ` · ${t('needsQc')}` : ''}{d.requiresApproval ? ` · ${t('needsApproval')}` : ''}</Txt>
            {can('jobs.operate') && (job.status === 'received' || job.status === 'in_progress') ? (
              <Row wrap gap={S.sm} style={{ marginTop: S.sm }}>
                {s.status === 'pending' ? <Btn label={t('start')} onPress={() => act({ type: 'start', idx: i })} disabled={busy} /> : null}
                {s.status === 'pending' && !d.mandatory ? <Btn label={t('skip')} kind="ghost" onPress={() => act({ type: 'skip', idx: i })} disabled={busy} /> : null}
                {s.status === 'in_progress' && d.requiresQc ? <><Btn label={`${t('complete')} ✓ QC`} onPress={() => act({ type: 'complete', idx: i, qcPassed: true, expenseMinor: expense ? parseMoney(expense) : undefined })} disabled={busy} /><Btn label={t('qcFailed')} kind="danger" onPress={() => act({ type: 'complete', idx: i, qcPassed: false })} disabled={busy} /></> : null}
                {s.status === 'in_progress' && !d.requiresQc ? <Btn label={t('complete')} onPress={() => act({ type: 'complete', idx: i, expenseMinor: expense ? parseMoney(expense) : undefined })} disabled={busy} /> : null}
                {s.status === 'awaiting_approval' && can('jobs.approve') ? <><Btn label={t('approve')} onPress={() => act({ type: 'approve', idx: i })} disabled={busy} /><Btn label={t('reject')} kind="danger" onPress={() => act({ type: 'reject', idx: i, reason: t('rejectedByApprover') })} disabled={busy} /></> : null}
                {s.status === 'rejected' ? <Btn label={t('reopen')} kind="secondary" onPress={() => act({ type: 'reopen', idx: i })} disabled={busy} /> : null}
              </Row>
            ) : null}
            {s.expenseMinor ? <Txt v="small">{t('expenses')}: {money(s.expenseMinor)}</Txt> : null}
          </Card>
        );
      })}
      {can('jobs.operate') && (job.status === 'received' || job.status === 'in_progress') ? <Field label={`${t('expenses')} (${t('amount')}) — next completed stage`} value={expense} onChangeText={setExpense} keyboardType="decimal-pad" /> : null}

      <SectionTitle>{t('outputs')}</SectionTitle>
      {lines.length === 0 ? <Txt v="small">—</Txt> : lines.map((l, i) => <Row key={i} style={{ justifyContent: 'space-between' }}><Txt>{matName(l.materialId)} · {t(l.role as any)}</Txt><Txt>{formatWeight(l.qtyBase)}</Txt></Row>)}
      {editable && can('jobs.operate') ? (
        <Card style={{ marginTop: S.md }}>
          <Select label={t('material')} value={lineMat} options={mats.filter((m) => m.kind !== 'raw').map((m) => ({ value: m.id, label: m.name }))} onChange={setLineMat} />
          <Row wrap gap={S.sm} style={{ marginBottom: S.md }}>{(['output', 'byproduct', 'waste'] as OutRole[]).map((r) => <Btn key={r} label={t(r as any)} kind={lineRole === r ? 'primary' : 'ghost'} onPress={() => setLineRole(r)} />)}</Row>
          <WeightField label={t('weight')} text={lineW} unit={lineU} onText={setLineW} onUnit={setLineU} labels={{ kg: t('kg'), mann: t('mann'), g: t('gram') }} />
          <Row gap={S.sm}>
            <Btn flex label={t('add')} kind="secondary" disabled={!lineMat || weightToGrams(lineW, lineU) <= 0} onPress={() => { setPending([...lines, { materialId: lineMat!, role: lineRole, qtyBase: weightToGrams(lineW, lineU) }]); setLineW(''); }} />
            {pending ? <Btn flex label={t('save')} loading={busy} onPress={() => run(async () => { await repo.orders.recordLines(job.id, pending, session.id); setPending(null); })} /> : null}
          </Row>
        </Card>
      ) : null}
      <Card style={{ marginTop: S.md }}>
        <Txt v="h">{t('reconciliation')}</Txt>
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('inputWeight')}</Txt><Txt>{formatWeight(job.recon.inputBase)}</Txt></Row>
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('output')}</Txt><Txt>{formatWeight(job.recon.outputBase)}</Txt></Row>
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('yieldLabel')}</Txt><Txt>{(job.recon.yieldBp / 100).toFixed(1)}%</Txt></Row>
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('unaccounted')}</Txt><Txt color={job.recon.status === 'balanced' ? C.ok : C.danger}>{formatWeight(job.recon.unaccountedBase)} · {t(`recon_${job.recon.status}` as Key)}</Txt></Row>
      </Card>

      {job.ownership === 'customer' ? (<>
        <SectionTitle>{t('deliver')}</SectionTitle>
        <Txt v="small">{formatWeight(job.deliveredBase)} / {formatWeight(job.deliverableBase)}</Txt>
        {deliveries.map((d: any, i: number) => <Txt key={i} v="small">{new Date(d.at).toLocaleString()} · {formatWeight(d.qty_base)}</Txt>)}
        {can('jobs.deliver') && (job.status === 'ready' || job.status === 'partially_delivered') ? (<>
          <Gap h={S.sm} /><WeightField label={t('weight')} text={delW} unit={delU} onText={setDelW} onUnit={setDelU} labels={{ kg: t('kg'), mann: t('mann'), g: t('gram') }} />
          <Row gap={S.sm}><Btn flex label={t('deliver')} disabled={weightToGrams(delW, delU) <= 0} loading={busy} onPress={() => run(async () => { await repo.orders.deliver(job.id, weightToGrams(delW, delU), { userId: session.id }); setDelW(''); })} />
            <Btn flex label={t('all')} kind="secondary" onPress={() => run(async () => { await repo.orders.deliver(job.id, job.deliverableBase - job.deliveredBase, { userId: session.id }); })} disabled={job.deliverableBase - job.deliveredBase <= 0} /></Row>
        </>) : null}

        <SectionTitle>{t('charges')}</SectionTitle>
        <Card>
          {job.charge?.lines.map((l) => <Row key={l.ruleId} style={{ justifyContent: 'space-between' }}><Txt>{l.label}</Txt><Txt>{money(l.amountMinor)}</Txt></Row>)}
          {job.charge && job.charge.minAdjustmentMinor > 0 ? <Row style={{ justifyContent: 'space-between' }}><Txt>{t('minTopUp')}</Txt><Txt>{money(job.charge.minAdjustmentMinor)}</Txt></Row> : null}
          <Row style={{ justifyContent: 'space-between' }}><Txt v="h">{t('total')}</Txt><Txt v="h">{money(job.chargeMinor)}</Txt></Row>
          {jobSum ? <><Row style={{ justifyContent: 'space-between' }}><Txt>{t('paid')}</Txt><Txt color={C.ok}>{money(jobSum.paidMinor)}</Txt></Row><Row style={{ justifyContent: 'space-between' }}><Txt>{t('balance')}</Txt><Badge label={`${money(jobSum.balanceMinor)}`} tone={payTone(jobSum.status)} /></Row></> : null}
        </Card>
        {can('payments.collect') && job.status !== 'cancelled' ? (<>
          <Field label={`${t('collectPayment')} (${t('amount')})`} value={pay} onChangeText={setPay} keyboardType="decimal-pad" />
          <Row wrap gap={S.sm} style={{ marginBottom: S.md }}>{['cash', 'bank', 'wallet'].map((m) => <Btn key={m} label={t(m as Key)} kind={method === m ? 'primary' : 'ghost'} onPress={() => setMethod(m)} />)}</Row>
          <Btn label={t('collectPayment')} disabled={!pay} loading={busy} onPress={() => run(async () => { await repo.orders.addPayment({ jobId: job.id, amountMinor: parseMoney(pay), method, userId: session.id }); setPay(''); })} />
        </>) : null}
      </>) : null}

      <SectionTitle>{t('history')}</SectionTitle>
      {[...job.runtime.history].reverse().map((h, i) => <Txt key={i} v="small">{new Date(h.at).toLocaleTimeString()} · {job.workflow.stages.find((s) => s.key === h.stageKey)?.name} → {t(h.to as Key)}{h.note ? ` (${h.note})` : ''}</Txt>)}
      {job.status !== 'delivered' && job.status !== 'partially_delivered' && job.status !== 'cancelled' && can('jobs.create') ? <><Gap h={S.lg} /><Btn label={t('cancelJob')} kind="ghost" onPress={() => confirm(t('cancelJob'), job.token, () => run(() => repo.orders.cancelJob(job.id, session.id)))} /></> : null}
    </Screen>
  );
}
