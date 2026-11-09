// ProcessHub 360 UI kit: large touch targets, plain labels, RTL-aware.
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextStyle, View, ViewStyle, KeyboardTypeOptions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C, FONT, R, S, TOUCH, URDU_FONT } from '../lib/theme';
import { useLang, useRtl } from '../ctx/AppContext';
import { tr } from '../lib/i18n';

type TV = 'title' | 'h' | 'body' | 'small' | 'num';
const TV_STYLE: Record<TV, TextStyle> = {
  title: { fontSize: FONT.size.xl, fontWeight: '700', color: C.ink },
  h: { fontSize: FONT.size.lg, fontWeight: '700', color: C.ink },
  body: { fontSize: FONT.size.md, color: C.ink },
  small: { fontSize: FONT.size.sm, color: C.muted },
  num: { fontSize: FONT.size.xxl, fontWeight: '700', color: C.ink },
};
export function Txt({ v = 'body', color, style, children, numberOfLines }: { v?: TV; color?: string; style?: StyleProp<TextStyle>; children: React.ReactNode; numberOfLines?: number }) {
  const rtl = useRtl();
  const size = TV_STYLE[v].fontSize ?? FONT.size.md;
  // Nastaliq needs generous line height (tall glyphs) and has no bold weight.
  return <Text numberOfLines={numberOfLines} style={[TV_STYLE[v], color ? { color } : null, style, rtl && { fontFamily: URDU_FONT, fontWeight: 'normal', lineHeight: Math.round(size * 1.9), textAlign: 'right', writingDirection: 'rtl' }]}>{children}</Text>;
}

export function Screen({ children, scroll = true, footer }: { children: React.ReactNode; scroll?: boolean; footer?: React.ReactNode }) {
  return (
    <SafeAreaView style={st.screen} edges={['left', 'right', 'bottom']}>
      {scroll ? <ScrollView contentContainerStyle={st.pad} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[st.pad, { flex: 1 }]}>{children}</View>}
      {footer ? <View style={st.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}
export const Card = ({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) =>
  onPress ? <Pressable onPress={onPress} style={({ pressed }) => [st.card, pressed && { opacity: 0.85 }, style]}>{children}</Pressable> : <View style={[st.card, style]}>{children}</View>;

export function Row({ children, style, gap = S.md, wrap }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number; wrap?: boolean }) {
  const rtl = useRtl();
  return <View style={[{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}
export const Gap = ({ h = S.md }: { h?: number }) => <View style={{ height: h }} />;

type BK = 'primary' | 'secondary' | 'danger' | 'ghost';
export function Btn({ label, onPress, kind = 'primary', icon, disabled, loading, flex }: { label: string; onPress: () => void; kind?: BK; icon?: keyof typeof Ionicons.glyphMap; disabled?: boolean; loading?: boolean; flex?: boolean }) {
  const bg = kind === 'primary' ? C.primary : kind === 'danger' ? C.danger : kind === 'secondary' ? C.primarySoft : 'transparent';
  const fg = kind === 'primary' || kind === 'danger' ? '#fff' : C.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [st.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, kind === 'ghost' && { borderWidth: 1, borderColor: C.line }, flex && { flex: 1 }]}>
      {loading ? <ActivityIndicator color={fg} /> : (<Row gap={S.sm} style={{ justifyContent: 'center' }}>{icon ? <Ionicons name={icon} size={20} color={fg} /> : null}<Txt color={fg} style={{ fontWeight: '700' }}>{label}</Txt></Row>)}
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, keyboardType, multiline, placeholder, error, secure, maxLength, autoFocus }: { label: string; value: string; onChangeText: (s: string) => void; keyboardType?: KeyboardTypeOptions; multiline?: boolean; placeholder?: string; error?: string | null; secure?: boolean; maxLength?: number; autoFocus?: boolean }) {
  const rtl = useRtl();
  return (
    <View style={{ marginBottom: S.md }}>
      <Txt v="small" style={{ marginBottom: 4 }}>{label}</Txt>
      <TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} multiline={multiline} placeholder={placeholder} secureTextEntry={secure} maxLength={maxLength} autoFocus={autoFocus}
        accessibilityLabel={label} placeholderTextColor="#98A4A6"
        style={[st.input, multiline && { minHeight: 90, textAlignVertical: 'top' }, error ? { borderColor: C.danger } : null, rtl && { textAlign: 'right', fontFamily: URDU_FONT }]} />
      {error ? <Txt v="small" color={C.danger}>{error}</Txt> : null}
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" style={[st.chip, active && { backgroundColor: C.primary, borderColor: C.primary }]}><Txt v="small" color={active ? '#fff' : C.ink} style={{ fontWeight: '600' }}>{label}</Txt></Pressable>;
}
type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
const TONE: Record<Tone, [string, string]> = { neutral: [C.line, C.ink], ok: [C.okSoft, C.ok], warn: [C.accentSoft, '#7A5200'], danger: [C.dangerSoft, C.danger], info: [C.infoSoft, C.info] };
export const Badge = ({ label, tone = 'neutral' }: { label: string; tone?: Tone }) => <View style={{ backgroundColor: TONE[tone][0], paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill, alignSelf: 'flex-start' }}><Txt v="small" color={TONE[tone][1]} style={{ fontWeight: '700' }}>{label}</Txt></View>;

export const Stat = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <Card style={{ flex: 1, minWidth: '46%' }}><Txt v="small">{label}</Txt><Txt v="h" color={tone}>{value}</Txt></Card>
);
export function Empty({ icon, title, hint, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; hint?: string; action?: React.ReactNode }) {
  return <View style={{ alignItems: 'center', padding: S.xl, gap: S.sm }}><Ionicons name={icon} size={44} color={C.line} /><Txt v="h" style={{ textAlign: 'center' }}>{title}</Txt>{hint ? <Txt v="small" style={{ textAlign: 'center' }}>{hint}</Txt> : null}{action}</View>;
}
export const Loading = () => <View style={{ padding: S.xl }}><ActivityIndicator color={C.primary} size="large" /></View>;
export function ErrorBox({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  const lang = useLang();
  return <Card style={{ borderColor: C.danger }}><Txt color={C.danger}>{message}</Txt>{onRetry ? <><Gap h={S.sm} /><Btn label={retryLabel ?? tr(lang, 'retry')} kind="secondary" onPress={onRetry} /></> : null}</Card>;
}
export function LangSwitch({ lang, onChange }: { lang: 'en' | 'ur'; onChange: (l: 'en' | 'ur') => void }) {
  return <View style={{ flexDirection: 'row', gap: S.sm }}><Chip label="English" active={lang === 'en'} onPress={() => onChange('en')} /><Chip label="اردو" active={lang === 'ur'} onPress={() => onChange('ur')} /></View>;
}
export const SectionTitle = ({ children }: { children: React.ReactNode }) => <Txt v="h" style={{ marginTop: S.lg, marginBottom: S.sm }}>{children}</Txt>;

export function Fab({ onPress, label }: { onPress: () => void; label: string }) {
  return <Pressable onPress={onPress} accessibilityLabel={label} style={st.fab}><Ionicons name="add" size={30} color="#fff" /></Pressable>;
}

export function Select<T extends string>({ label, value, options, onChange, placeholder }: { label: string; value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.value === value);
  return (
    <View style={{ marginBottom: S.md }}>
      <Txt v="small" style={{ marginBottom: 4 }}>{label}</Txt>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label} style={[st.input, { justifyContent: 'center' }]}>
        <Row style={{ justifyContent: 'space-between' }}><Txt color={cur ? C.ink : '#98A4A6'}>{cur?.label ?? placeholder ?? '—'}</Txt><Ionicons name="chevron-down" size={18} color={C.muted} /></Row>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={st.backdrop} onPress={() => setOpen(false)}>
          <View style={st.sheet}>
            <Txt v="h" style={{ marginBottom: S.sm }}>{label}</Txt>
            <ScrollView style={{ maxHeight: 360 }}>
              {options.length === 0 ? <Txt v="small">—</Txt> : options.map((o) => (
                <Pressable key={o.value} onPress={() => { onChange(o.value); setOpen(false); }} style={[st.opt, o.value === value && { backgroundColor: C.primarySoft }]}><Txt>{o.label}</Txt></Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Weight entry in KG / Mann / Gram, returned as integer grams. */
const UNIT_G: Record<'kg' | 'mann' | 'g', number> = { kg: 1000, mann: 40000, g: 1 };
export function WeightField({ label, text, unit, onText, onUnit, labels }: { label: string; text: string; unit: 'kg' | 'mann' | 'g'; onText: (s: string) => void; onUnit: (u: 'kg' | 'mann' | 'g') => void; labels: { kg: string; mann: string; g: string } }) {
  return (
    <View style={{ marginBottom: S.md }}>
      <Field label={label} value={text} onChangeText={onText} keyboardType="decimal-pad" />
      <Row gap={S.sm} style={{ marginTop: -S.sm }}>{(['kg', 'mann', 'g'] as const).map((u) => <Chip key={u} label={labels[u]} active={unit === u} onPress={() => onUnit(u)} />)}</Row>
    </View>
  );
}
export const weightToGrams = (text: string, unit: 'kg' | 'mann' | 'g'): number => {
  const n = parseFloat(text.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * UNIT_G[unit]) : 0;
};

export function ToastHost({ toast }: { toast: { msg: string; kind: 'ok' | 'error' } | null }) {
  if (!toast) return null;
  return <View pointerEvents="none" style={[st.toast, { backgroundColor: toast.kind === 'ok' ? C.primaryDark : C.danger }]}><Txt color="#fff" style={{ fontWeight: '600' }}>{toast.msg}</Txt></View>;
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg }, pad: { padding: S.lg, paddingBottom: 100 },
  footer: { padding: S.md, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line },
  card: { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: S.lg, marginBottom: S.md },
  btn: { minHeight: TOUCH, borderRadius: R.md, paddingHorizontal: S.lg, justifyContent: 'center' },
  input: { minHeight: TOUCH, borderWidth: 1, borderColor: C.line, borderRadius: R.md, backgroundColor: C.surface, paddingHorizontal: S.md, fontSize: FONT.size.md, color: C.ink },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, justifyContent: 'center' },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 60, height: 60, borderRadius: 30, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.surface, padding: S.lg, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg },
  opt: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: S.md, borderRadius: R.sm },
  toast: { position: 'absolute', left: 16, right: 16, bottom: 28, padding: 14, borderRadius: R.md, alignItems: 'center' },
});
