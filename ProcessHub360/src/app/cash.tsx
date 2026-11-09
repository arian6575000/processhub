import React, { useState } from 'react';
import { useApp, useLoad } from '../ctx/AppContext';
import { Btn, Card, ErrorBox, Field, Loading, Row, Screen, SectionTitle, Txt } from '../ui/kit';
import { C, S } from '../lib/theme';
import { parseMoney } from '../core/money';
import { todayIso } from '../db/accounts';

export default function Cash() {
  const { t, money, repo, toast, bump, session, can } = useApp();
  const date = todayIso(Date.now());
  const { data, error, reload } = useLoad(async (a) => ({ cash: await a.repo.accounts.cashSummary(date), exp: await a.repo.accounts.listExpenses(date, date), close: await a.repo.accounts.getClose(date), pl: await a.repo.accounts.profitAndLoss(date.slice(0, 8) + '01', date) }), [date]);
  const [cat, setCat] = useState(''), [amt, setAmt] = useState(''), [counted, setCounted] = useState('');
  if (error) return <Screen><ErrorBox message={error} onRetry={reload} /></Screen>;
  if (!data) return <Screen scroll={false}><Loading /></Screen>;
  const addExp = async () => { try { await repo.accounts.addExpense({ category: cat, amountMinor: parseMoney(amt) }, session.id); setCat(''); setAmt(''); bump(); toast(t('saved')); } catch (e: any) { toast(e.message, 'error'); } };
  const close = async () => { try { await repo.accounts.closeCash(date, parseMoney(counted), session.id); setCounted(''); bump(); toast(t('saved')); } catch (e: any) { toast(e.message, 'error'); } };
  return (
    <Screen>
      <Card>
        <Txt v="h">{date}</Txt>
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('cashIn')}</Txt><Txt color={C.ok}>{money(data.cash.cashInMinor)}</Txt></Row>
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('bankIn')}</Txt><Txt color={C.ok}>{money(data.cash.otherInMinor)}</Txt></Row>
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('expenses')}</Txt><Txt color={C.danger}>{money(data.cash.expensesMinor)}</Txt></Row>
        <Row style={{ justifyContent: 'space-between' }}><Txt v="h">{t('net')}</Txt><Txt v="h">{money(data.cash.netMinor)}</Txt></Row>
      </Card>
      <Card>
        <Txt v="h">{t('thisMonth')}</Txt>
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('processingBilled')}</Txt><Txt>{money(data.pl.processingIncomeMinor)}</Txt></Row>
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('expenses')}</Txt><Txt>{money(data.pl.expensesMinor)}</Txt></Row>
        <Row style={{ justifyContent: 'space-between' }}><Txt v="h">{t('profit')}</Txt><Txt v="h" color={data.pl.profitMinor >= 0 ? C.ok : C.danger}>{money(data.pl.profitMinor)}</Txt></Row>
      </Card>
      {can('expenses.manage') ? (<><SectionTitle>{t('add')} {t('expenses')}</SectionTitle><Field label={t('category')} value={cat} onChangeText={setCat} /><Field label={t('amount')} value={amt} onChangeText={setAmt} keyboardType="decimal-pad" /><Btn label={t('add')} onPress={addExp} disabled={!cat || !amt} /></>) : null}
      {data.exp.map((e) => <Row key={e.id} style={{ justifyContent: 'space-between', paddingVertical: 6 }}><Txt v="small">{e.category}</Txt><Txt v="small">{money(e.amount_minor)}</Txt></Row>)}
      {can('accounts.view') ? (<>
        <SectionTitle>{t('closeCash')}</SectionTitle>
        {data.close ? <Card><Txt>{t('expected')} {money(data.close.expectedMinor)} · {t('counted')} {money(data.close.countedMinor)}</Txt><Txt color={data.close.differenceMinor === 0 ? C.ok : C.danger}>{t('difference')} {money(data.close.differenceMinor)}</Txt></Card> : null}
        <Field label={t('countedCash')} value={counted} onChangeText={setCounted} keyboardType="decimal-pad" />
        <Btn label={t('closeCash')} onPress={close} disabled={!counted} />
      </>) : null}
    </Screen>
  );
}
