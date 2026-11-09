import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useApp } from '../../ctx/AppContext';
import { Btn, Field, Screen } from '../../ui/kit';

export default function NewCustomer() {
  const { t, repo, toast, bump, msg } = useApp(); const router = useRouter();
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [address, setAddress] = useState(''), [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await repo.md.saveCustomer({ name, phone, address, notes }); bump(); toast(t('saved')); router.back(); }
    catch (e: any) { setErr(msg(e.message)); } finally { setBusy(false); }
  };
  return (
    <Screen footer={<Btn label={t('save')} onPress={save} loading={busy} />}>
      <Field label={t('name')} value={name} onChangeText={setName} error={err} autoFocus />
      <Field label={t('phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label={t('address')} value={address} onChangeText={setAddress} />
      <Field label={t('notes')} value={notes} onChangeText={setNotes} multiline />
    </Screen>
  );
}
