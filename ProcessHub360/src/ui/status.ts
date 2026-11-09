import type { Key } from '../lib/i18n';
export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
export const jobTone = (s: string): Tone => s === 'delivered' ? 'ok' : s === 'ready' ? 'info' : s === 'in_progress' ? 'warn' : s === 'cancelled' ? 'danger' : s === 'partially_delivered' ? 'info' : 'neutral';
export const stageTone = (s: string): Tone => s === 'completed' ? 'ok' : s === 'in_progress' ? 'warn' : s === 'awaiting_approval' ? 'info' : s === 'rejected' ? 'danger' : 'neutral';
export const payTone = (s: string): Tone => s === 'paid' ? 'ok' : s === 'partial' ? 'warn' : s === 'overpaid' ? 'info' : 'danger';
export const statusKey = (s: string) => s as Key;
