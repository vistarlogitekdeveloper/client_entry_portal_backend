/**
 * Migration: creates the sales_plan table.
 * Run once with:  node src/config/migrateSalesPlan.js
 */
require('dotenv').config();
const pool = require('./db');

const MONTHS = [
  'apr', 'may', 'jun', 'jul', 'aug', 'sep',
  'oct', 'nov', 'dec', 'jan', 'feb', 'mar',
];

const monthCols = MONTHS.flatMap((m) => [
  `${m}_plan   NUMERIC(12,2) NOT NULL DEFAULT 0`,
  `${m}_actual NUMERIC(12,2) NOT NULL DEFAULT 0`,
]).join(',\n  ');

const sql = `
CREATE TABLE IF NOT EXISTS sales_plan (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fiscal_year VARCHAR(9) NOT NULL,          -- e.g. "2026-2027"
  ${monthCols},
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, fiscal_year)
);
`;

(async () => {
  try {
    await pool.query(sql);
    console.log('✅  sales_plan table ready.');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    await pool.end();
  }
})();
