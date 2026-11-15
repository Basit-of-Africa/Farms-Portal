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

// ---------------------------------------------------------------------------
// Farm ownership overview: every farm with its investors, land and amounts,
// plus holdings that are not linked to any farm.
// ---------------------------------------------------------------------------

type Land = Record<string, number>;
const addLand = (land: Land, unit: string, size: number) => {
  const u = (unit || 'acre').toLowerCase();
  land[u] = Math.round(((land[u] || 0) + (Number(size) || 0)) * 10000) / 10000;
};
export const landText = (land: Land) =>
  Object.entries(land)
    .filter(([, n]) => n > 0)
    .map(([u, n]) => `${n} ${u}${n === 1 ? '' : 's'}`)
    .join(' · ') || '—';

export function buildOwnershipOverview(db: any) {
  const users: any[] = db.users || [];
  const farms: any[] = db.farms || [];
  const plots: any[] = db.plots || [];
  const holdings: any[] = (db.investorPlots || []).filter((h: any) => h.isActive !== false);
  const userById = new Map(users.map(u => [u.id, u]));
  const farmById = new Map(farms.map(f => [f.id, f]));
  const plotById = new Map(plots.map(p => [p.id, p]));

  const keyCounts = new Map<string, number>();
  farms.forEach(f => keyCounts.set(farmKeyOf(f.name || ''), (keyCounts.get(farmKeyOf(f.name || '')) || 0) + 1));

  const farmRows = farms
    .map(f => {
      const farmPlots = plots.filter(p => p.farmId === f.id);
      const plotIds = new Set(farmPlots.map(p => p.id));
      const land: Land = {};
      farmPlots.forEach(p => addLand(land, p.sizeUnit, p.sizeHectares));
      const byInvestor = new Map<string, any>();
      let invested = 0;
      let farmHoldings = 0;
      holdings
        .filter(h => plotIds.has(h.plotId))
        .forEach(h => {
          const p = plotById.get(h.plotId);
          const u = userById.get(h.investorId);
          const key = u ? u.id : `missing:${h.investorId}`;
          const row = byInvestor.get(key) || { id: u?.id || null, name: u ? u.name : '(account missing)', email: u?.email || '', land: {} as Land, invested: 0, holdings: 0 };
          addLand(row.land, p?.sizeUnit, p?.sizeHectares);
          row.invested += Number(h.investmentAmount) || 0;
          row.holdings += 1;
          byInvestor.set(key, row);
          invested += Number(h.investmentAmount) || 0;
          farmHoldings += 1;
        });
      const investors = [...byInvestor.values()]
        .map(r => ({ ...r, landText: landText(r.land) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        id: f.id,
        name: f.name,
        location: [f.location, f.state].filter(Boolean).join(', '),
        duplicateName: (keyCounts.get(farmKeyOf(f.name || '')) || 0) > 1,
        plots: farmPlots.length,
        land,
        landText: landText(land),
        holdings: farmHoldings,
        investors,
        invested
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Holdings that cannot be placed under any farm
  const unlinked = holdings
    .filter(h => {
      const p = plotById.get(h.plotId);
      return !p || !farmById.has(p.farmId);
    })
    .map(h => {
      const p = plotById.get(h.plotId);
      const u = userById.get(h.investorId);
      return {
        holdingId: h.id,
        investorId: u?.id || null,
        investorName: u ? u.name : '(account missing)',
        email: u?.email || '',
        reason: !p ? 'Plot no longer exists' : `Farm no longer exists (${p.farmId})`,
        land: p ? landText({ [(p.sizeUnit || 'acre').toLowerCase()]: Number(p.sizeHectares) || 0 }) : '—',
        invested: Number(h.investmentAmount) || 0
      };
    });

  const totalLand: Land = {};
  plots.forEach(p => addLand(totalLand, p.sizeUnit, p.sizeHectares));
  return {
    generatedAt: new Date().toISOString(),
    farms: farmRows,
    unlinked,
    totals: {
      farms: farms.length,
      plots: plots.length,
      activeHoldings: holdings.length,
      investorsWithHoldings: new Set(holdings.map(h => h.investorId)).size,
      invested: holdings.reduce((s, h) => s + (Number(h.investmentAmount) || 0), 0),
      holdingsWithAmount: holdings.filter(h => Number(h.investmentAmount) > 0).length,
      landText: landText(totalLand)
    }
  };
}
