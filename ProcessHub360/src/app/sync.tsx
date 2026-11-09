import React from 'react';
import { useApp, useLoad } from '../ctx/AppContext';
import { Card, ErrorBox, Loading, Row, Screen, Txt } from '../ui/kit';
import { C } from '../lib/theme';
import { outboxSummary } from '../db/syncRunner';

export default function SyncStatus() {
  const { t } = useApp();
  const { data, error, reload } = useLoad((a) => outboxSummary(a.repo.kernel.db));
  if (error) return <Screen><ErrorBox message={error} onRetry={reload} /></Screen>;
  if (!data) return <Screen scroll={false}><Loading /></Screen>;
  return (
    <Screen>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('syncWaiting')}</Txt><Txt v="h">{data.pending}</Txt></Row>
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('retrying')}</Txt><Txt v="h" color={data.failing ? C.accent : undefined}>{data.failing}</Txt></Row>
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('confirmedServer')}</Txt><Txt v="h" color={C.ok}>{data.sent}</Txt></Row>
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('conflicts')}</Txt><Txt v="h" color={data.conflict ? C.danger : undefined}>{data.conflict}</Txt></Row>
      </Card>
      <Txt v="small">{t('syncNote')}</Txt>
    </Screen>
  );
}
