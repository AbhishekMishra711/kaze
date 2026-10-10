import { db } from '../config/database.js';
import { ReservationService } from '../modules/reservations/reservationService.js';
import { runMigrations } from './migrate.js';
import { seedData } from './seed.js';

export async function runConcurrencyTest() {
  console.log('================================================================');
  console.log('🧪 HACKMATRIX 5.0 - CONCURRENCY & ZERO DOUBLE-BOOKING STRESS TEST');
  console.log('================================================================');

  // Seed baseline
  await seedData();

  // Find a hospital
  const hospRes = await db.query(`SELECT id, name FROM hospitals LIMIT 1`);
  const hospital = hospRes.rows[0];
  console.log(`Target Hospital: ${hospital.name} (${hospital.id})`);

  // Ensure exactly 2 FREE PEDIATRIC_ICU units exist
  await db.query(
    `DELETE FROM resource_units WHERE hospital_id = $1 AND category = 'PEDIATRIC_ICU'`,
    [hospital.id]
  );

  const u1 = await db.query(
    `INSERT INTO resource_units (hospital_id, category, unit_label, status) 
     VALUES ($1, 'PEDIATRIC_ICU', 'PED-ICU-01', 'FREE') RETURNING id`,
    [hospital.id]
  );
  const u2 = await db.query(
    `INSERT INTO resource_units (hospital_id, category, unit_label, status) 
     VALUES ($1, 'PEDIATRIC_ICU', 'PED-ICU-02', 'FREE') RETURNING id`,
    [hospital.id]
  );
  console.log(`Initialized exactly 2 PEDIATRIC_ICU units: ${u1.rows[0].id}, ${u2.rows[0].id}`);

  // Create 50 distinct incident records
  const NUM_REQUESTS = 50;
  console.log(`Creating ${NUM_REQUESTS} concurrent emergency incident callers...`);

  const incidentIds: string[] = [];
  for (let i = 1; i <= NUM_REQUESTS; i++) {
    const incRes = await db.query(
      `INSERT INTO incidents (idempotency_key, latitude, longitude, description_raw, triage_level, status)
       VALUES ($1, 18.62, 73.81, 'Concurrent emergency caller test', 'RESUSCITATION', 'ALLOCATING')
       RETURNING id`,
      [`concurrency-key-${Date.now()}-${i}`]
    );
    incidentIds.push(incRes.rows[0].id);
  }

  console.log(`Firing ${NUM_REQUESTS} simultaneous reservation requests in parallel...`);
  const startTime = Date.now();

  const promises = incidentIds.map((incId) =>
    ReservationService.holdUnitsAtomically(incId, hospital.id, [
      { category: 'PEDIATRIC_ICU', quantity: 1 }
    ])
  );

  const results = await Promise.allSettled(promises);
  const duration = Date.now() - startTime;

  let successCount = 0;
  let rejectedCount = 0;
  let errorCount = 0;
  let sampleError: any = null;

  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value.success) {
        successCount++;
      } else {
        rejectedCount++;
      }
    } else {
      errorCount++;
      if (!sampleError) sampleError = r.reason;
    }
  }

  if (sampleError) {
    console.error('Sample Promise Rejection:', sampleError);
  }

  // Database Verification
  const dbCheck = await db.query(
    `SELECT COUNT(*) as active_reservations 
     FROM reservations r
     JOIN resource_units u ON r.unit_id = u.id
     WHERE u.hospital_id = $1 
       AND u.category = 'PEDIATRIC_ICU' 
       AND r.status IN ('HELD', 'CONFIRMED', 'ARRIVED')`,
    [hospital.id]
  );
  const activeCountInDb = parseInt(dbCheck.rows[0].active_reservations, 10);

  console.log('----------------------------------------------------------------');
  console.log(`Execution Duration : ${duration} ms`);
  console.log(`Total Requests     : ${NUM_REQUESTS}`);
  console.log(`Successful Holds   : ${successCount} (Expected: 2)`);
  console.log(`Clean Rejections   : ${rejectedCount} (Expected: 48)`);
  console.log(`Exceptions/Crashes : ${errorCount} (Expected: 0)`);
  console.log(`DB Active Holds    : ${activeCountInDb} (Expected: 2)`);
  console.log('----------------------------------------------------------------');

  const passed = successCount === 2 && rejectedCount === 48 && activeCountInDb === 2 && errorCount === 0;

  if (passed) {
    console.log('✅ TEST PASSED: Mathematical Zero Double-Booking Verified under 50-Thread Load!');
  } else {
    console.error('❌ TEST FAILED: Concurrency violation or unexpected reservation count!');
    process.exit(1);
  }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  runConcurrencyTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[TEST_ERROR]', err);
      process.exit(1);
    });
}
