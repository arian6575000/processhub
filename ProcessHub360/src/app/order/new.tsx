import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp, useLoad } from '../../ctx/AppContext';
import { Btn, Card, Chip, ErrorBox, Field, Gap, Loading, Row, Screen, SectionTitle, Select, Txt, WeightField, weightToGrams } from '../../ui/kit';
import { C, S } from '../../lib/theme';
import { computeCharge } from '../../core/pricing';
import { formatWeight } from '../../core/units';
import type { Ownership } from '../../core/ownership';

interface Draft { definitionId: string | null; materialId: string | null; weight: string; unit: 'kg' | 'mann' | 'g'; bags: string; ownership: Ownership }
const blank = (): Draft => ({ definitionId: null, materialId: null, weight: '', unit: 'kg', bags: '', ownership: 'customer' });

export default function NewOrder() {
  const { customerId: presetCustomer } = useLocalSearchParams<{ customerId?: string }>(); const router = useRouter();
  const { t, repo, session, toast, bump, money, can, msg } = useApp();
  const { data, error, reload } = useLoad(async (a) => ({ customers: await a.repo.md.listCustomers(), defs: (await a.repo.md.listDefinitions()).filter((d) => d.active), mats: await a.repo.md.listMaterials() }));
  const [mode, setMode] = useState<'single' | 'master'>('single');
  const [customerId, setCustomerId] = useState<string | null>(presetCustomer ?? null);
  const [walkIn, setWalkIn] = useState('');
  const [jobs, setJobs] = useState<Draft[]>([blank()]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  if (error) return <Screen><ErrorBox message={error} onRetry={reload} /></Screen>;
  if (!data) return <Screen scroll={false}><Loading /></Screen>;
  if (data.defs.length === 0) return <Screen><ErrorBox message={t('needDefinition')} /></Screen>;

  const upd = (i: number, p: Partial<Draft>) => setJobs((js) => js.map((j, k) => (k === i ? { ...j, ...p } : j)));
  const preview = (j: Draft) => {
    const d = data.defs.find((x) => x.id === j.definitionId); const g = weightToGrams(j.weight, j.unit);
    if (!d || !g || j.ownership === 'business') return null;
    return computeCharge(d.pricing, { inputBase: g, bags: parseInt(j.bags || '0', 10) || 0, stageCount: d.stages.length }).totalMinor;
  };
  const total = jobs.reduce((a, j) => a + (preview(j) ?? 0), 0);

  const submit = async () => {
    setErr(null);
    for (const j of jobs) if (!j.definitionId || !j.materialId || weightToGrams(j.weight, j.unit) <= 0) return setErr(t('chooseAll'));
    setBusy(true);
    try {
      const r = await repo.orders.createOrder({
        mode, customerId: jobs.some((j) => j.ownership === 'business') ? null : customerId, walkInName: walkIn, userId: session.id,
        jobs: jobs.map((j) => ({ definitionId: j.definitionId!, ownership: j.ownership, bags: parseInt(j.bags || '0', 10) || 0, inputs: [{ materialId: j.materialId!, qtyBase: weightToGrams(j.weight, j.unit) }] })),
      });
      bump(); toast(`${t('token')} ${r.token}`);
      router.replace(mode === 'single' ? { pathname: '/job/[id]', params: { id: r.jobIds[0] } } : '/(tabs)/jobs');
    } catch (e: any) { setErr(msg(e.message)); } finally { setBusy(false); }
  };

  return (
    <Screen footer={<View>{total > 0 ? <Row style={{ justifyContent: 'space-between', marginBottom: S.sm }}><Txt>{t('total')}</Txt><Txt v="h">{money(total)}</Txt></Row> : null}<Btn label={t('createOrder')} onPress={submit} loading={busy} /></View>}>
      <Row gap={S.sm}><Chip label={t('singleToken')} active={mode === 'single'} onPress={() => { setMode('single'); setJobs((j) => j.slice(0, 1)); }} /><Chip label={t('masterToken')} active={mode === 'master'} onPress={() => setMode('master')} /></Row>
      <Gap />
      <Select label={t('customer')} value={customerId} placeholder={t('walkIn')} options={[{ value: '', label: t('walkIn') }, ...data.customers.map((c) => ({ value: c.id, label: c.name }))]} onChange={(v) => setCustomerId(v || null)} />
      {!customerId ? <Field label={`${t('name')} (${t('walkIn')})`} value={walkIn} onChangeText={setWalkIn} /> : null}
      {jobs.map((j, i) => {
        const p = preview(j);
        return (
          <Card key={i}>
            <Row style={{ justifyContent: 'space-between' }}><Txt v="h">{mode === 'master' ? `${t('jobs')} ${i + 1}` : t('process')}</Txt>{jobs.length > 1 ? <Chip label={t('delete')} onPress={() => setJobs((js) => js.filter((_, k) => k !== i))} /> : null}</Row>
            <Gap h={S.sm} />
            {can('inventory.manage') ? <Row gap={S.sm} style={{ marginBottom: S.md }}><Chip label={t('customersMaterial')} active={j.ownership === 'customer'} onPress={() => upd(i, { ownership: 'customer' })} /><Chip label={t('ownStock')} active={j.ownership === 'business'} onPress={() => upd(i, { ownership: 'business' })} /></Row> : null}
            <Select label={t('process')} value={j.definitionId} options={data.defs.map((d) => ({ value: d.id, label: d.name }))} onChange={(v) => upd(i, { definitionId: v })} />
            <Select label={t('material')} value={j.materialId} options={data.mats.filter((m) => m.kind === 'raw' || m.kind === 'intermediate').map((m) => ({ value: m.id, label: m.name }))} onChange={(v) => upd(i, { materialId: v })} />
            <WeightField label={t('weight')} text={j.weight} unit={j.unit} onText={(s) => upd(i, { weight: s })} onUnit={(u) => upd(i, { unit: u })} labels={{ kg: t('kg'), mann: t('mann'), g: t('gram') }} />
            <Field label={t('bags')} value={j.bags} onChangeText={(s) => upd(i, { bags: s })} keyboardType="number-pad" />
            {p !== null ? <Txt color={C.primary}>{t('charges')}: {money(p)} · {formatWeight(weightToGrams(j.weight, j.unit))}</Txt> : null}
          </Card>
        );
      })}
      {mode === 'master' ? <Btn label={t('addJob')} kind="secondary" icon="add" onPress={() => setJobs((js) => [...js, blank()])} /> : null}
      {err ? <><SectionTitle> </SectionTitle><ErrorBox message={err} /></> : null}
    </Screen>
  );
}
