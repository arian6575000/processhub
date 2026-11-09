import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../ctx/AppContext';
import { Btn, Card, Chip, ErrorBox, Field, Gap, Row, Screen, SectionTitle, Select, Txt } from '../../ui/kit';
import { C, S } from '../../lib/theme';
import { newId } from '../../core/ids';
import { parseMoney } from '../../core/money';
import type { StageDef } from '../../core/workflow';
import type { PriceRule, RuleKind } from '../../core/pricing';
import { emptyPolicy } from '../../core/pricing';
import type { Key } from '../../lib/i18n';
import { fill } from '../../lib/i18n';

const KINDS: { value: RuleKind; label: Key; hint: Key }[] = [
  { value: 'per_kg', label: 'perKg', hint: 'hintKg' }, { value: 'per_mann', label: 'perMann', hint: 'hintMann' },
  { value: 'per_gram', label: 'perGram', hint: 'hintGram' }, { value: 'per_bag', label: 'perBag', hint: 'hintBag' },
  { value: 'fixed', label: 'fixedCharge', hint: 'hintJob' }, { value: 'per_machine_hour', label: 'perMachineHour', hint: 'hintHour' },
  { value: 'per_stage', label: 'perStage', hint: 'hintStage' }, { value: 'expression', label: 'customFormula', hint: 'hintFormula' },
];
interface RuleDraft { id: string; label: string; kind: RuleKind; rate: string; expr: string }
const toDraft = (r: PriceRule): RuleDraft => ({ id: r.id, label: r.label, kind: r.kind, rate: r.rateMinor !== undefined ? String(r.rateMinor / 100) : '', expr: r.expr ?? '' });
const fromDraft = (d: RuleDraft): PriceRule => d.kind === 'expression' ? { id: d.id, label: d.label || 'Formula', kind: d.kind, expr: d.expr } : { id: d.id, label: d.label || 'Charge', kind: d.kind, rateMinor: d.rate ? parseMoney(d.rate) : 0 };

function Rules({ title, rules, onChange }: { title: string; rules: RuleDraft[]; onChange: (r: RuleDraft[]) => void }) {
  const { t } = useApp();
  const set = (i: number, p: Partial<RuleDraft>) => onChange(rules.map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      {rules.map((r, i) => (
        <Card key={r.id}>
          <Field label={t('label')} value={r.label} onChangeText={(s) => set(i, { label: s })} />
          <Select label={t('method')} value={r.kind} options={KINDS.map((k) => ({ value: k.value, label: t(k.label) }))} onChange={(v) => set(i, { kind: v })} />
          {r.kind === 'expression' ? <Field label={t(KINDS.find((k) => k.value === r.kind)!.hint)} value={r.expr} onChangeText={(s) => set(i, { expr: s })} placeholder="max(kg * 3, 50)" /> : <Field label={t(KINDS.find((k) => k.value === r.kind)!.hint)} value={r.rate} onChangeText={(s) => set(i, { rate: s })} keyboardType="decimal-pad" />}
          <Btn label={t('remove')} kind="ghost" onPress={() => onChange(rules.filter((_, k) => k !== i))} />
        </Card>
      ))}
      <Btn label={t('addRule')} kind="secondary" icon="add" onPress={() => onChange([...rules, { id: newId().slice(0, 8), label: '', kind: 'per_kg', rate: '', expr: '' }])} />
    </>
  );
}

export default function EditDefinition() {
  const { id } = useLocalSearchParams<{ id?: string }>(); const router = useRouter();
  const { t, repo, toast, bump, msg } = useApp();
  const [name, setName] = useState(''), [policy, setPolicy] = useState<'return_to_customer' | 'keep_by_business'>('return_to_customer');
  const [stages, setStages] = useState<StageDef[]>([{ key: `s_${newId().slice(0, 6)}`, name: 'Receiving', mandatory: true, requiresApproval: false, requiresQc: false }]);
  const [charge, setCharge] = useState<RuleDraft[]>([]), [cost, setCost] = useState<RuleDraft[]>([]), [minCharge, setMinCharge] = useState('');
  const [version, setVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    repo.md.getDefinition(id).then((d) => { if (!d) return; setName(d.name); setPolicy(d.byproductPolicy); setStages(d.stages); setCharge(d.pricing.chargeRules.map(toDraft)); setCost(d.pricing.costRules.map(toDraft)); setMinCharge(d.pricing.minChargeMinor ? String(d.pricing.minChargeMinor / 100) : ''); setVersion(d.version); });
  }, [id, repo]);

  const upd = (i: number, p: Partial<StageDef>) => setStages((s) => s.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) => setStages((s) => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const pricing = { ...emptyPolicy(), chargeRules: charge.map(fromDraft), costRules: cost.map(fromDraft), minChargeMinor: minCharge ? parseMoney(minCharge) : 0 };
      const r = await repo.md.saveDefinition({ id, name, stages, pricing, byproductPolicy: policy });
      bump(); toast(`${t('saved')} · v${r.version}`); router.back();
    } catch (e: any) { setErr(msg(e.message)); } finally { setBusy(false); }
  };

  return (
    <Screen footer={<Btn label={t('save')} onPress={save} loading={busy} />}>
      <Field label={t('definitionName')} value={name} onChangeText={setName} autoFocus={!id} />
      {version ? <Txt v="small" style={{ marginBottom: S.md }}>{fill(t('workflowNote'), { v: version })}</Txt> : null}
      <Select label={t('byproductsPolicy')} value={policy} options={[{ value: 'return_to_customer', label: t('returnToCustomer') }, { value: 'keep_by_business', label: t('keptByBusiness') }]} onChange={setPolicy} />

      <SectionTitle>{t('stages')}</SectionTitle>
      {stages.map((s, i) => (
        <Card key={s.key}>
          <Field label={`${t('stageName')} ${i + 1}`} value={s.name} onChangeText={(v) => upd(i, { name: v })} />
          <Row wrap gap={S.sm}>
            <Chip label={t('mandatory')} active={s.mandatory} onPress={() => upd(i, { mandatory: !s.mandatory })} />
            <Chip label={t('needsQc')} active={s.requiresQc} onPress={() => upd(i, { requiresQc: !s.requiresQc })} />
            <Chip label={t('needsApproval')} active={s.requiresApproval} onPress={() => upd(i, { requiresApproval: !s.requiresApproval })} />
            <Chip label={s.condition ? `${t('onlyIfInput')} ${s.condition.value}` : t('conditional')} active={!!s.condition} onPress={() => upd(i, { condition: s.condition ? null : { variable: 'inputKg', op: 'gte', value: 100 } })} />
          </Row>
          <Gap h={S.sm} />
          <Row gap={S.sm}><Btn label="↑" kind="ghost" onPress={() => move(i, -1)} /><Btn label="↓" kind="ghost" onPress={() => move(i, 1)} />{stages.length > 1 ? <Btn label={t('delete')} kind="ghost" onPress={() => setStages((x) => x.filter((_, k) => k !== i))} /> : null}</Row>
        </Card>
      ))}
      <Btn label={t('addStage')} kind="secondary" icon="add" onPress={() => setStages((s) => [...s, { key: `s_${newId().slice(0, 6)}`, name: '', mandatory: true, requiresApproval: false, requiresQc: false }])} />

      <Rules title={t('customerCharges')} rules={charge} onChange={setCharge} />
      <Field label={t('minCharge')} value={minCharge} onChangeText={setMinCharge} keyboardType="decimal-pad" />
      <Rules title={t('internalCosts')} rules={cost} onChange={setCost} />
      {err ? <><Gap /><ErrorBox message={err} /></> : null}
    </Screen>
  );
}
