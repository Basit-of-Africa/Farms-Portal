/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ParsedInvestorCsvRow {
  username?: string;
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  farmId?: string;
  farmEstate?: string;
  farmLocation?: string;
  farmState?: string;
  farmDescription?: string;
  farmDateEstablished?: string;
  plotNumber?: string;
  sizeHectares?: string;
  sizeUnit?: string;
  cropType?: string;
  investmentAmount?: string;
  ownershipPercentage?: string;
  contractRef?: string;
  startDate?: string;
}

/**
 * Splits a single CSV line into fields while respecting RFC-4180 double-quoted values
 * (so commas inside quoted numbers like "5,000,000" and apostrophes like "O'Brien" are preserved).
 */
function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function normalizeHeader(rawHeader: string): string {
  return rawHeader
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/['"\s_-]+/g, '');
}

function cleanCellValue(raw: string | undefined): string {
  if (!raw) return '';
  let val = raw.trim();
  if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
    val = val.slice(1, -1).replace(/""/g, '"');
  }
  return val.trim();
}

export function cleanNumericInput(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  const cleaned = String(raw).replace(/[^0-9.-]/g, '');
  return cleaned;
}

export function parseCsvRecords(text: string): {
  headers: string[];
  records: ParsedInvestorCsvRow[];
} {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], records: [] };
  }

  const rawHeaders = splitCsvLine(lines[0]);
  const headers = rawHeaders.map(normalizeHeader);
  const records: ParsedInvestorCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const record: ParsedInvestorCsvRow = {};

    headers.forEach((header, index) => {
      const val = cleanCellValue(values[index]);
      if (!val) return;

      switch (header) {
        case 'username':
        case 'user':
        case 'handle':
          record.username = val;
          break;
        case 'name':
        case 'fullname':
        case 'investorname':
          record.name = val;
          break;
        case 'email':
        case 'emailaddress':
          record.email = val;
          break;
        case 'phone':
        case 'telephone':
        case 'phonenumber':
        case 'mobile':
          record.phone = val;
          break;
        case 'password':
        case 'pass':
          record.password = val;
          break;
        case 'farmid':
          record.farmId = val;
          break;
        case 'farmestate':
        case 'farm':
        case 'estate':
        case 'estatename':
        case 'farmname':
          record.farmEstate = val;
          break;
        case 'farmlocation':
        case 'location':
        case 'farmcity':
        case 'city':
          record.farmLocation = val;
          break;
        case 'farmstate':
        case 'state':
          record.farmState = val;
          break;
        case 'farmdescription':
        case 'description':
          record.farmDescription = val;
          break;
        case 'farmdateestablished':
        case 'dateestablished':
          record.farmDateEstablished = val;
          break;
        case 'plotnumber':
        case 'plotno':
        case 'plotid':
        case 'plot':
        case 'assignedplot':
        case 'plotcode':
          record.plotNumber = val;
          break;
        case 'sizehectares':
        case 'plotsize':
        case 'size':
        case 'acres':
        case 'hectares':
        case 'acreage':
        case 'landsize':
          record.sizeHectares = cleanNumericInput(val) || val;
          break;
        case 'sizeunit':
        case 'unit':
        case 'plotunit':
          record.sizeUnit = val;
          break;
        case 'croptype':
        case 'crop':
        case 'cultivar':
          record.cropType = val;
          break;
        case 'investmentamount':
        case 'amountinvested':
        case 'investment':
        case 'amount':
        case 'capital':
        case 'totalinvested':
        case 'amountpaid':
          record.investmentAmount = cleanNumericInput(val) || val;
          break;
        case 'ownershippercentage':
        case 'ownership':
        case 'share':
          record.ownershipPercentage = cleanNumericInput(val) || val;
          break;
        case 'contractref':
        case 'contract':
        case 'reference':
          record.contractRef = val;
          break;
        case 'startdate':
        case 'date':
          record.startDate = val;
          break;
      }
    });

    if (record.username || record.name || record.email) {
      records.push(record);
    }
  }

  return { headers, records };
}
