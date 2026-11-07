-- RTU HR System Schema
-- Database: PostgreSQL

-- Idempotent Enum Creation
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('employee', 'hr_staff', 'admin');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leave_status') THEN
        CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_status') THEN
        CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'half-day', 'leave', 'incomplete');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pay_rule_type') THEN
        CREATE TYPE pay_rule_type AS ENUM ('overtime', 'holiday', 'night_diff', 'custom');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'pay_rule_type' AND e.enumlabel = 'regular'
    ) THEN
        ALTER TYPE pay_rule_type ADD VALUE 'regular';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'pay_rule_type' AND e.enumlabel = 'rest_day'
    ) THEN
        ALTER TYPE pay_rule_type ADD VALUE 'rest_day';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'employee',
    is_system_admin BOOLEAN NOT NULL DEFAULT FALSE,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_system_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS users_single_system_admin
    ON users (is_system_admin) WHERE is_system_admin = TRUE;

UPDATE users
   SET is_system_admin = TRUE
 WHERE id = (
       SELECT id FROM users
        WHERE role = 'admin'
        ORDER BY created_at ASC, id ASC
        LIMIT 1
   )
   AND NOT EXISTS (SELECT 1 FROM users WHERE is_system_admin = TRUE);

CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    code VARCHAR(50) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    first_name VARCHAR(255) DEFAULT '',
    last_name VARCHAR(255) DEFAULT '',
    dob DATE,
    phone VARCHAR(50) DEFAULT '',
    address TEXT DEFAULT '',
    designation VARCHAR(255) DEFAULT '',
    joining_date DATE,
    employment_type VARCHAR(50) DEFAULT 'full-time',
    salary_basic DECIMAL(12,2) DEFAULT 0,
    salary_hra DECIMAL(12,2) DEFAULT 0,
    salary_allowances DECIMAL(12,2) DEFAULT 0,
    salary_deductions DECIMAL(12,2) DEFAULT 0,
    profile_picture_url TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    submitter_name VARCHAR(511) NOT NULL,
    submitter_email VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL
        CHECK (category IN ('Bug Report', 'Feature Request', 'UI / Usability', 'Other')),
    message TEXT NOT NULL
        CHECK (length(trim(message)) BETWEEN 1 AND 2000),
    status VARCHAR(20) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'in_review', 'resolved')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS feedback_user_idx ON feedback (user_id);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_category_status_idx ON feedback (category, status);
CREATE INDEX IF NOT EXISTS feedback_status_created_idx ON feedback (status, created_at DESC);

CREATE TABLE IF NOT EXISTS profile_documents (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name VARCHAR(255) NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS profile_documents_user_idx ON profile_documents (user_id);

CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    check_in TIMESTAMP WITH TIME ZONE,
    check_out TIMESTAMP WITH TIME ZONE,
    status attendance_status NOT NULL,
    work_hours DECIMAL(5,2) DEFAULT 0,
    voided_at TIMESTAMP WITH TIME ZONE,
    voided_by INTEGER REFERENCES users(id),
    void_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
);

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS voided_by INTEGER REFERENCES users(id);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE TABLE IF NOT EXISTS attendance_audit (
    id BIGSERIAL PRIMARY KEY,
    attendance_id INTEGER NOT NULL,
    employee_id INTEGER NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('correction', 'import', 'void', 'leave_approval')),
    previous_values JSONB,
    updated_values JSONB NOT NULL,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE attendance_audit DROP CONSTRAINT IF EXISTS attendance_audit_action_check;
ALTER TABLE attendance_audit
    ADD CONSTRAINT attendance_audit_action_check
    CHECK (action IN ('correction', 'import', 'void', 'leave_approval'));

CREATE INDEX IF NOT EXISTS attendance_audit_attendance_idx
    ON attendance_audit (attendance_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS attendance_notes (
    id BIGSERIAL PRIMARY KEY,
    attendance_id INTEGER NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note TEXT NOT NULL CHECK (length(trim(note)) BETWEEN 1 AND 1000),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS attendance_notes_attendance_idx
    ON attendance_notes (attendance_id, created_at);

CREATE TABLE IF NOT EXISTS leave_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    approver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    leave_type VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status leave_status NOT NULL DEFAULT 'pending',
    decision_remarks TEXT,
    decision_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pay_rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type pay_rule_type NOT NULL,
    multiplier DECIMAL(5,2) DEFAULT 1.0,
    threshold_hours DECIMAL(5,2) DEFAULT 0,
    effective_date DATE DEFAULT CURRENT_DATE,
    expiry_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50),
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- One row per attendance day and active (or historical) pay rate. Keeping this
-- in a child table lets admins add new pay rates without any schema change.
CREATE TABLE IF NOT EXISTS attendance_pay_hours (
    attendance_id INTEGER NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
    pay_rule_id INTEGER NOT NULL REFERENCES pay_rules(id) ON DELETE CASCADE,
    hours DECIMAL(6,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (attendance_id, pay_rule_id)
);
