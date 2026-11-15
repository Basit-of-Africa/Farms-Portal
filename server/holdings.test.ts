/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeEstates } from './holdings';

const fixture = () => ({
  farms: [{ id: 'good', name: 'Phase 3 Oil Palm Farm' }, { id: 'typo', name: 'Phase 3 Oil Plam Farm' }],
  plots: [
    { id: 'p1', farmId: 'good', plotNumber: 'A1', sizeHectares: 1, sizeUnit: 'acre' },
    { id: 'p2', farmId: 'typo', plotNumber: 'A1', sizeHectares: 2, sizeUnit: 'acre' },
    { id: 'p3', farmId: 'typo', plotNumber: 'B7', sizeHectares: 1, sizeUnit: 'plot' }
  ],
  investorPlots: [
    { id: 'h1', investorId: 'u1', plotId: 'p1', investmentAmount: 100 },
    { id: 'h2', investorId: 'u2', plotId: 'p2', investmentAmount: 250 },
    { id: 'h3', investorId: 'u2', plotId: 'p3', investmentAmount: 50 }
  ],
  updates: [{ id: 'up', farmId: 'typo' }],
  documents: [{ id: 'd', farmId: 'typo' }],
  mapNotes: [],
  assignments: [{ id: 'a1', farmId: 'good', managerId: 'm' }, { id: 'a2', farmId: 'typo', managerId: 'm' }],
  simulatedEmails: []
});

test('merge preview changes nothing', () => {
  const db = fixture();
  const s = mergeEstates(db, 'typo', 'good', false);
  assert.equal(s.farms, 2);
  assert.equal(s.farmOwners, 1);
  assert.equal(s.invested, 300);
  assert.equal(db.farms.length, 2);
  assert.equal(db.plots[1].farmId, 'typo');
});

test('merge moves farms, owners, updates and documents, and removes the misspelt estate', () => {
  const db = fixture();
  mergeEstates(db, 'typo', 'good', true);
  assert.deepEqual(db.farms.map(f => f.id), ['good']);
  assert.ok(db.plots.every(p => p.farmId === 'good'));
  assert.equal(db.plots.find(p => p.id === 'p2')!.plotNumber, 'A1-2', 'clashing plot number renumbered');
  assert.equal(db.updates[0].farmId, 'good');
  assert.equal(db.documents[0].farmId, 'good');
  assert.equal(db.assignments.length, 1, 'duplicate manager assignment dropped');
  assert.equal((db.farms[0] as any).totalPlots, 3);
});

test('merge refuses the same estate', () => {
  assert.throws(() => mergeEstates(fixture(), 'good', 'good', true));
});
