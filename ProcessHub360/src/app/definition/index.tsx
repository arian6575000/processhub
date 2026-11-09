import React from 'react';
import { useRouter } from 'expo-router';
import { useApp, useLoad } from '../../ctx/AppContext';
import { Badge, Btn, Card, Empty, ErrorBox, Loading, Row, Screen, Txt } from '../../ui/kit';

export default function Definitions() {
  const { t } = useApp(); const router = useRouter();
  const { data, error, reload } = useLoad((a) => a.repo.md.listDefinitions());
  if (error) return <Screen><ErrorBox message={error} onRetry={reload} /></Screen>;
  if (!data) return <Screen scroll={false}><Loading /></Screen>;
  return (
    <Screen footer={<Btn label={t('add')} icon="add" onPress={() => router.push('/definition/edit')} />}>
      {data.length === 0 ? <Empty icon="settings-outline" title={t('processingSetup')} hint="Add a process such as wheat milling, chili grinding or pulse cleaning. Stages and prices are yours to define." /> : data.map((d) => (
        <Card key={d.id} onPress={() => router.push({ pathname: '/definition/edit', params: { id: d.id } })}>
          <Row style={{ justifyContent: 'space-between' }}><Txt v="h">{d.name}</Txt><Badge label={`v${d.version}`} tone="info" /></Row>
          <Txt v="small">{d.stages.map((s) => s.name).join(' → ')}</Txt>
        </Card>
      ))}
    </Screen>
  );
}
