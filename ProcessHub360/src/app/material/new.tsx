import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useApp } from '../../ctx/AppContext';
import { Btn, Field, Screen, Select, WeightField, weightToGrams } from '../../ui/kit';
import { MATERIAL_KINDS, MaterialKind } from '../../db/types';
import type { Key } from '../../lib/i18n';

export default function NewMaterial() {
  const { t, repo, toast, bump, msg } = useApp(); const router = useRouter();
  const [name, setName] = useState(''), [kind, setKind] = useState<MaterialKind>('raw'), [spec, setSpec] = useState('');
  const [min, setMin] = useState(''), [unit, setUnit] = useState<'kg' | 'mann' | 'g'>('kg');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await repo.md.saveMaterial({ name, kind, spec, minStockBase: weightToGrams(min, unit) }); bump(); toast(t('saved')); router.back(); }
    catch (e: any) { setErr(msg(e.message)); } finally { setBusy(false); }
  };
  return (
    <Screen footer={<Btn label={t('save')} onPress={save} loading={busy} />}>
      <Field label={t('name')} value={name} onChangeText={setName} error={err} autoFocus />
      <Select label={t('type')} value={kind} options={MATERIAL_KINDS.map((k) => ({ value: k, label: t(`kind_${k}` as Key) }))} onChange={setKind} />
      <Field label={t('spec')} value={spec} onChangeText={setSpec} />
      <WeightField label={t('reorderLevel')} text={min} unit={unit} onText={setMin} onUnit={setUnit} labels={{ kg: t('kg'), mann: t('mann'), g: t('gram') }} />
    </Screen>
  );
}
