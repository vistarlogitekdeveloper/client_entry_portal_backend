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
