import React, { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useApp, useLoad } from '../../ctx/AppContext';
import { Btn, Card, ErrorBox, Field, Loading, Row, Screen, SectionTitle, Txt, WeightField, weightToGrams } from '../../ui/kit';
import { formatWeight } from '../../core/units';
import { parseMoney } from '../../core/money';
import type { Key } from '../../lib/i18n';

export default function MaterialDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, money, can, repo, toast, bump } = useApp();
  const { data, error, reload } = useLoad(async (a) => ({ m: (await a.repo.md.listMaterials()).find((x) => x.id === id), pos: await a.repo.stock.position(id), ledger: await a.repo.stock.ledger(id, 15) }), [id]);
  const [w, setW] = useState(''), [unit, setUnit] = useState<'kg' | 'mann' | 'g'>('kg'), [value, setValue] = useState(''), [batch, setBatch] = useState('');
  const [busy, setBusy] = useState(false);
  if (error) return <Screen><ErrorBox message={error} onRetry={reload} /></Screen>;
  if (!data) return <Screen scroll={false}><Loading /></Screen>;
  const receive = async () => {
    setBusy(true);
    try { await repo.stock.receiveStock({ materialId: id, qtyBase: weightToGrams(w, unit), valueMinor: value ? parseMoney(value) : 0, batchNo: batch }); setW(''); setValue(''); setBatch(''); bump(); toast(t('saved')); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <Txt v="title">{data.m?.name}</Txt><Txt v="small">{data.m ? t(`kind_${data.m.kind}` as Key) : ''}{data.m?.spec ? ` · ${data.m.spec}` : ''}</Txt>
      <Card style={{ marginTop: 16 }}><Txt v="small">{t('onHand')}</Txt><Txt v="num">{formatWeight(data.pos.qtyBase)}</Txt>{can('accounts.view') ? <Txt v="small">{money(data.pos.valueMinor)}</Txt> : null}</Card>
      {can('inventory.manage') ? (<>
        <SectionTitle>{t('receiveStock')}</SectionTitle>
        <WeightField label={t('weight')} text={w} unit={unit} onText={setW} onUnit={setUnit} labels={{ kg: t('kg'), mann: t('mann'), g: t('gram') }} />
        <Field label={`${t('total')} (${t('amount')})`} value={value} onChangeText={setValue} keyboardType="decimal-pad" />
        <Field label={t('batchLot')} value={batch} onChangeText={setBatch} />
        <Btn label={t('receiveStock')} onPress={receive} loading={busy} disabled={weightToGrams(w, unit) <= 0} />
      </>) : null}
      <SectionTitle>{t('history')}</SectionTitle>
      {data.ledger.map((l: any) => (<Row key={l.id} style={{ justifyContent: 'space-between', paddingVertical: 6 }}><Txt v="small">{new Date(l.at).toLocaleDateString()} · {t(`reason_${l.reason}` as Key)}{l.batch_no ? ` · ${l.batch_no}` : ''}</Txt><Txt v="small">{l.delta_base > 0 ? '+' : ''}{formatWeight(l.delta_base)}</Txt></Row>))}
    </Screen>
  );
}
