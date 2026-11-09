import React, { useEffect, useState } from 'react';
import { useApp } from '../ctx/AppContext';
import { useLicense } from '../ui/LicenseGate';
import { Btn, Card, Chip, Field, Row, Screen, SectionTitle, Txt } from '../ui/kit';
import { S } from '../lib/theme';

export default function Settings() {
  const { t, settings, saveSettings, toast } = useApp(); const lic = useLicense();
  const [name, setName] = useState(settings.businessName), [phone, setPhone] = useState(settings.phone), [addr, setAddr] = useState(settings.address), [tol, setTol] = useState(String(settings.toleranceBp / 100));
  useEffect(() => { setName(settings.businessName); }, [settings.businessName]);
  const save = async () => { const bp = Math.round(parseFloat(tol) * 100); await saveSettings({ businessName: name.trim(), phone, address: addr, toleranceBp: Number.isFinite(bp) && bp >= 0 ? bp : 50 }); toast(t('saved')); };
  return (
    <Screen footer={<Btn label={t('save')} onPress={save} />}>
      <Txt v="h" style={{ marginBottom: S.sm }}>{t('language')}</Txt>
      <Row gap={S.sm} style={{ marginBottom: S.lg }}><Chip label="English" active={settings.language === 'en'} onPress={() => saveSettings({ language: 'en' })} /><Chip label="اردو" active={settings.language === 'ur'} onPress={() => saveSettings({ language: 'ur' })} /></Row>
      <Field label={t('business')} value={name} onChangeText={setName} />
      <Field label={t('phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label={t('address')} value={addr} onChangeText={setAddr} />
      <Field label={t('tolerance')} value={tol} onChangeText={setTol} keyboardType="decimal-pad" />
      <SectionTitle>{t('license')}</SectionTitle>
      <Card>
        {lic.devBypass ? <Txt color="#7A5200">{t('devBypass')}</Txt> : (<>
          <Txt>{lic.payload?.client_name} · {lic.payload?.plan_name}</Txt>
          <Txt v="small">{lic.payload?.is_lifetime ? t('lifetime') : `${t('expires')} ${lic.payload?.expiry_date}${lic.daysLeft !== null ? ` (${lic.daysLeft} ${t('daysWord')})` : ''}`} · {lic.payload?.max_users} {t('usersWord')}</Txt>
        </>)}
      </Card>
    </Screen>
  );
}
