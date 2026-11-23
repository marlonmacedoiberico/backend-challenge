CREATE TABLE clinics (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  timezone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE patients (
  id UUID PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  phone TEXT,
  accepts_reminders BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, clinic_id)
);

CREATE TABLE appointments (
  id UUID PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id),
  patient_id UUID NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'confirmed', 'cancelled')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (patient_id, clinic_id) REFERENCES patients(id, clinic_id)
);

CREATE TABLE reminders (
  id UUID PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  appointment_version INTEGER NOT NULL CHECK (appointment_version >= 1),
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'retry', 'sent', 'failed', 'skipped', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  sent_at TIMESTAMPTZ,
  skip_reason TEXT CHECK (skip_reason IN ('too_late', 'no_phone', 'opted_out') OR skip_reason IS NULL),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, appointment_version)
);

CREATE INDEX reminders_due_idx ON reminders (scheduled_for)
  WHERE status IN ('pending', 'retry');

CREATE TABLE inbound_messages (
  message_id TEXT PRIMARY KEY,
  sender_phone TEXT NOT NULL,
  text TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
