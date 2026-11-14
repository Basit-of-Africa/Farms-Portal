/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Run with: npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSize, parseAmount, normalizePhone, parseDate, cropFromText, farmKeyOf, normalizeImportRows } from './importNormalize';

test('parseSize understands common spreadsheet wording', () => {
  assert.deepEqual(parseSize('1 plot'), { value: 1, unit: 'plot' });
  assert.deepEqual(parseSize('2 plots'), { value: 2, unit: 'plot' });
  assert.deepEqual(parseSize('1.5 plot'), { value: 1.5, unit: 'plot' });
  assert.deepEqual(parseSize('half acre'), { value: 0.5, unit: 'acre' });
  assert.deepEqual(parseSize('2 and half acres'), { value: 2.5, unit: 'acre' });
  assert.deepEqual(parseSize('2 and a half acres'), { value: 2.5, unit: 'acre' });
  assert.deepEqual(parseSize('2½ acres'), { value: 2.5, unit: 'acre' });
  assert.deepEqual(parseSize('1 1/2 plots'), { value: 1.5, unit: 'plot' });
  assert.deepEqual(parseSize('3/4 acre'), { value: 0.75, unit: 'acre' });
  assert.deepEqual(parseSize('two acres'), { value: 2, unit: 'acre' });
  assert.deepEqual(parseSize('9 hectares'), { value: 9, unit: 'hectare' });
  assert.deepEqual(parseSize('1 hectare'), { value: 1, unit: 'hectare' });
  assert.deepEqual(parseSize('2.5 ha'), { value: 2.5, unit: 'hectare' });
  assert.deepEqual(parseSize('10'), { value: 10, unit: null });
  assert.deepEqual(parseSize('lots'), { value: null, unit: null });
});

test('parseAmount handles naira formats and shorthand', () => {
  assert.equal(parseAmount('5000000'), 5000000);
  assert.equal(parseAmount('₦5,000,000'), 5000000);
  assert.equal(parseAmount('N 5,000,000.00'), 5000000);
  assert.equal(parseAmount('NGN 1,800,000'), 1800000);
  assert.equal(parseAmount('5m'), 5000000);
  assert.equal(parseAmount('5.5 million'), 5500000);
  assert.equal(parseAmount('750k'), 750000);
  assert.equal(parseAmount('five million'), null);
});

test('normalizePhone repairs numbers that lost their leading zero', () => {
  assert.deepEqual(normalizePhone('8086068464'), { phone: '+2348086068464', assumedNigerian: true, unrecognised: false });
  assert.equal(normalizePhone('08086068464').phone, '+2348086068464');
  assert.equal(normalizePhone('2348086068464').phone, '+2348086068464');
  assert.equal(normalizePhone('+234 808 606 8464').phone, '+2348086068464');
  assert.equal(normalizePhone('447510654043').phone, '+447510654043');
  assert.equal(normalizePhone('16126360852').phone, '+16126360852');
  assert.equal(normalizePhone('5068983943').unrecognised, true);
  assert.equal(normalizePhone('').phone, '');
});

test('parseDate reads day-first dates', () => {
  assert.equal(parseDate('15/03/2023').date, '2023-03-15');
  assert.equal(parseDate('05/03/2023').date, '2023-03-05');
  assert.equal(parseDate('2023-03-15').date, '2023-03-15');
  assert.equal(parseDate('15 March 2023').date, '2023-03-15');
  assert.equal(parseDate('March 15, 2023').date, '2023-03-15');
  assert.equal(parseDate('03/15/2023').date, '2023-03-15');
  assert.equal(parseDate('03/15/2023').note, 'read as month/day/year');
  assert.equal(parseDate('45000').date, '2023-03-15');
  assert.equal(parseDate('31/02/2023').date, null);
  assert.equal(parseDate('soon').date, null);
});

test('crop and farm helpers', () => {
  assert.equal(cropFromText('Phase 1 Pawpaw Farm'), 'Pawpaw');
  assert.equal(cropFromText('Phase 3 Oil Plam Farm'), 'Oil Palm');
  assert.equal(cropFromText('Akanran Cocoa Farm'), 'Cocoa');
  assert.equal(cropFromText('Phase 2 Coconut Farm'), 'Coconut');
  assert.equal(cropFromText('Main Estate'), null);
  assert.equal(farmKeyOf('Phase 1 Oil Palm'), farmKeyOf('phase 1  oil palm FARM'));
});

const ctx = { existingUsers: [], existingFarms: [] };

test('normalizeImportRows: usernames, swapped columns, sizes, crops', () => {
  const { rows, globalWarnings } = normalizeImportRows(
    [
      { username: '', name: 'Ada Obi', email: 'ADA.Obi@Example.com', phone: '8031234567', Size: '1 plot', farmEstate: 'Phase 1 Pawpaw Farm', farmLocation: 'iwo', farmState: 'OSUN' },
      { name: 'ada.obi@example.com', email: 'Ada Obi', Size: 'half acre', farmEstate: 'Phase 3 Oil Palm Farm' },
      { name: 'Bayo', email: 'ada@other.com', Size: '2 and half acres', farmEstate: 'Phase 3 Oil Palm Farm', 'Invested Amount': '₦2,500,000', 'Payment date': '15/03/2023' },
      { name: 'Ada Obi', email: 'not-an-email', Size: '1 acre', farmEstate: 'Phase 1 Pawpaw Farm' }
    ],
    ctx
  );
  const [a, b, c, d] = rows;
  assert.equal(a.username, 'ada.obi');
  assert.equal(a.email, 'ada.obi@example.com');
  assert.equal(a.phone, '+2348031234567');
  assert.equal(a.size, 1);
  assert.equal(a.sizeUnit, 'plot');
  assert.equal(a.cropType, 'Pawpaw');
  assert.equal(a.farmLocation, 'Iwo');
  assert.equal(a.farmState, 'Osun');

  assert.equal(b.email, 'ada.obi@example.com');
  assert.equal(b.name, 'Ada Obi');
  assert.equal(b.username, 'ada.obi', 'same email reuses the same username');
  assert.ok(b.warnings.some(w => w.includes('swapped')));
  assert.equal(b.size, 0.5);
  assert.equal(b.sizeUnit, 'acre');
  assert.equal(b.cropType, 'Oil Palm');

  assert.equal(c.username, 'ada', 'unique username');
  assert.equal(c.size, 2.5);
  assert.equal(c.investmentAmount, 2500000);
  assert.equal(c.startDate, '2023-03-15');

  assert.ok(d.errors.length > 0);
  assert.ok(globalWarnings.some(w => w.includes('username')));
});

test('normalizeImportRows: typos, spelling variants, duplicates, shared emails, conflicts', () => {
  const base = { Size: '1 acre' };
  const { rows } = normalizeImportRows(
    [
      { ...base, name: 'A One', email: 'a@x.com', farmEstate: 'Phase 3 Oil Palm Farm' },
      { ...base, name: 'B Two', email: 'b@x.com', farmEstate: 'Phase 3 Oil Palm Farm' },
      { ...base, name: 'C Three', email: 'c@x.com', farmEstate: 'Phase 3 Oil Plam Farm' },
      { ...base, name: 'D Four', email: 'd@x.com', farmEstate: 'Phase 2 Oil Palm Farm' },
      { ...base, name: 'E Five', email: 'e@x.com', farmEstate: 'Phase 1 Oil Palm' },
      { ...base, name: 'E Five', email: 'e@x.com', farmEstate: 'Phase 1 Oil Palm Farm' },
      { ...base, name: 'E Five', email: 'e@x.com', farmEstate: 'Phase 1 Oil Palm Farm' },
      { ...base, name: 'Mr Ryan Five', email: 'e@x.com', farmEstate: 'Phase 1 Oil Palm Farm', cropType: 'Cocoa' },
      { name: 'F Six', email: 'f@x.com', Size: '1 plot', farmEstate: 'Phase 2 Oil Palm Farm', sizeHectares: '3', sizeUnit: 'acre' }
    ],
    ctx,
    { skipDuplicateRows: true }
  );
  assert.ok(rows[2].warnings.some(w => w.includes('misspelling')), 'typo flagged');
  assert.ok(!rows[3].warnings.some(w => w.includes('misspelling')), 'different phase number is not a typo');
  assert.equal(rows[4].farmName, 'Phase 1 Oil Palm Farm', 'spelling variant unified');
  assert.equal(rows[6].skip, true, 'exact duplicate skipped');
  assert.equal(rows[7].skip, false, 'same email but a different person is not a duplicate');
  assert.ok(rows[7].warnings.some(w => w.includes('also used for')), 'shared email flagged');
  assert.ok(rows[7].warnings.some(w => w.includes('does not match the farm name')), 'crop conflict flagged');
  assert.equal(rows[8].size, 3);
  assert.equal(rows[8].sizeUnit, 'acre');
  assert.ok(rows[8].warnings.some(w => w.includes('size/unit columns were used')), 'size conflict flagged');
});

test('normalizeImportRows: existing accounts and farms', () => {
  const { rows } = normalizeImportRows(
    [{ name: 'Ada Obi', email: 'ada@example.com', Size: '1 acre', farmEstate: 'akanran cocoa' }],
    { existingUsers: [{ username: 'adaobi', email: 'ada@example.com', name: 'Ada Obi' }], existingFarms: [{ id: 'farm-1', name: 'Akanran Cocoa Farm' }] }
  );
  assert.equal(rows[0].username, 'adaobi');
  assert.equal(rows[0].usernameGenerated, false);
  assert.equal(rows[0].farmName, 'Akanran Cocoa Farm');
});
