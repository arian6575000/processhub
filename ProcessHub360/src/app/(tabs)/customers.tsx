import React, { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp, useLoad } from '../../ctx/AppContext';
import { Card, Empty, ErrorBox, Fab, Field, Loading, Txt } from '../../ui/kit';
import { C, S } from '../../lib/theme';

export default function Customers() {
  const { t, can } = useApp(); const router = useRouter();
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useLoad((a) => a.repo.md.listCustomers(q), [q]);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ padding: S.lg, paddingBottom: 0 }}><Field label={t('search')} value={q} onChangeText={setQ} /></View>
      {error ? <View style={{ padding: S.lg }}><ErrorBox message={error} onRetry={reload} /></View> : null}
      {!data && loading ? <Loading /> : (
        <FlatList data={data ?? []} keyExtractor={(c) => c.id} contentContainerStyle={{ padding: S.lg, paddingTop: 0, paddingBottom: 100 }}
          ListEmptyComponent={<Empty icon="people-outline" title={t('noCustomers')} />}
          renderItem={({ item: c }) => (<Card onPress={() => router.push({ pathname: '/customer/[id]', params: { id: c.id } })}><Txt v="h">{c.name}</Txt>{c.phone ? <Txt v="small">{c.phone}</Txt> : null}</Card>)} />
      )}
      {can('customers.manage') ? <Fab label={t('add')} onPress={() => router.push('/customer/new')} /> : null}
    </View>
  );
}
