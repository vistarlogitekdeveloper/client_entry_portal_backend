const pool = require('./db');

const initDb = async () => {
  let client;
  try {
    client = await pool.connect();

    const execute = async (sql, description) => {
      try {
        await client.query(sql);
        // console.log(`✅ ${description} executed successfully`);
      } catch (err) {
        console.error(`❌ Failed: ${description}:`, err.message);
      }
    };

    // Core Tables
    await execute(`
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
    `, 'Users table');

    await execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;`, 'fcm_token column');

    // Update role constraint
    await execute(`
      DO $$ 
      BEGIN 
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'users_role_check') THEN
          ALTER TABLE users DROP CONSTRAINT users_role_check;
        END IF;
        ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'MANAGER', 'BD', 'HEAD OFFICE'));
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `, 'Role constraint update');

    // Lead Management Tables (Existing)
    await execute(`
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
        country VARCHAR(100),
        business_scope TEXT,
        lead_received_date DATE,
        rfq_submission_date DATE,
        lead_by UUID REFERENCES users(id) ON DELETE SET NULL,
        owner UUID REFERENCES users(id) ON DELETE SET NULL,
        study_status VARCHAR(100),
        commercial_status VARCHAR(100) DEFAULT 'NOT_STARTED',
        projected_value NUMERIC(15, 2),
        projected_month DATE,
        progress_status VARCHAR(100) CHECK (progress_status IN ('ENQUIRY - INITIAL STATUS', 'PLANNING', 'EXECUTION', 'EXECUTION - UNDERIMPLEMENTATION', 'HOLD', 'COMPLETED')),
        final_status VARCHAR(50) CHECK (final_status IN ('WON', 'LOST', 'UNDER NEGOTIATION')),
        commercial_status_reason TEXT,
        final_status_reason TEXT,
        progress_status_reason TEXT,
        study_status_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'Lead master table');

    await execute(`ALTER TABLE lead_master ADD COLUMN IF NOT EXISTS commercial_status_reason TEXT;`, 'commercial_status_reason column');
    await execute(`ALTER TABLE lead_master ADD COLUMN IF NOT EXISTS final_status_reason TEXT;`, 'final_status_reason column');
    await execute(`ALTER TABLE lead_master ADD COLUMN IF NOT EXISTS progress_status_reason TEXT;`, 'progress_status_reason column');
    await execute(`ALTER TABLE lead_master ADD COLUMN IF NOT EXISTS study_status_reason TEXT;`, 'study_status_reason column');
    await execute(`ALTER TABLE lead_master ADD COLUMN IF NOT EXISTS country VARCHAR(100);`, 'country column');
    await execute(`ALTER TABLE lead_master ADD COLUMN IF NOT EXISTS reminder_snooze_until DATE NULL;`, 'reminder_snooze_until column');
    await execute(`
      UPDATE lead_master
      SET final_status = 'UNDER NEGOTIATION'
      WHERE final_status IN ('ONGOING', 'PENDING');
    `, 'final_status value normalization');
    await execute(`
      DO $$
      BEGIN
        ALTER TABLE lead_master DROP CONSTRAINT IF EXISTS lead_master_progress_status_check;
        ALTER TABLE lead_master ADD CONSTRAINT lead_master_progress_status_check
        CHECK (progress_status IN ('ENQUIRY - INITIAL STATUS', 'PLANNING', 'EXECUTION', 'EXECUTION - UNDERIMPLEMENTATION', 'HOLD', 'COMPLETED'));
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `, 'progress_status constraint update');
    await execute(`
      DO $$
      BEGIN
        ALTER TABLE lead_master DROP CONSTRAINT IF EXISTS lead_master_final_status_check;
        ALTER TABLE lead_master ADD CONSTRAINT lead_master_final_status_check
        CHECK (final_status IN ('WON', 'LOST', 'UNDER NEGOTIATION'));
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `, 'final_status constraint update');

    // Weekly lead reviews + reminders
    await execute(`
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
    `, 'Lead reviews table');

    await execute(`
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
    `, 'Lead review reminders table');

    await execute(`
      CREATE TABLE IF NOT EXISTS lead_planning (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID NOT NULL REFERENCES lead_master(id) ON DELETE CASCADE,
        week_start_date DATE NOT NULL,
        plan_content TEXT NOT NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (lead_id, week_start_date)
      );
    `, 'Lead planning table');

    // Lead field-level audit trail
    await execute(`
      CREATE TABLE IF NOT EXISTS lead_change_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID NOT NULL REFERENCES lead_master(id) ON DELETE CASCADE,
        changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'Lead change events table');

    await execute(`
      CREATE TABLE IF NOT EXISTS lead_change_event_fields (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id UUID NOT NULL REFERENCES lead_change_events(id) ON DELETE CASCADE,
        field_name VARCHAR(255) NOT NULL,
        old_value TEXT,
        new_value TEXT
      );
    `, 'Lead change event fields table');

    await execute(`
      CREATE INDEX IF NOT EXISTS idx_lead_change_events_lead_id_changed_at
      ON lead_change_events (lead_id, changed_at DESC);
    `, 'Lead change events index');

    await execute(`
      CREATE INDEX IF NOT EXISTS idx_lead_change_event_fields_event_id
      ON lead_change_event_fields (event_id);
    `, 'Lead change event fields index');

    // Tasks module
    await execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
        priority VARCHAR(10) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
        due_date DATE,
        assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'Tasks table');

    await execute(`CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);`, 'Tasks assigned_to index');
    await execute(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);`, 'Tasks status index');

    await execute(`
      CREATE TABLE IF NOT EXISTS customer_master (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_name VARCHAR(255) NOT NULL,
        person_name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        mobile VARCHAR(50),
        status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'Customer master table');

    // HEAD OFFICE MODULE - ISOLATED TABLES
    await execute(`
      CREATE TABLE IF NOT EXISTS ho_customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_name VARCHAR(255) NOT NULL,
        department VARCHAR(100),
        status VARCHAR(50) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'HO Customers table');

    await execute(`
      CREATE TABLE IF NOT EXISTS ho_agreements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agreement_name VARCHAR(255) NOT NULL,
        customer_id UUID REFERENCES ho_customers(id) ON DELETE SET NULL,
        expiry_date DATE NOT NULL,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'HO Agreements base table');

    // Migration for expanded Agreement fields
    const agreementCols = [
      'vendor_name VARCHAR(255)',
      'agreement_type VARCHAR(255)',
      'start_date DATE',
      'renewal_frequency VARCHAR(100)',
      'responsible_person VARCHAR(255)',
      'location_project VARCHAR(255)',
      'remarks TEXT',
      'department VARCHAR(100)',
      'created_by UUID REFERENCES users(id) ON DELETE SET NULL',
      // Excel report fields
      'project_current_cost NUMERIC(15,2)',
      'rent NUMERIC(15,2)',
      'wh_area_sq_ft NUMERIC(10,2)',
      'lock_in_period VARCHAR(100)',
      'notice_period VARCHAR(100)',
      'agreement_period VARCHAR(100)'
    ];
    for (const col of agreementCols) {
      await execute(`ALTER TABLE ho_agreements ADD COLUMN IF NOT EXISTS ${col};`, `Agreement ${col.split(' ')[0]} column`);
    }

    await execute(`
      DO $$ BEGIN 
        ALTER TABLE ho_agreements DROP CONSTRAINT IF EXISTS ho_agreements_status_check;
        ALTER TABLE ho_agreements ADD CONSTRAINT ho_agreements_status_check CHECK (status IN ('ACTIVE', 'EXPIRED', 'RENEWED', 'PENDING'));
      EXCEPTION WHEN others THEN NULL; END $$;
    `, 'Agreement status constraint');

    // HO Cost Sheets
    await execute(`
      CREATE TABLE IF NOT EXISTS ho_cost_sheets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sheet_name VARCHAR(255) NOT NULL,
        expiry_date DATE NOT NULL,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'HO Cost sheets base table');

    const costSheetCols = [
      'customer_id UUID REFERENCES ho_customers(id) ON DELETE SET NULL',
      'project_name VARCHAR(255)',
      'effective_date DATE',
      'wage_revision_applicable VARCHAR(50)',
      'min_wage_revision_date DATE',
      'billing_rate_revision_date DATE',
      'approval_status VARCHAR(100)',
      'responsible_person VARCHAR(255)',
      'remarks TEXT',
      'created_by UUID REFERENCES users(id) ON DELETE SET NULL'
    ];
    for (const col of costSheetCols) {
      await execute(`ALTER TABLE ho_cost_sheets ADD COLUMN IF NOT EXISTS ${col};`, `CostSheet ${col.split(' ')[0]} column`);
    }

    await execute(`
      DO $$ BEGIN 
        ALTER TABLE ho_cost_sheets DROP CONSTRAINT IF EXISTS ho_cost_sheets_status_check;
        ALTER TABLE ho_cost_sheets ADD CONSTRAINT ho_cost_sheets_status_check CHECK (status IN ('ACTIVE', 'EXPIRED', 'RENEWED', 'PENDING'));
      EXCEPTION WHEN others THEN NULL; END $$;
    `, 'Cost sheet status constraint');

    // HO Certifications
    await execute(`
      CREATE TABLE IF NOT EXISTS ho_certifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        certification_name VARCHAR(255) NOT NULL,
        expiry_date DATE NOT NULL,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'HO Certifications base table');

    const certificationCols = [
      'customer_id UUID REFERENCES ho_customers(id) ON DELETE SET NULL',
      'certification_type VARCHAR(255)',
      'issuing_authority VARCHAR(255)',
      'location_project VARCHAR(255)',
      'responsible_person VARCHAR(255)',
      'issue_date DATE',
      'remarks TEXT',
      'created_by UUID REFERENCES users(id) ON DELETE SET NULL'
    ];
    for (const col of certificationCols) {
      await execute(`ALTER TABLE ho_certifications ADD COLUMN IF NOT EXISTS ${col};`, `Certification ${col.split(' ')[0]} column`);
    }

    await execute(`
      DO $$ BEGIN 
        ALTER TABLE ho_certifications DROP CONSTRAINT IF EXISTS ho_certifications_status_check;
        ALTER TABLE ho_certifications ADD CONSTRAINT ho_certifications_status_check CHECK (status IN ('ACTIVE', 'EXPIRED', 'RENEWED', 'PENDING'));
      EXCEPTION WHEN others THEN NULL; END $$;
    `, 'Certification status constraint');

    // Files Tables
    await execute(`
      CREATE TABLE IF NOT EXISTS ho_agreement_files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agreement_id UUID NOT NULL REFERENCES ho_agreements(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(50),
        file_data BYTEA,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'HO Agreement files');

    await execute(`
      CREATE TABLE IF NOT EXISTS ho_cost_sheet_files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cost_sheet_id UUID NOT NULL REFERENCES ho_cost_sheets(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(50),
        file_data BYTEA,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'HO Cost sheet files');

    await execute(`
      CREATE TABLE IF NOT EXISTS ho_certification_files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        certification_id UUID NOT NULL REFERENCES ho_certifications(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(50),
        file_data BYTEA,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'HO Certification files');

    // Notifications
    await execute(`
      CREATE TABLE IF NOT EXISTS ho_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agreement_id UUID REFERENCES ho_agreements(id) ON DELETE CASCADE,
        cost_sheet_id UUID REFERENCES ho_cost_sheets(id) ON DELETE CASCADE,
        certification_id UUID REFERENCES ho_certifications(id) ON DELETE CASCADE,
        notified_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'SENT' CHECK (status IN ('SENT', 'FAILED', 'PENDING_RETRY')),
        sent_at TIMESTAMP
      );
    `, 'HO Notifications');

    console.log('✅ Database initialization/migration complete');
  } catch (err) {
    console.error('❌ Database init critical error:', err.message);
  } finally {
    if (client) client.release();
  }
};

module.exports = initDb;
