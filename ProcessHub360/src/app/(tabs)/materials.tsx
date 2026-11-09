import React from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp, useLoad } from '../../ctx/AppContext';
import { Badge, Card, Empty, ErrorBox, Fab, Loading, Row, Txt } from '../../ui/kit';
import { C, S } from '../../lib/theme';
import { formatWeight } from '../../core/units';
import type { Key } from '../../lib/i18n';

export default function Materials() {
  const { t, money, can } = useApp(); const router = useRouter();
  const { data, loading, error, reload } = useLoad((a) => a.repo.stock.stockList());
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {error ? <View style={{ padding: S.lg }}><ErrorBox message={error} onRetry={reload} /></View> : null}
      {!data && loading ? <Loading /> : (
        <FlatList data={data ?? []} keyExtractor={(m) => m.materialId} contentContainerStyle={{ padding: S.lg, paddingBottom: 100 }}
          ListHeaderComponent={<Txt v="small" style={{ marginBottom: S.sm }}>{t('stockNote')}</Txt>}
          ListEmptyComponent={<Empty icon="cube-outline" title={t('noMaterials')} />}
          renderItem={({ item: m }) => (
            <Card onPress={() => router.push({ pathname: '/material/[id]', params: { id: m.materialId } })}>
              <Row style={{ justifyContent: 'space-between' }}><Txt v="h">{m.name}</Txt>{m.low ? <Badge label={t('lowStock')} tone="danger" /> : <Badge label={t(`kind_${m.kind}` as Key)} />}</Row>
              <Txt>{formatWeight(m.qtyBase)}{can('accounts.view') ? ` · ${money(m.valueMinor)}` : ''}</Txt>
            </Card>
          )} />
      )}
      {can('materials.manage') ? <Fab label={t('add')} onPress={() => router.push('/material/new')} /> : null}
    </View>
  );
}
