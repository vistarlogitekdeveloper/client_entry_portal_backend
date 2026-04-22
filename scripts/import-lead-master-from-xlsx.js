require('dotenv').config();

const path = require('path');
const XLSX = require('xlsx');
const { Client } = require('pg');

const VALID_STATUS = new Set(['ACTIVE', 'INACTIVE']);
const VALID_PRIORITY = new Set(['HIGH', 'MEDIUM', 'LOW']);
const VALID_FINAL_STATUS = new Set(['WON', 'LOST', 'UNDER NEGOTIATION']);

const USER_ALIASES = {
  MARI: 'MARIAPPAN ACHARYA',
  MURALI: 'MURALIDHARAN K',
  CHETAN: 'CHETAN BHANGALE',
  PRAVIN: 'PRAVIN LOLE',
  'PRAVIN LOLE': 'PRAVIN LOLE',
  'DATTA BAMANKAR': 'DATTRAYA BAMANKAR',
  'DATTATRAYA BAMANKAR': 'DATTRAYA BAMANKAR',
  'DUTTA': 'DATTRAYA BAMANKAR'
};

function cleanString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
}

function normalizeName(value) {
  const text = cleanString(value);
  if (!text) {
    return '';
  }

  return text
    .toUpperCase()
    .replace(/\bMRS?\b\.?/g, ' ')
    .replace(/\bMS\b\.?/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/[^A-Z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTitleCase(value) {
  const text = cleanString(value);
  if (!text) {
    return null;
  }

  return text
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getExcelDate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) {
      return null;
    }

    const month = String(parsed.m).padStart(2, '0');
    const day = String(parsed.d).padStart(2, '0');
    return `${parsed.y}-${month}-${day}`;
  }

  const text = cleanString(value);
  if (!text) {
    return null;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function getMobile(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return String(Math.trunc(value));
  }

  return cleanString(value);
}

function getNumeric(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getMappedStatus(rawStatus) {
  const value = normalizeName(rawStatus);
  if (!value) {
    return 'ACTIVE';
  }

  if (value === 'NON ACTIVE' || value === 'NON-ACTIVE' || value === 'INACTIVE') {
    return 'INACTIVE';
  }

  if (value === 'ACTIVE') {
    return 'ACTIVE';
  }

  return 'ACTIVE';
}

function getMappedFinalStatus(rawStatus) {
  const value = normalizeName(rawStatus);
  if (value === 'WON') {
    return 'WON';
  }

  if (value === 'LOST') {
    return 'LOST';
  }

  if (
    value === 'PENDING' ||
    value === 'ONGOING' ||
    value === 'UNDER NEGOTIATION'
  ) {
    return 'UNDER NEGOTIATION';
  }

  return null;
}

function getMappedPriority(rawPriority) {
  const value = normalizeName(rawPriority);
  if (!value) {
    return null;
  }

  return VALID_PRIORITY.has(value) ? value : null;
}

function splitCandidateNames(value) {
  const normalized = normalizeName(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildUserResolver(users) {
  const byNormalizedName = new Map();

  for (const user of users) {
    byNormalizedName.set(normalizeName(user.name), user);
  }

  const findByAlias = (candidate) => {
    const aliasTarget = USER_ALIASES[candidate];
    if (!aliasTarget) {
      return null;
    }

    return byNormalizedName.get(normalizeName(aliasTarget)) ?? null;
  };

  const findByHeuristic = (candidate) => {
    let bestMatch = null;
    let bestScore = 0;
    const candidateTokens = candidate.split(' ').filter(Boolean);

    for (const user of users) {
      const userNormalized = normalizeName(user.name);
      const userTokens = userNormalized.split(' ').filter(Boolean);
      let score = 0;

      if (userNormalized === candidate) {
        return user;
      }

      if (userNormalized.includes(candidate) || candidate.includes(userNormalized)) {
        score += 5;
      }

      for (const candidateToken of candidateTokens) {
        for (const userToken of userTokens) {
          if (candidateToken === userToken) {
            score += 4;
          } else if (
            candidateToken.length >= 4 &&
            userToken.length >= 4 &&
            candidateToken.slice(0, 4) === userToken.slice(0, 4)
          ) {
            score += 2;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = user;
      }
    }

    return bestScore >= 4 ? bestMatch : null;
  };

  return (value, unresolvedNames) => {
    const candidates = splitCandidateNames(value);

    for (const candidate of candidates) {
      const direct = byNormalizedName.get(candidate);
      if (direct) {
        return direct.id;
      }

      const aliased = findByAlias(candidate);
      if (aliased) {
        return aliased.id;
      }

      const heuristic = findByHeuristic(candidate);
      if (heuristic) {
        return heuristic.id;
      }
    }

    const display = cleanString(value);
    if (display) {
      unresolvedNames.add(display);
    }

    return null;
  };
}

function buildLeadSignature(row) {
  return [
    row.company_name,
    row.business_scope,
    row.project_location,
    row.city,
    row.region,
    row.contact_person,
    row.email,
    row.owner,
    row.lead_by
  ]
    .map((value) => normalizeName(value))
    .join('|');
}

function mapSheetRow(row, resolveUser, unresolvedLeadBy, unresolvedOwners) {
  const rawStatus = row['STATUS'];
  const companyName = cleanString(row["CUSTOMER'S NAME"]);

  if (!companyName) {
    return null;
  }

  const mapped = {
    company_name: companyName,
    contact_person: cleanString(row['PERSON NAME']),
    email: cleanString(row['E-MAIL ID'])?.toLowerCase() ?? null,
    mobile: getMobile(row['CONTACT NUMBER']),
    status: getMappedStatus(rawStatus),
    priority: getMappedPriority(row['PRIORITY']),
    project_location: cleanString(row['LOCATION']),
    city: toTitleCase(row['CITY']),
    region: toTitleCase(row['REGION']),
    country: cleanString(row['COUNTRY']),
    business_scope: cleanString(row['BUSINESS SCOPE']),
    lead_received_date: getExcelDate(row['DOL']) || getExcelDate(row['LEAD GENERATED - MONTH']),
    rfq_submission_date: null,
    lead_by: resolveUser(row['LEAD BROUGHT & LEAD BY'], unresolvedLeadBy),
    owner: resolveUser(row['OWNER'], unresolvedOwners),
    study_status: 'ENQUIRY - INITIAL STATUS',
    commercial_status: 'NOT_STARTED',
    projected_value: getNumeric(row['PROJECTED VALUE']),
    projected_month: getExcelDate(row['Month']),
    progress_status: 'ENQUIRY - INITIAL STATUS',
    final_status: getMappedFinalStatus(rawStatus)
  };

  if (!VALID_STATUS.has(mapped.status)) {
    mapped.status = 'ACTIVE';
  }

  if (mapped.priority && !VALID_PRIORITY.has(mapped.priority)) {
    mapped.priority = null;
  }

  if (mapped.final_status && !VALID_FINAL_STATUS.has(mapped.final_status)) {
    mapped.final_status = null;
  }

  return mapped;
}

async function getLeadMasterColumns(client) {
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'lead_master'
     ORDER BY ordinal_position`
  );

  return new Set(result.rows.map((row) => row.column_name));
}

async function getExistingSignatures(client) {
  const result = await client.query(
    `SELECT company_name, business_scope, project_location, city, region,
            contact_person, email, owner, lead_by
     FROM lead_master`
  );

  return new Set(result.rows.map(buildLeadSignature));
}

async function insertRows(client, columns, rows) {
  if (rows.length === 0) {
    return 0;
  }

  const valueBlocks = [];
  const values = [];
  let parameterIndex = 1;

  for (const row of rows) {
    const placeholders = columns.map(() => `$${parameterIndex++}`);
    valueBlocks.push(`(${placeholders.join(', ')})`);

    for (const column of columns) {
      values.push(row[column] ?? null);
    }
  }

  await client.query(
    `INSERT INTO lead_master (${columns.join(', ')})
     VALUES ${valueBlocks.join(', ')}`,
    values
  );

  return rows.length;
}

async function main() {
  const fileArg = process.argv[2];
  const shouldExecute = process.argv.includes('--execute');

  if (!fileArg) {
    throw new Error('Usage: node scripts/import-lead-master-from-xlsx.js "<xlsx-path>" [--execute]');
  }

  const workbookPath = path.resolve(fileArg);
  const workbook = XLSX.readFile(workbookPath);
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error('The workbook does not contain any sheets.');
  }

  const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  try {
    const leadMasterColumns = await getLeadMasterColumns(client);
    const users = await client.query('SELECT id, name FROM users');
    const existingSignatures = await getExistingSignatures(client);

    const unresolvedLeadBy = new Set();
    const unresolvedOwners = new Set();
    const resolveUser = buildUserResolver(users.rows);

    const candidateRows = [];
    const seenSignatures = new Set();
    let skippedMissingCompany = 0;
    let skippedExistingDuplicates = 0;
    let skippedWorkbookDuplicates = 0;

    for (const sheetRow of sheetRows) {
      const mappedRow = mapSheetRow(sheetRow, resolveUser, unresolvedLeadBy, unresolvedOwners);
      if (!mappedRow) {
        skippedMissingCompany += 1;
        continue;
      }

      const signature = buildLeadSignature(mappedRow);
      if (!signature.replace(/\|/g, '')) {
        continue;
      }

      if (existingSignatures.has(signature)) {
        skippedExistingDuplicates += 1;
        continue;
      }

      if (seenSignatures.has(signature)) {
        skippedWorkbookDuplicates += 1;
        continue;
      }

      seenSignatures.add(signature);
      candidateRows.push(mappedRow);
    }

    const insertableColumns = [
      'company_name',
      'contact_person',
      'email',
      'mobile',
      'status',
      'priority',
      'project_location',
      'city',
      'region',
      'business_scope',
      'lead_received_date',
      'rfq_submission_date',
      'lead_by',
      'owner',
      'study_status',
      'commercial_status',
      'projected_value',
      'projected_month',
      'progress_status',
      'final_status'
    ].filter((column) => leadMasterColumns.has(column));

    let insertedCount = 0;

    if (shouldExecute && candidateRows.length > 0) {
      await client.query('BEGIN');
      insertedCount = await insertRows(client, insertableColumns, candidateRows);
      await client.query('COMMIT');
    }

    console.log(
      JSON.stringify(
        {
          file: workbookPath,
          sheet: sheetName,
          totalSheetRows: sheetRows.length,
          rowsPrepared: candidateRows.length,
          insertedCount,
          dryRun: !shouldExecute,
          skippedMissingCompany,
          skippedExistingDuplicates,
          skippedWorkbookDuplicates,
          unresolvedLeadByNames: Array.from(unresolvedLeadBy).sort(),
          unresolvedOwnerNames: Array.from(unresolvedOwners).sort()
        },
        null,
        2
      )
    );
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error && (error.stack || error.message) ? (error.stack || error.message) : error);
  process.exit(1);
});
