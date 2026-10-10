import { db } from '../config/database.js';

export async function runMigrations() {
  console.log('[MIGRATION] Starting schema migration...');

  const migrationQueries = [
    // 1. Users Table
    `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) NOT NULL UNIQUE,
      role VARCHAR(30) NOT NULL DEFAULT 'CITIZEN',
      hospital_id UUID NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // 2. Hospitals Table
    `CREATE TABLE IF NOT EXISTS hospitals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(150) NOT NULL,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      last_reported_at TIMESTAMPTZ DEFAULT NOW(),
      contact_phone VARCHAR(20),
      admin_id VARCHAR(100) UNIQUE,
      password VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    `ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS admin_id VARCHAR(100) UNIQUE;`,
    `ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS password VARCHAR(100);`,

    // 3. Discrete Resource Units Table
    `CREATE TABLE IF NOT EXISTS resource_units (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
      category VARCHAR(50) NOT NULL,
      unit_label VARCHAR(50) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'FREE',
      is_movable BOOLEAN DEFAULT FALSE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    `CREATE INDEX IF NOT EXISTS idx_resource_search ON resource_units(hospital_id, category, status);`,

    // 4. Incidents Table
    `CREATE TABLE IF NOT EXISTS incidents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      caller_id UUID REFERENCES users(id),
      idempotency_key VARCHAR(64) UNIQUE NOT NULL,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      address_text TEXT,
      description_raw TEXT,
      audio_url TEXT,
      triage_level VARCHAR(30) DEFAULT 'EMERGENT',
      status VARCHAR(30) DEFAULT 'REPORTED',
      unserved_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // 5. Incident Requirements Table
    `CREATE TABLE IF NOT EXISTS incident_requirements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      category VARCHAR(50) NOT NULL,
      quantity_needed INT DEFAULT 1,
      justification TEXT,
      is_mandatory BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // 6. Ambulances Table
    `CREATE TABLE IF NOT EXISTS ambulances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      vehicle_number VARCHAR(30) UNIQUE NOT NULL,
      driver_id UUID REFERENCES users(id),
      driver_name VARCHAR(100) DEFAULT 'Rajesh Kumar (Driver)',
      driver_phone VARCHAR(30) DEFAULT '+91 9800000004',
      current_lat DOUBLE PRECISION NOT NULL,
      current_lng DOUBLE PRECISION NOT NULL,
      status VARCHAR(30) DEFAULT 'AVAILABLE',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    `ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS driver_name VARCHAR(100) DEFAULT 'Rajesh Kumar (Driver)';`,
    `ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(30) DEFAULT '+91 9800000004';`,

    // 7. Reservations Table
    `CREATE TABLE IF NOT EXISTS reservations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      unit_id UUID NOT NULL REFERENCES resource_units(id) ON DELETE RESTRICT,
      hospital_id UUID NOT NULL REFERENCES hospitals(id),
      ambulance_id UUID REFERENCES ambulances(id),
      status VARCHAR(30) NOT NULL DEFAULT 'HELD',
      hold_expires_at TIMESTAMPTZ NOT NULL,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // 8. THE CRITICAL ATOMICITY CONSTRAINT
    `CREATE UNIQUE INDEX IF NOT EXISTS one_active_reservation_per_unit 
     ON reservations(unit_id) 
     WHERE status IN ('HELD', 'CONFIRMED', 'ARRIVED');`,

    // 9. Audit Event Log
    `CREATE TABLE IF NOT EXISTS audit_event_logs (
      id BIGSERIAL PRIMARY KEY,
      incident_id UUID,
      event_type VARCHAR(50) NOT NULL,
      payload JSONB NOT NULL,
      occurred_at TIMESTAMPTZ DEFAULT NOW()
    );`
  ];

  for (const query of migrationQueries) {
    await db.query(query);
  }

  console.log('[MIGRATION] All tables and indexes migrated successfully!');
}

// Direct execution support
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[MIGRATION_ERROR]', err);
      process.exit(1);
    });
}
