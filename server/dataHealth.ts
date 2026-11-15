/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Read-only integrity report for the portal's data: broken links between
 * investors, holdings, plots and farms, duplicates, and records that the
 * screens would hide. Used by the admin "Data check".
 */

import { farmKeyOf } from './importNormalize';

export interface HealthIssue {
  id: string;
  title: string;
  /** What the problem causes on screen */
  effect: string;
  severity: 'error' | 'warning' | 'info';
  count: number;
  examples: string[];
}

export interface HealthReport {
  generatedAt: string;
  counts: Record<string, number>;
  issues: HealthIssue[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EXAMPLES = 25;

export function buildHealthReport(db: any): HealthReport {
  const users: any[] = db.users || [];
  const farms: any[] = db.farms || [];
  const plots: any[] = db.plots || [];
  const holdings: any[] = db.investorPlots || [];
  const financials: any[] = db.financials || [];

  const userById = new Map(users.map(u => [u.id, u]));
  const farmById = new Map(farms.map(f => [f.id, f]));
  const plotById = new Map(plots.map(p => [p.id, p]));
  const label = (u: any) => (u ? `${u.name || '(no name)'} <${u.email || 'no email'}>` : '(missing account)');

  const issues: HealthIssue[] = [];
  const add = (issue: Omit<HealthIssue, 'count' | 'examples'>, items: string[]) => {
    if (items.length) issues.push({ ...issue, count: items.length, examples: items.slice(0, MAX_EXAMPLES) });
  };

  // Holdings ---------------------------------------------------------------
  add(
    { id: 'holding-missing-investor', title: 'Holdings linked to an account that does not exist', effect: 'These plots show no owner, and no investor sees them.', severity: 'error' },
    holdings.filter(h => !userById.has(h.investorId)).map(h => `holding ${h.id} → account ${h.investorId}`)
  );
  add(
    { id: 'holding-missing-plot', title: 'Holdings linked to a plot that does not exist', effect: 'The investor owns "nothing" on any farm, and the farm does not list them.', severity: 'error' },
    holdings.filter(h => !plotById.has(h.plotId)).map(h => `${label(userById.get(h.investorId))}: holding ${h.id} → plot ${h.plotId}`)
  );
  add(
    { id: 'holding-inactive', title: 'Holdings marked inactive', effect: 'Hidden from the investor and from the farm on purpose. Check they really ended.', severity: 'info' },
    holdings.filter(h => h.isActive === false).map(h => `${label(userById.get(h.investorId))}: holding ${h.id}`)
  );
  add(
    { id: 'holding-no-active-flag', title: 'Holdings without an active/inactive flag', effect: 'Older versions hid these. They are now treated as active.', severity: 'info' },
    holdings.filter(h => typeof h.isActive !== 'boolean').map(h => `${label(userById.get(h.investorId))}: holding ${h.id}`)
  );

  // Plots --------------------------------------------------------------------
  add(
    { id: 'plot-missing-farm', title: 'Plots linked to a farm that does not exist', effect: 'These plots (and their investors) appear under no farm.', severity: 'error' },
    plots.filter(p => !farmById.has(p.farmId)).map(p => `plot ${p.plotNumber || p.id} → farm ${p.farmId}`)
  );
  const heldPlotIds = new Set(holdings.map(h => h.plotId));
  add(
    { id: 'plot-unowned', title: 'Plots with no owner', effect: 'Shown on the farm as unallocated.', severity: 'info' },
    plots.filter(p => !heldPlotIds.has(p.id)).map(p => `${farmById.get(p.farmId)?.name || 'unknown farm'}: plot ${p.plotNumber || p.id}`)
  );

  // Farms --------------------------------------------------------------------
  const farmsByKey = new Map<string, any[]>();
  farms.forEach(f => farmsByKey.set(farmKeyOf(f.name || ''), [...(farmsByKey.get(farmKeyOf(f.name || '')) || []), f]));
  const plotCount = (farmId: string) => plots.filter(p => p.farmId === farmId).length;
  add(
    { id: 'farm-duplicate', title: 'Farms that appear more than once', effect: 'Investors and plots are split between the copies, so each copy looks incomplete.', severity: 'error' },
    [...farmsByKey.values()]
      .filter(g => g.length > 1)
      .map(g => `"${g[0].name}" × ${g.length}: ${g.map(f => `${f.id} (${plotCount(f.id)} plots)`).join(', ')}`)
  );
  add(
    { id: 'farm-empty', title: 'Farms with no plots', effect: 'The farm page shows no plots and no investors.', severity: 'warning' },
    farms.filter(f => plotCount(f.id) === 0).map(f => `${f.name} (${f.id})`)
  );

  // Accounts -----------------------------------------------------------------
  const investors = users.filter(u => u.role === 'investor');
  const holdingsByUser = new Map<string, number>();
  holdings.forEach(h => holdingsByUser.set(h.investorId, (holdingsByUser.get(h.investorId) || 0) + 1));
  add(
    { id: 'investor-no-holdings', title: 'Investors with no holdings', effect: 'Their dashboard is empty.', severity: 'warning' },
    investors.filter(u => !holdingsByUser.get(u.id)).map(u => label(u))
  );

  const groupBy = (key: (u: any) => string) => {
    const m = new Map<string, any[]>();
    users.forEach(u => {
      const k = key(u);
      if (k) m.set(k, [...(m.get(k) || []), u]);
    });
    return [...m.values()].filter(g => g.length > 1);
  };
  add(
    { id: 'user-duplicate-username', title: 'Accounts sharing the same username', effect: 'Signing in always opens the first of these accounts, so holdings on the others are never seen.', severity: 'error' },
    groupBy(u => (u.username || '').trim().toLowerCase()).map(g => `"${g[0].username}" × ${g.length}: ${g.map(u => `${u.id} (${holdingsByUser.get(u.id) || 0} holdings)`).join(', ')}`)
  );
  add(
    { id: 'user-duplicate-email', title: 'Accounts sharing the same email', effect: 'The same person has several accounts, each with only part of their holdings.', severity: 'error' },
    groupBy(u => (u.email || '').trim().toLowerCase()).map(g => `${g[0].email} × ${g.length}: ${g.map(u => `${u.name} (${holdingsByUser.get(u.id) || 0} holdings)`).join(', ')}`)
  );
  add(
    { id: 'user-invalid-email', title: 'Accounts without a valid email', effect: 'Login details and notifications cannot be delivered.', severity: 'error' },
    users.filter(u => !EMAIL_RE.test((u.email || '').trim())).map(u => `${u.name || '(no name)'}: email "${u.email || ''}", username "${u.username || ''}"`)
  );

  // Payouts --------------------------------------------------------------------
  add(
    { id: 'payout-missing-plot', title: 'Payouts linked to a plot that does not exist', effect: 'No investor sees these payouts.', severity: 'error' },
    financials.filter(f => !plotById.has(f.plotId)).map(f => `${f.period} ${f.year}: payout ${f.id} → plot ${f.plotId}`)
  );

  const order = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      accounts: users.length,
      investors: investors.length,
      farms: farms.length,
      plots: plots.length,
      holdings: holdings.length,
      payouts: financials.length
    },
    issues
  };
}
