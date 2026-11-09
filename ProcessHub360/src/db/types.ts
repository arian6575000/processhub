import type { Ownership } from '../core/ownership';
import type { StageDef, WorkflowSnapshot, WorkflowState } from '../core/workflow';
import type { PricingPolicy, ChargeResult } from '../core/pricing';
import type { ExpectedOutput, JobLine, Reconciliation } from '../core/processing';
import type { JobStatus } from '../core/tokens';

export type MaterialKind = 'raw' | 'finished' | 'intermediate' | 'byproduct' | 'waste' | 'packaging';
export const MATERIAL_KINDS: MaterialKind[] = ['raw', 'finished', 'intermediate', 'byproduct', 'waste', 'packaging'];

export interface Settings { businessName: string; currency: string; language: 'en' | 'ur'; toleranceBp: number; phone: string; address: string }
export const DEFAULT_SETTINGS: Settings = { businessName: '', currency: 'Rs', language: 'en', toleranceBp: 50, phone: '', address: '' };

export interface Material { id: string; name: string; kind: MaterialKind; dimension: 'weight' | 'count' | 'volume'; defaultUnit: string; spec: string; minStockBase: number; active: boolean }
export interface Party { id: string; name: string; phone: string; address: string; notes: string }
export interface Definition {
  id: string; name: string; templateId: string; byproductPolicy: 'return_to_customer' | 'keep_by_business';
  expectedOutputs: ExpectedOutput[]; pricing: PricingPolicy; active: boolean; stages: StageDef[]; version: number;
}
export interface JobRow extends JobLine { id: string }
export interface Job {
  id: string; orderId: string; token: string; seqInOrder: number; definitionId: string | null; definitionName: string;
  ownership: Ownership; workflow: WorkflowSnapshot; runtime: WorkflowState; status: JobStatus;
  inputBase: number; bags: number; deliveredBase: number; chargeMinor: number; costMinor: number; stockPosted: boolean; notes: string;
  charge: ChargeResult | null; byproductPolicy: 'return_to_customer' | 'keep_by_business'; createdAt: number; updatedAt: number;
  customerId: string | null; customerName: string; orderToken: string;
}
export interface JobDetail extends Job { lines: JobRow[]; recon: Reconciliation; deliverableBase: number }
