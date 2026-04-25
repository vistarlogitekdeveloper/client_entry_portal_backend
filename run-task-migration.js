/**
 * Migration runner: creates the tasks table.
 * Run with: node run-task-migration.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const migration = `
  CREATE TABLE IF NOT EXISTS tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'PENDING'
      CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
    priority VARCHAR(10) DEFAULT 'MEDIUM'
      CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
    due_date DATE,
    assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
`;

(async () => {
  const client = await pool.connect();
  try {
    console.log('Running migration: create tasks table...');
    await client.query(migration);
    console.log('✅ Tasks table created successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
