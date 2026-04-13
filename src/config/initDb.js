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
        role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'BD', 'HEAD OFFICE')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        fcm_token TEXT
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;

      -- Update role constraint for existing table
      DO $$ 
      BEGIN 
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'users_role_check') THEN
          ALTER TABLE users DROP CONSTRAINT users_role_check;
        END IF;
        ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'MANAGER', 'BD', 'HEAD OFFICE'));
      EXCEPTION
        WHEN others THEN
          -- Fallback if the constraint name is different or other issues
          RAISE NOTICE 'Could not update users_role_check constraint: %', SQLERRM;
      END $$;


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
        lead_rfq_enquiry_date DATE,
        status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
        approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
        approved_at TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE customer_master ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

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

      -- ============================================================
      -- HEAD OFFICE MODULE TABLES
      -- ============================================================

      -- HO Customers
      CREATE TABLE IF NOT EXISTS ho_customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(255),
        email VARCHAR(255),
        mobile VARCHAR(50),
        department VARCHAR(100),
        status VARCHAR(50) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- HO Agreements
      CREATE TABLE IF NOT EXISTS ho_agreements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agreement_name VARCHAR(255) NOT NULL,
        customer_id UUID REFERENCES ho_customers(id) ON DELETE SET NULL,
        vendor_name VARCHAR(255),
        agreement_type VARCHAR(255),
        start_date DATE,
        expiry_date DATE NOT NULL,
        renewal_frequency VARCHAR(100), -- Monthly, Quarterly, Half Yearly, Yearly, Custom
        responsible_person VARCHAR(255),
        department VARCHAR(100),
        location_project VARCHAR(255),
        status VARCHAR(50) DEFAULT 'Active',
        remarks TEXT,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Migration: Add new columns if they don't exist
      ALTER TABLE ho_agreements ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(255);
      ALTER TABLE ho_agreements ADD COLUMN IF NOT EXISTS agreement_type VARCHAR(255);
      ALTER TABLE ho_agreements ADD COLUMN IF NOT EXISTS start_date DATE;
      ALTER TABLE ho_agreements ADD COLUMN IF NOT EXISTS renewal_frequency VARCHAR(100);
      ALTER TABLE ho_agreements ADD COLUMN IF NOT EXISTS responsible_person VARCHAR(255);
      ALTER TABLE ho_agreements ADD COLUMN IF NOT EXISTS location_project VARCHAR(255);
      ALTER TABLE ho_agreements ADD COLUMN IF NOT EXISTS remarks TEXT;

      -- Update status constraint: Drop old and add new
      ALTER TABLE ho_agreements DROP CONSTRAINT IF EXISTS ho_agreements_status_check;
      ALTER TABLE ho_agreements ADD CONSTRAINT ho_agreements_status_check 
        CHECK (status IN ('Active', 'Expired', 'Renewed', 'Pending'));

      -- HO Agreement Files
      CREATE TABLE IF NOT EXISTS ho_agreement_files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agreement_id UUID NOT NULL REFERENCES ho_agreements(id) ON DELETE CASCADE,
        file_path TEXT,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(50),
        file_data BYTEA,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Migrate existing table if needed
      ALTER TABLE ho_agreement_files ADD COLUMN IF NOT EXISTS file_data BYTEA;
      ALTER TABLE ho_agreement_files ALTER COLUMN file_path DROP NOT NULL;

      -- HO Cost Sheets
      CREATE TABLE IF NOT EXISTS ho_cost_sheets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sheet_name VARCHAR(255) NOT NULL,
        customer_id UUID REFERENCES ho_customers(id) ON DELETE SET NULL,
        project_name VARCHAR(255),
        effective_date DATE,
        expiry_date DATE NOT NULL,
        wage_revision_applicable VARCHAR(50), -- Yes, No
        min_wage_revision_date DATE,
        billing_rate_revision_date DATE,
        approval_status VARCHAR(100),
        responsible_person VARCHAR(255),
        status VARCHAR(50) DEFAULT 'Active',
        remarks TEXT,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Migration: Add new columns if they don't exist
      ALTER TABLE ho_cost_sheets ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES ho_customers(id) ON DELETE SET NULL;
      ALTER TABLE ho_cost_sheets ADD COLUMN IF NOT EXISTS project_name VARCHAR(255);
      ALTER TABLE ho_cost_sheets ADD COLUMN IF NOT EXISTS effective_date DATE;
      ALTER TABLE ho_cost_sheets ADD COLUMN IF NOT EXISTS wage_revision_applicable VARCHAR(50);
      ALTER TABLE ho_cost_sheets ADD COLUMN IF NOT EXISTS min_wage_revision_date DATE;
      ALTER TABLE ho_cost_sheets ADD COLUMN IF NOT EXISTS billing_rate_revision_date DATE;
      ALTER TABLE ho_cost_sheets ADD COLUMN IF NOT EXISTS approval_status VARCHAR(100);
      ALTER TABLE ho_cost_sheets ADD COLUMN IF NOT EXISTS responsible_person VARCHAR(255);
      ALTER TABLE ho_cost_sheets ADD COLUMN IF NOT EXISTS remarks TEXT;

      -- Update status constraint: Drop old and add new
      ALTER TABLE ho_cost_sheets DROP CONSTRAINT IF EXISTS ho_cost_sheets_status_check;
      ALTER TABLE ho_cost_sheets ADD CONSTRAINT ho_cost_sheets_status_check 
        CHECK (status IN ('Active', 'Expired', 'Renewed', 'Pending'));

      -- HO Cost Sheet Files
      CREATE TABLE IF NOT EXISTS ho_cost_sheet_files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cost_sheet_id UUID NOT NULL REFERENCES ho_cost_sheets(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(50),
        file_data BYTEA,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- HO Notifications (Logs & Retries)
      CREATE TABLE IF NOT EXISTS ho_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agreement_id UUID REFERENCES ho_agreements(id) ON DELETE CASCADE,
        cost_sheet_id UUID REFERENCES ho_cost_sheets(id) ON DELETE CASCADE,
        notified_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'SENT' CHECK (status IN ('SENT', 'FAILED', 'PENDING_RETRY')),
        retry_count INTEGER DEFAULT 0,
        next_retry_at TIMESTAMP,
        scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP
      );
    `);

    console.log('✅ Database tables initialized');
  } catch (err) {
    console.error('❌ Failed to initialize database tables:', err.message);
  } finally {
    if (client) client.release();
  }
};

module.exports = initDb;
