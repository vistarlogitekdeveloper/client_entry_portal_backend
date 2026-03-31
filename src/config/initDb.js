const pool = require('./db');

const initDb = async () => {
  let client;
  try {
    client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'BD')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS lead_master (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(255),
        email VARCHAR(255),
        mobile VARCHAR(50),
        status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
        priority VARCHAR(50) CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
        project_location VARCHAR(255),
        city VARCHAR(100),
        region VARCHAR(100),
        business_scope TEXT,
        lead_received_date DATE,
        rfq_submission_date DATE,
        lead_by UUID REFERENCES users(id) ON DELETE SET NULL,
        owner UUID REFERENCES users(id) ON DELETE SET NULL,
        study_status VARCHAR(100),
        commercial_status VARCHAR(100) DEFAULT 'NOT_STARTED',
        projected_value NUMERIC(15, 2),
        projected_month DATE,
        progress_status VARCHAR(100) CHECK (progress_status IN ('PLANNING', 'EXECUTION', 'HOLD', 'COMPLETED')),
        final_status VARCHAR(50) CHECK (final_status IN ('WON', 'LOST', 'PENDING')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS lead_reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID NOT NULL REFERENCES lead_master(id) ON DELETE CASCADE,
        week_start_date DATE NOT NULL,
        review_status VARCHAR(50) NOT NULL CHECK (review_status IN ('UPDATED', 'SKIPPED')),
        remarks TEXT,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (lead_id, week_start_date)
      );

      CREATE TABLE IF NOT EXISTS lead_review_reminders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        week_start_date DATE NOT NULL,
        reminder_day VARCHAR(20) DEFAULT 'FRIDAY',
        lead_id UUID NOT NULL REFERENCES lead_master(id) ON DELETE CASCADE,
        notified_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'UPDATED', 'SKIPPED')),
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (week_start_date, lead_id, notified_user_id, reminder_day)
      );

      -- ============================================================
      -- CUSTOMER MASTER
      -- Stores customer/company + contact person details
      -- ============================================================
      CREATE TABLE IF NOT EXISTS customer_master (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_name VARCHAR(255) NOT NULL,
        person_name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        mobile VARCHAR(50),
        status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
        approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
        approved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- ============================================================
      -- LEAD FIELD AUDIT (field-level change tracking)
      -- Each PUT /api/leads/:id creates one "event" row and one row
      -- per changed field so UI can show who changed what and when.
      -- ============================================================
      CREATE TABLE IF NOT EXISTS lead_change_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID NOT NULL REFERENCES lead_master(id) ON DELETE CASCADE,
        changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS lead_change_event_fields (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id UUID NOT NULL REFERENCES lead_change_events(id) ON DELETE CASCADE,
        field_name VARCHAR(255) NOT NULL,
        old_value TEXT,
        new_value TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_lead_change_events_lead_id_changed_at
        ON lead_change_events (lead_id, changed_at DESC);

      CREATE INDEX IF NOT EXISTS idx_lead_change_event_fields_event_id
        ON lead_change_event_fields (event_id);
    `);

    console.log('✅ Database tables initialized');
  } catch (err) {
    console.error('❌ Failed to initialize database tables:', err.message);
  } finally {
    if (client) client.release();
  }
};

module.exports = initDb;
