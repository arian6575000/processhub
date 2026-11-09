export const PERMISSIONS = [
  'dashboard.view', 'customers.view', 'customers.manage', 'materials.manage', 'definitions.manage',
  'jobs.view', 'jobs.create', 'jobs.operate', 'jobs.approve', 'jobs.deliver',
  'payments.collect', 'payments.refund', 'inventory.manage', 'expenses.manage', 'accounts.view', 'reports.view',
  'users.manage', 'settings.manage', 'sync.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface RoleDef { id: string; name: string; permissions: Permission[]; system: boolean }

const P = (...p: Permission[]) => p;
export const SYSTEM_ROLES: RoleDef[] = [
  { id: 'owner', name: 'Owner', system: true, permissions: [...PERMISSIONS] },
  { id: 'admin', name: 'Administrator', system: true, permissions: PERMISSIONS.filter((p) => p !== 'users.manage') },
  { id: 'cashier', name: 'Cashier', system: true, permissions: P('dashboard.view', 'customers.view', 'customers.manage', 'jobs.view', 'jobs.create', 'jobs.deliver', 'payments.collect', 'accounts.view') },
  { id: 'operator', name: 'Operator', system: true, permissions: P('dashboard.view', 'customers.view', 'jobs.view', 'jobs.create', 'jobs.operate', 'jobs.deliver') },
  { id: 'worker', name: 'Processing worker', system: true, permissions: P('jobs.view', 'jobs.operate') },
];

export const hasPermission = (role: RoleDef | undefined | null, perm: Permission) => !!role && role.permissions.includes(perm);
