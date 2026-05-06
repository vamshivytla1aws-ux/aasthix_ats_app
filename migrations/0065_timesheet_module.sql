CREATE TABLE IF NOT EXISTS timesheet_headers (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  total_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'self',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT timesheet_headers_status_check CHECK (status IN ('draft', 'submitted')),
  CONSTRAINT timesheet_headers_source_check CHECK (source IN ('self', 'admin')),
  CONSTRAINT timesheet_headers_total_minutes_check CHECK (total_minutes >= 0),
  CONSTRAINT timesheet_headers_user_date_unique UNIQUE (user_id, entry_date)
);

CREATE INDEX IF NOT EXISTS timesheet_headers_entry_date_idx
ON timesheet_headers(entry_date DESC);

CREATE INDEX IF NOT EXISTS timesheet_headers_user_date_idx
ON timesheet_headers(user_id, entry_date DESC);

CREATE TABLE IF NOT EXISTS timesheet_entries (
  id BIGSERIAL PRIMARY KEY,
  header_id BIGINT NOT NULL REFERENCES timesheet_headers(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL,
  task_title TEXT NOT NULL,
  task_description TEXT,
  minutes_spent INTEGER NOT NULL,
  work_type TEXT,
  project_or_client TEXT,
  source TEXT NOT NULL DEFAULT 'self',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT timesheet_entries_minutes_spent_check CHECK (minutes_spent > 0 AND minutes_spent <= 1440),
  CONSTRAINT timesheet_entries_source_check CHECK (source IN ('self', 'admin'))
);

CREATE INDEX IF NOT EXISTS timesheet_entries_header_id_idx
ON timesheet_entries(header_id);

CREATE INDEX IF NOT EXISTS timesheet_entries_ticket_idx
ON timesheet_entries((lower(ticket_number)));
