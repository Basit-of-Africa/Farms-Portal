/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cleans and validates investor import rows (CSV/JSON) before anything is
 * saved. It is forgiving about how spreadsheets are typically filled in
 * ("1 acre", "half acre", "2 and half acres", "₦5,000,000", "5m",
 * phone numbers without the leading 0, missing usernames, name/email typed
 * in the wrong columns) and reports everything it changed or could not
 * understand, so the admin can review a preview before importing.
 */

export type SizeUnit = 'acre' | 'hectare' | 'plot';

export interface NormalizedImportRow {
  rowNum: number;
  username: string;
  usernameGenerated: boolean;
  name: string;
  email: string;
  phone: string;
  password?: string;
  farmId?: string;
  farmName: string;
  /** Comparison key for the farm (case/spacing/"Farm" suffix insensitive) */
  farmKey: string;
  farmLocation: string;
  farmState: string;
  farmDescription?: string;
  farmDateEstablished?: string;
  plotNumber: string;
  size: number;
  sizeUnit: SizeUnit;
  cropType: string;
  investmentAmount: number;
  ownershipPercentage: number;
  contractRef?: string;
  startDate?: string;
  /** Skip this row (exact duplicate and skipping was requested) */
  skip: boolean;
  warnings: string[];
  errors: string[];
}

export interface ImportContext {
  existingUsers: Array<{ username: string; email: string; name: string }>;
  existingFarms: Array<{ id: string; name: string; location?: string; state?: string }>;
}

export interface ImportOptions {
  skipDuplicateRows?: boolean;
  /** Reference date for "today" (tests) */
  today?: Date;
}

export interface NormalizeResult {
  rows: NormalizedImportRow[];
  globalWarnings: string[];
}

// ---------------------------------------------------------------------------
// Column aliases
// ---------------------------------------------------------------------------

/** Lower-cases a header and strips everything but letters and digits. */
export function canonicalKey(key: string): string {
  return String(key).replace(/^﻿/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

type Field =
  | 'username' | 'name' | 'email' | 'phone' | 'password' | 'farmId' | 'farmName' | 'farmLocation' | 'farmState'
  | 'farmDescription' | 'farmDateEstablished' | 'plotNumber' | 'sizeText' | 'sizeValue' | 'sizeAcres' | 'sizeHectaresOnly'
  | 'sizePlots' | 'sizeUnit' | 'cropType' | 'investmentAmount' | 'ownershipPercentage' | 'contractRef' | 'startDate' | 'roiPaid';

const ALIASES: Record<string, Field> = {};
const alias = (field: Field, ...keys: string[]) => keys.forEach(k => (ALIASES[k] = field));
alias('username', 'username', 'user', 'handle', 'login', 'userid');
alias('name', 'name', 'fullname', 'investorname', 'investor', 'clientname', 'customername');
alias('email', 'email', 'emailaddress', 'mail', 'emailid');
alias('phone', 'phone', 'telephone', 'phonenumber', 'mobile', 'mobilenumber', 'whatsapp', 'tel', 'phoneno');
alias('password', 'password', 'pass');
alias('farmId', 'farmid');
alias('farmName', 'farmestate', 'farm', 'estate', 'estatename', 'farmname', 'project', 'projectname');
alias('farmLocation', 'farmlocation', 'location', 'farmcity', 'city', 'town', 'lga');
alias('farmState', 'farmstate', 'state');
alias('farmDescription', 'farmdescription', 'description');
alias('farmDateEstablished', 'farmdateestablished', 'dateestablished');
alias('plotNumber', 'plotnumber', 'plotno', 'plotid', 'plot', 'assignedplot', 'plotcode');
alias('sizeText', 'size', 'sizetext', 'plotsize', 'landsize', 'acreage', 'quantity', 'units', 'landarea', 'area');
alias('sizeValue', 'sizehectares', 'sizevalue', 'sizenumber');
alias('sizeAcres', 'acres', 'sizeacres', 'noofacres', 'numberofacres');
alias('sizeHectaresOnly', 'hectares', 'noofhectares', 'numberofhectares');
alias('sizePlots', 'plots', 'noofplots', 'numberofplots');
alias('sizeUnit', 'sizeunit', 'unit', 'plotunit');
alias('cropType', 'croptype', 'crop', 'cultivar');
alias('investmentAmount', 'investmentamount', 'amountinvested', 'investedamount', 'investment', 'amount', 'capital', 'totalinvested', 'amountpaid', 'totalamount', 'investmentvalue');
alias('ownershipPercentage', 'ownershippercentage', 'ownership', 'share', 'ownershippercent');
alias('contractRef', 'contractref', 'contract', 'reference', 'contractno', 'contractnumber');
alias('startDate', 'startdate', 'date', 'paymentdate', 'dateofpayment', 'investmentdate', 'datepaid', 'datepurchased');
alias('roiPaid', 'totalroipaid', 'roipaid', 'roi', 'returnspaid', 'totalreturns');

function mapRow(raw: Record<string, unknown>): { values: Partial<Record<Field, string>>; unknown: string[] } {
  const values: Partial<Record<Field, string>> = {};
  const unknown: string[] = [];
  for (const [key, val] of Object.entries(raw || {})) {
    if (val === undefined || val === null) continue;
    const text = String(val).trim();
    const field = ALIASES[canonicalKey(key)];
    if (!field) {
      if (text) unknown.push(key);
      continue;
    }
    if (text && !values[field]) values[field] = text;
  }
  return { values, unknown };
}

// ---------------------------------------------------------------------------
// Value parsers (exported for tests)
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20
};

export function parseUnit(text: string): SizeUnit | null {
  const s = text.toLowerCase();
  if (/hect|\bha\b/.test(s)) return 'hectare';
  if (/acre|\bac\b/.test(s)) return 'acre';
  if (/plot/.test(s)) return 'plot';
  return null;
}

/** Parses "1 acre", "half acre", "2 and half acres", "2½ acres", "1 1/2 plots", "two acres", "1.5". */
export function parseSize(text: string): { value: number | null; unit: SizeUnit | null } {
  let s = ` ${String(text).toLowerCase().replace(/,/g, '')} `;
  const unit = parseUnit(s);
  s = s.replace(/½/g, ' and half ').replace(/¼/g, ' and quarter ').replace(/¾/g, ' and three quarter ');
  for (const [word, n] of Object.entries(NUMBER_WORDS)) s = s.replace(new RegExp(`\\b${word}\\b`, 'g'), String(n));

  let m: RegExpMatchArray | null;
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:and|&)?\s*(?:a\s+)?three\s*quarters?/))) return { value: +m[1] + 0.75, unit };
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:and|&)\s*(?:a\s+)?half/))) return { value: +m[1] + 0.5, unit };
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:and|&)\s*(?:a\s+)?quarter/))) return { value: +m[1] + 0.25, unit };
  if ((m = s.match(/(\d+)\s+(\d+)\s*\/\s*(\d+)/)) && +m[3] > 0) return { value: +m[1] + +m[2] / +m[3], unit };
  if ((m = s.match(/(\d+)\s*\/\s*(\d+)/)) && +m[2] > 0) return { value: +m[1] / +m[2], unit };
  if ((m = s.match(/(\d+(?:\.\d+)?)/))) return { value: +m[1], unit };
  if (/\bhalf\b/.test(s)) return { value: 0.5, unit };
  if (/\bquarter\b/.test(s)) return { value: 0.25, unit };
  return { value: null, unit };
}

/** Parses "₦5,000,000", "N 5,000,000.00", "5m", "5.5 million", "750k". */
export function parseAmount(text: string): number | null {
  const s = String(text).toLowerCase().replace(/[₦,\s]/g, '').replace(/^(ngn|naira|n)(?=[\d.])/, '');
  const m = s.match(/^(-?\d+(?:\.\d+)?)(k|thousand|m|mil|million|b|bn|billion)?(naira|ngn)?$/);
  if (!m) return null;
  const mult = !m[2] ? 1 : /^k|thousand/.test(m[2]) ? 1e3 : /^b/.test(m[2]) ? 1e9 : 1e6;
  return Math.round(parseFloat(m[1]) * mult * 100) / 100;
}

/**
 * Normalises a phone number to international format. Numbers with 10 digits
 * starting 7/8/9 are treated as Nigerian numbers whose leading 0 was dropped
 * (common when Excel stores phone numbers as numbers).
 */
export function normalizePhone(text: string): { phone: string; assumedNigerian: boolean; unrecognised: boolean } {
  const raw = String(text).trim();
  if (!raw) return { phone: '', assumedNigerian: false, unrecognised: false };
  const hasPlus = raw.startsWith('+') || raw.startsWith('00');
  const digits = raw.replace(/\D/g, '').replace(/^00/, '');
  if (hasPlus && digits.length >= 8) return { phone: `+${digits}`, assumedNigerian: false, unrecognised: false };
  if (digits.startsWith('234') && digits.length === 13) return { phone: `+${digits}`, assumedNigerian: false, unrecognised: false };
  if (digits.startsWith('0') && digits.length === 11) return { phone: `+234${digits.slice(1)}`, assumedNigerian: false, unrecognised: false };
  if (digits.length === 10 && /^[789]/.test(digits)) return { phone: `+234${digits}`, assumedNigerian: true, unrecognised: false };
  // Common diaspora country codes typed without "+": UK, US/Canada, Ireland, Ghana, Kenya, South Africa, UAE, Germany, France
  if (/^(44\d{10}|1\d{10}|353\d{8,9}|233\d{9}|254\d{9}|27\d{9}|971\d{8,9}|49\d{9,11}|33\d{9})$/.test(digits)) {
    return { phone: `+${digits}`, assumedNigerian: false, unrecognised: false };
  }
  return { phone: raw, assumedNigerian: false, unrecognised: true };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
};

/**
 * Parses dates as written in Nigeria/UK (day first): 15/03/2023, 15-03-2023,
 * 15 March 2023, March 15, 2023, 2023-03-15, and Excel serial numbers.
 */
export function parseDate(text: string): { date: string | null; note?: string } {
  const s = String(text).trim().toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return { date: iso(+m[1], +m[2], +m[3]) };
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    let [a, b, y] = [+m[1], +m[2], +m[3]];
    if (y < 100) y += 2000;
    if (a <= 12 && b > 12) return { date: iso(y, a, b), note: 'read as month/day/year' };
    return { date: iso(y, b, a) };
  }
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\.?,?\s+(\d{4})$/))) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3));
    if (mi >= 0) return { date: iso(+m[3], mi + 1, +m[1]) };
  }
  if ((m = s.match(/^([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/))) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3));
    if (mi >= 0) return { date: iso(+m[3], mi + 1, +m[2]) };
  }
  if (/^\d{5}$/.test(s) && +s > 20000 && +s < 80000) {
    // Excel serial date (days since 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + +s * 86400000);
    return { date: d.toISOString().slice(0, 10), note: 'converted from an Excel date number' };
  }
  return { date: null };
}

const CROP_KEYWORDS: Array<[RegExp, string]> = [
  [/paw\s*paw|papaya/, 'Pawpaw'],
  [/coconut/, 'Coconut'],
  [/cocoa|cacao/, 'Cocoa'],
  [/oil\s*pa?l?a?m|oil\s*plam|\bpalm\b/, 'Oil Palm'],
  [/cashew/, 'Cashew'],
  [/plantain|banana/, 'Plantain'],
  [/cassava/, 'Cassava'],
  [/maize|corn/, 'Maize'],
  [/\brice\b/, 'Rice'],
  [/pineapple/, 'Pineapple'],
  [/citrus|orange/, 'Citrus']
];

export function cropFromText(text: string): string | null {
  const s = String(text).toLowerCase();
  for (const [re, crop] of CROP_KEYWORDS) if (re.test(s)) return crop;
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isEmail = (s: string) => EMAIL_RE.test(String(s).trim());

const collapse = (s: string) => String(s).replace(/\s+/g, ' ').trim();
const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());
/** Title-cases text typed entirely in upper or lower case ("OYO", "iwo"). */
const tidyPlace = (s: string) => {
  const c = collapse(s);
  return c && (c === c.toUpperCase() || c === c.toLowerCase()) ? titleCase(c) : c;
};

/** Farm comparison key: case, spacing and "farm/estate" words ignored. */
export function farmKeyOf(name: string): string {
  return collapse(name).toLowerCase().replace(/\b(farms?|estates?|plantations?)\b/g, '').replace(/[^a-z0-9]/g, '');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const TITLES = /\b(mr|mrs|ms|miss|dr|prof|professor|engr|engineer|alh|alhaji|alhaja|chief|pastor|rev|sir|hon)\.?\s+/g;
const personKey = (name: string) => collapse(name.toLowerCase().replace(TITLES, ' ')).replace(/[^a-z ]/g, '');

function makeUsernameBase(email: string, name: string): string {
  const local = (email.split('@')[0] || name || 'investor').toLowerCase();
  const base = local.replace(/[^a-z0-9._-]/g, '').replace(/^[._-]+|[._-]+$/g, '').slice(0, 30);
  return base.length >= 3 ? base : `investor${base}`;
}

// ---------------------------------------------------------------------------
// Main normaliser
// ---------------------------------------------------------------------------

export function normalizeImportRows(rawRows: Array<Record<string, unknown>>, ctx: ImportContext, opts: ImportOptions = {}): NormalizeResult {
  const globalWarnings: string[] = [];
  const today = (opts.today || new Date()).toISOString().slice(0, 10);
  const usedUsernames = new Set(ctx.existingUsers.map(u => u.username.toLowerCase()));
  const usernameByEmail = new Map<string, string>();
  for (const u of ctx.existingUsers) if (u.email) usernameByEmail.set(u.email.toLowerCase(), u.username);
  const existingByEmail = new Map(ctx.existingUsers.filter(u => u.email).map(u => [u.email.toLowerCase(), u]));

  let generatedUsernames = 0;
  let assumedNigerianPhones = 0;
  let missingAmounts = 0;
  let inferredCrops = 0;
  let defaultedCrops = 0;
  let roiColumnRows = 0;
  const unknownColumns = new Set<string>();

  const rows: NormalizedImportRow[] = rawRows.map((raw, i) => {
    const rowNum = i + 1;
    const { values: v, unknown } = mapRow(raw as Record<string, unknown>);
    unknown.forEach(k => unknownColumns.add(k));
    const warnings: string[] = [];
    const errors: string[] = [];

    // --- Name & email (detect columns typed the wrong way round)
    let name = collapse(v.name || '');
    let email = collapse(v.email || '').toLowerCase();
    if (!isEmail(email) && isEmail(name)) {
      warnings.push(`Name and email looked swapped ("${v.email || ''}" / "${v.name || ''}"); they were swapped back.`);
      [name, email] = [collapse(v.email || ''), name.toLowerCase()];
    }
    if (!name) errors.push('Name is missing.');
    if (!email) errors.push('Email is missing.');
    else if (!isEmail(email)) errors.push(`"${email}" is not a valid email address.`);

    // --- Username
    let username = collapse(v.username || '');
    let usernameGenerated = false;
    if (!username && email && isEmail(email)) {
      const known = usernameByEmail.get(email);
      if (known) {
        username = known;
      } else {
        const base = makeUsernameBase(email, name);
        let candidate = base;
        for (let n = 2; usedUsernames.has(candidate.toLowerCase()); n++) candidate = `${base}${n}`;
        username = candidate;
        usernameGenerated = true;
        generatedUsernames++;
      }
    }
    if (username && email) {
      usedUsernames.add(username.toLowerCase());
      if (!usernameByEmail.has(email)) usernameByEmail.set(email, username);
    }

    // --- Phone
    const ph = normalizePhone(v.phone || '');
    if (ph.assumedNigerian) assumedNigerianPhones++;
    if (ph.unrecognised) warnings.push(`Phone number "${v.phone}" is not in a recognised format; it was kept as typed.`);

    // --- Farm
    const farmName = collapse(v.farmName || '');
    const farmKey = farmName ? farmKeyOf(farmName) : '';

    // --- Size and unit
    const fromText = v.sizeText ? parseSize(v.sizeText) : { value: null, unit: null };
    let value: number | null = null;
    let unit: SizeUnit | null = null;
    let impliedUnit: SizeUnit | null = null;
    let explicitValueText = v.sizeValue;
    if (!explicitValueText && v.sizeAcres) { explicitValueText = v.sizeAcres; impliedUnit = 'acre'; }
    if (!explicitValueText && v.sizeHectaresOnly) { explicitValueText = v.sizeHectaresOnly; impliedUnit = 'hectare'; }
    if (!explicitValueText && v.sizePlots) { explicitValueText = v.sizePlots; impliedUnit = 'plot'; }
    if (explicitValueText) {
      const p = parseSize(explicitValueText);
      value = p.value;
      if (p.value === null) warnings.push(`Size "${explicitValueText}" could not be read.`);
      impliedUnit = p.unit || impliedUnit;
    }
    if (v.sizeUnit) {
      unit = parseUnit(v.sizeUnit);
      if (!unit) warnings.push(`Unit "${v.sizeUnit}" was not recognised (use acre, hectare or plot).`);
    }
    unit = unit || impliedUnit;
    if (v.sizeText && fromText.value === null) warnings.push(`Size "${v.sizeText}" could not be read.`);
    if (value !== null || unit) {
      const conflictValue = fromText.value !== null && value !== null && Math.abs(fromText.value - value) > 1e-9;
      const conflictUnit = fromText.unit && unit && fromText.unit !== unit;
      if (conflictValue || conflictUnit) {
        warnings.push(`Size column says "${v.sizeText}" but the size/unit columns say ${value ?? fromText.value} ${unit ?? fromText.unit ?? ''}; the size/unit columns were used.`);
      }
    }
    if (value === null) value = fromText.value;
    if (!unit) unit = fromText.unit;
    if (value === null || value <= 0) {
      if (farmName) warnings.push('Size is missing; 1 was assumed.');
      value = 1;
    }
    if (!unit) {
      if (farmName) warnings.push('Size unit is missing; acres were assumed.');
      unit = 'acre';
    }

    // --- Crop
    const farmCrop = cropFromText(farmName);
    let cropType = collapse(v.cropType || '');
    if (cropType) {
      const normalisedCrop = cropFromText(cropType) || tidyPlace(cropType);
      if (farmCrop && cropFromText(cropType) && cropFromText(cropType) !== farmCrop) {
        warnings.push(`Crop "${cropType}" does not match the farm name "${farmName}".`);
      }
      cropType = normalisedCrop;
    } else if (farmCrop) {
      cropType = farmCrop;
      inferredCrops++;
    } else {
      cropType = 'Oil Palm';
      if (farmName) {
        defaultedCrops++;
        warnings.push('Crop is missing and could not be worked out from the farm name; "Oil Palm" was assumed.');
      }
    }

    // --- Amount
    let investmentAmount = 0;
    if (v.investmentAmount) {
      const amt = parseAmount(v.investmentAmount);
      if (amt === null || amt < 0) warnings.push(`Investment amount "${v.investmentAmount}" could not be read; 0 was used.`);
      else investmentAmount = amt;
    } else if (farmName) {
      missingAmounts++;
    }

    // --- Ownership
    let ownershipPercentage = 100;
    if (v.ownershipPercentage) {
      const pct = parseFloat(String(v.ownershipPercentage).replace(/[^0-9.]/g, ''));
      if (Number.isFinite(pct) && pct > 0 && pct <= 100) ownershipPercentage = pct;
      else warnings.push(`Ownership "${v.ownershipPercentage}" is not a percentage between 0 and 100; 100% was used.`);
    }

    // --- Start date
    let startDate: string | undefined;
    if (v.startDate) {
      const d = parseDate(v.startDate);
      if (!d.date) warnings.push(`Date "${v.startDate}" could not be read; today's date was used.`);
      else {
        startDate = d.date;
        if (d.note) warnings.push(`Date "${v.startDate}" was ${d.note}.`);
        if (d.date > today) warnings.push(`Date "${v.startDate}" is in the future.`);
      }
    }

    if (v.roiPaid) roiColumnRows++;

    return {
      rowNum,
      username,
      usernameGenerated,
      name,
      email,
      phone: ph.phone,
      password: v.password,
      farmId: v.farmId,
      farmName,
      farmKey,
      farmLocation: tidyPlace(v.farmLocation || ''),
      farmState: tidyPlace(v.farmState || ''),
      farmDescription: v.farmDescription,
      farmDateEstablished: v.farmDateEstablished,
      plotNumber: collapse(v.plotNumber || ''),
      size: Math.round(value * 10000) / 10000,
      sizeUnit: unit,
      cropType,
      investmentAmount,
      ownershipPercentage,
      contractRef: v.contractRef,
      startDate,
      skip: false,
      warnings,
      errors
    };
  });

  const valid = rows.filter(r => r.errors.length === 0);

  // --- Farm names: unify spelling variants and flag likely typos
  const existingFarmByKey = new Map(ctx.existingFarms.map(f => [farmKeyOf(f.name), f]));
  const namesByKey = new Map<string, Map<string, number>>();
  for (const r of valid) {
    if (!r.farmKey) continue;
    const m = namesByKey.get(r.farmKey) || new Map<string, number>();
    m.set(r.farmName, (m.get(r.farmName) || 0) + 1);
    namesByKey.set(r.farmKey, m);
  }
  const canonicalName = new Map<string, string>();
  for (const [key, names] of namesByKey) {
    const existing = existingFarmByKey.get(key);
    const best = existing ? existing.name : [...names.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
    canonicalName.set(key, best);
  }
  for (const r of valid) {
    if (!r.farmKey) continue;
    const best = canonicalName.get(r.farmKey)!;
    if (best !== r.farmName) {
      r.warnings.push(`Farm "${r.farmName}" was treated as "${best}".`);
      r.farmName = best;
    }
  }
  const allKeys = new Set<string>([...namesByKey.keys(), ...existingFarmByKey.keys()]);
  const digitsOf = (s: string) => (s.match(/\d+/g) || []).join(',');
  const keyCount = (k: string) => [...(namesByKey.get(k)?.values() || [])].reduce((a, b) => a + b, 0) + (existingFarmByKey.has(k) ? 1000 : 0);
  for (const key of namesByKey.keys()) {
    for (const other of allKeys) {
      if (other === key || digitsOf(other) !== digitsOf(key) || Math.min(key.length, other.length) < 6) continue;
      if (levenshtein(key, other) <= 2 && keyCount(other) > keyCount(key)) {
        const otherName = canonicalName.get(other) || existingFarmByKey.get(other)?.name || other;
        for (const r of valid) {
          if (r.farmKey === key) r.warnings.push(`Farm "${r.farmName}" looks like a misspelling of "${otherName}". Fix the file, or it will be created as a separate farm.`);
        }
      }
    }
  }

  // --- Location/state consistency per farm
  const farmPlace = new Map<string, { location: string; state: string; row: number }>();
  for (const r of valid) {
    if (!r.farmKey) continue;
    const existing = existingFarmByKey.get(r.farmKey);
    const first = farmPlace.get(r.farmKey);
    if (!first) {
      farmPlace.set(r.farmKey, { location: existing?.location || r.farmLocation, state: existing?.state || r.farmState, row: r.rowNum });
      continue;
    }
    const diffLoc = r.farmLocation && first.location && r.farmLocation.toLowerCase() !== first.location.toLowerCase();
    const diffState = r.farmState && first.state && r.farmState.toLowerCase() !== first.state.toLowerCase();
    if (diffLoc || diffState) {
      r.warnings.push(`Location "${r.farmLocation}, ${r.farmState}" differs from "${first.location}, ${first.state}" given for this farm on row ${first.row}; the first one is used.`);
    }
  }

  // --- Exact duplicate rows
  const seen = new Map<string, number>();
  for (const r of valid) {
    const sig = [r.email, personKey(r.name), r.farmKey, r.plotNumber, r.size, r.sizeUnit, r.cropType, r.investmentAmount, r.startDate || ''].join('|');
    const first = seen.get(sig);
    if (first) {
      if (opts.skipDuplicateRows) {
        r.skip = true;
        r.warnings.push(`Exact duplicate of row ${first}; skipped.`);
      } else {
        r.warnings.push(`Exact duplicate of row ${first}; a second holding will be created.`);
      }
    } else {
      seen.set(sig, r.rowNum);
    }
  }

  // --- One email used for different people
  const byEmail = new Map<string, NormalizedImportRow[]>();
  for (const r of valid) byEmail.set(r.email, [...(byEmail.get(r.email) || []), r]);
  for (const [email, group] of byEmail) {
    const accountName = existingByEmail.get(email)?.name || group[0].name;
    const accountKey = personKey(accountName);
    for (const r of group) {
      const k = personKey(r.name);
      if (k === accountKey) continue;
      const related = k.includes(accountKey) || accountKey.includes(k);
      const joint = / and |&/.test(` ${k} `) || / and |&/.test(` ${accountKey} `);
      if (!related || joint) {
        r.warnings.push(`Email ${email} is also used for "${accountName}". This holding will be added to that one account${existingByEmail.has(email) ? ' (an existing user)' : ''}. Use a separate email if this is a different person.`);
      }
    }
  }

  // --- Summary warnings
  if (generatedUsernames) globalWarnings.push(`${generatedUsernames} username(s) were created from email addresses.`);
  if (assumedNigerianPhones) globalWarnings.push(`${assumedNigerianPhones} phone number(s) had no leading 0 or country code and were treated as Nigerian (+234). Check any that belong to investors abroad.`);
  if (inferredCrops) globalWarnings.push(`Crop was taken from the farm name for ${inferredCrops} row(s).`);
  if (defaultedCrops) globalWarnings.push(`Crop defaulted to "Oil Palm" for ${defaultedCrops} row(s).`);
  if (missingAmounts) globalWarnings.push(`${missingAmounts} holding(s) have no investment amount and will be recorded as ₦0.`);
  if (roiColumnRows) globalWarnings.push('ROI/returns paid values are not imported. Record payouts in the Ledger so each has a period and date.');
  if (unknownColumns.size) globalWarnings.push(`These columns were not recognised and were ignored: ${[...unknownColumns].join(', ')}.`);

  return { rows, globalWarnings };
}
