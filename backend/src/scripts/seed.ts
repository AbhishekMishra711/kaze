import { db } from '../config/database.js';
import { runMigrations } from './migrate.js';

export async function seedData() {
  await runMigrations();
  console.log('[SEED] Seeding Pune Emergency Network Data...');

  // 1. Clear existing seed records (clean slate)
  await db.query('DELETE FROM reservations;');
  await db.query('DELETE FROM incident_requirements;');
  await db.query('DELETE FROM incidents;');
  await db.query('DELETE FROM resource_units;');
  await db.query('DELETE FROM ambulances;');
  await db.query('DELETE FROM hospitals;');
  await db.query('DELETE FROM users;');

  // 2. Seed Users
  const users = [
    { name: 'PCMC Central Dispatcher', phone: '9800000001', role: 'DISPATCHER' },
    { name: 'Dr. Ramesh Kulkarni (Aditya Birla)', phone: '9800000002', role: 'HOSPITAL_STAFF' },
    { name: 'Dr. Priya Deshmukh (DY Patil)', phone: '9800000003', role: 'HOSPITAL_STAFF' },
    { name: 'Ambulance 108 Driver Rajesh', phone: '9800000004', role: 'DRIVER' },
    { name: 'Pooja Sharma (Citizen)', phone: '9800000005', role: 'CITIZEN' }
  ];

  for (const u of users) {
    await db.query(
      `INSERT INTO users (full_name, phone, role) VALUES ($1, $2, $3)`,
      [u.name, u.phone, u.role]
    );
  }

  // 3. Seed Pune Hospitals
  const hospitalsData = [
    {
      name: 'Aditya Birla Memorial Hospital (Thergaon)',
      adminId: 'aditya_birla@admin',
      password: 'password123',
      lat: 18.6186,
      lng: 73.7744,
      phone: '020-30717500',
      isStale: false // reported 2 mins ago
    },
    {
      name: 'Dr. D.Y. Patil Medical College Hospital (Pimpri)',
      adminId: 'dy_patil@admin',
      password: 'password123',
      lat: 18.6253,
      lng: 73.8166,
      phone: '020-27805100',
      isStale: false
    },
    {
      name: 'YCM Hospital (Pimpri Chinchwad)',
      adminId: 'ycm@admin',
      password: 'password123',
      lat: 18.6282,
      lng: 73.8198,
      phone: '020-27420101',
      isStale: false
    },
    {
      name: 'Manipal Hospital (Baner)',
      adminId: 'manipal@admin',
      password: 'password123',
      lat: 18.5635,
      lng: 73.7788,
      phone: '020-68138888',
      isStale: false
    },
    {
      name: 'Ruby Hall Clinic (Pune Station)',
      adminId: 'ruby_hall@admin',
      password: 'password123',
      lat: 18.5326,
      lng: 73.8798,
      phone: '020-66455100',
      isStale: false
    },
    {
      name: 'Sassoon General Hospital (Govt Tertiary)',
      adminId: 'sassoon@admin',
      password: 'password123',
      lat: 18.5262,
      lng: 73.8741,
      phone: '020-26128000',
      isStale: true // Stale data simulation: last reported 45 minutes ago!
    }
  ];

  for (const h of hospitalsData) {
    const reportTime = h.isStale 
      ? new Date(Date.now() - 45 * 60 * 1000).toISOString() 
      : new Date(Date.now() - 2 * 60 * 1000).toISOString();

    const hRes = await db.query(
      `INSERT INTO hospitals (name, admin_id, password, latitude, longitude, contact_phone, last_reported_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [h.name, h.adminId, h.password, h.lat, h.lng, h.phone, reportTime]
    );
    const hospitalId = hRes.rows[0].id;

    // Seed Resource Units for each hospital
    const unitConfigs = [
      { category: 'ICU_BED', count: 4, movable: false },
      { category: 'VENTILATOR', count: 3, movable: true },
      { category: 'TRAUMA_BAY', count: 2, movable: false },
      { category: 'OXYGEN_BED', count: 6, movable: false },
      { category: 'PEDIATRIC_ICU', count: 1, movable: false },
      { category: 'GENERAL_BED', count: 8, movable: false }
    ];

    for (const cfg of unitConfigs) {
      for (let i = 1; i <= cfg.count; i++) {
        await db.query(
          `INSERT INTO resource_units (hospital_id, category, unit_label, status, is_movable) 
           VALUES ($1, $2, $3, 'FREE', $4)`,
          [hospitalId, cfg.category, `${cfg.category}-${i.toString().padStart(2, '0')}`, cfg.movable]
        );
      }
    }
  }

  // 4. Seed Ambulance Fleet
  const fleet = [
    { vehicle: 'MH-14-EM-1081', lat: 18.6275, lng: 73.8180, driverName: 'Rajesh Patil', phone: '+91 9823011081' }, // Near PCCOE / Akurdi
    { vehicle: 'MH-14-EM-1082', lat: 18.5950, lng: 73.7650, driverName: 'Sanjay More', phone: '+91 9823011082' }, // Hinjawadi Phase 1
    { vehicle: 'MH-14-EM-1083', lat: 18.5550, lng: 73.8050, driverName: 'Amit Shinde', phone: '+91 9823011083' }, // Aundh / Baner
    { vehicle: 'MH-14-EM-1084', lat: 18.5300, lng: 73.8450, driverName: 'Ganesh Kadam', phone: '+91 9823011084' }, // Shivajinagar
    { vehicle: 'MH-14-EM-1085', lat: 18.6350, lng: 73.7950, driverName: 'Vikas Jadhav', phone: '+91 9823011085' }, // Chinchwad Station
    { vehicle: 'MH-14-EM-1086', lat: 18.5080, lng: 73.8600, driverName: 'Nitin Pawar', phone: '+91 9823011086' }  // Swargate
  ];

  for (const amb of fleet) {
    await db.query(
      `INSERT INTO ambulances (vehicle_number, current_lat, current_lng, status, driver_name, driver_phone) 
       VALUES ($1, $2, $3, 'AVAILABLE', $4, $5)`,
      [amb.vehicle, amb.lat, amb.lng, amb.driverName, amb.phone]
    );
  }

  console.log('[SEED] Pune Emergency Network seeded successfully with 6 Hospitals, 144+ Units, and 6 Ambulances!');
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  seedData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[SEED_ERROR]', err);
      process.exit(1);
    });
}
