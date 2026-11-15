/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHealthReport } from './dataHealth';

test('data check finds broken links, duplicates and hidden holdings', () => {
  const db = {
    users: [
      { id: 'u1', username: 'ada@x.com', email: 'ada@x.com', name: 'Ada', role: 'investor' },
      { id: 'u2', username: 'ada@x.com', email: 'ada@x.com', name: 'Ada', role: 'investor' },
      { id: 'u3', username: 'glory e edo', email: 'Glory E Edo', name: 'gnliberty@yahoo.com', role: 'investor' },
      { id: 'u4', username: 'nobody', email: 'n@x.com', name: 'No Plots', role: 'investor' }
    ],
    farms: [
      { id: 'f1', name: 'Phase 1 Oil Palm Farm' },
      { id: 'f2', name: 'phase 1 oil palm' },
      { id: 'f3', name: 'Empty Farm' }
    ],
    plots: [
      { id: 'p1', farmId: 'f1', plotNumber: 'A' },
      { id: 'p2', farmId: 'f2', plotNumber: 'B' },
      { id: 'p3', farmId: 'gone', plotNumber: 'C' }
    ],
    investorPlots: [
      { id: 'h1', investorId: 'u1', plotId: 'p1' },
      { id: 'h2', investorId: 'u2', plotId: 'p2', isActive: true },
      { id: 'h3', investorId: 'ghost', plotId: 'p3', isActive: true },
      { id: 'h4', investorId: 'u3', plotId: 'missing', isActive: false }
    ],
    financials: [{ id: 'fin1', plotId: 'missing', period: 'Q1', year: 2025 }]
  };
  const r = buildHealthReport(db);
  const ids = new Map(r.issues.map(i => [i.id, i.count]));
  assert.equal(ids.get('holding-no-active-flag'), 1);
  assert.equal(ids.get('holding-missing-investor'), 1);
  assert.equal(ids.get('holding-missing-plot'), 1);
  assert.equal(ids.get('holding-inactive'), 1);
  assert.equal(ids.get('plot-missing-farm'), 1);
  assert.equal(ids.get('farm-duplicate'), 1);
  assert.equal(ids.get('farm-empty'), 1);
  assert.equal(ids.get('user-duplicate-username'), 1);
  assert.equal(ids.get('user-duplicate-email'), 1);
  assert.equal(ids.get('user-invalid-email'), 1);
  assert.equal(ids.get('investor-no-holdings'), 1);
  assert.equal(ids.get('payout-missing-plot'), 1);
  assert.equal(r.issues[0].severity, 'error');
  assert.equal(r.counts.holdings, 4);
});
