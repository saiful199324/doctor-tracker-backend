/**
 * Seeds users, doctors and patients.
 *   npm run seed                 -> 60 doctors, 3,000 patients
 *   npm run seed -- --patients=50000   -> larger dataset for performance testing
 * Doctors and patients are wiped first; users are upserted.
 */
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { env } from '../config/env';
import { DoctorModel, SPECIALIZATIONS } from '../models/Doctor';
import { BLOOD_GROUPS, GENDERS, PATIENT_CONDITIONS, PatientModel } from '../models/Patient';
import { UserModel } from '../models/User';
import { buildKeywords } from '../utils/search';

const arg = (name: string, fallback: number) => {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  return match ? Number(match.split('=')[1]) : fallback;
};

const DOCTOR_COUNT = arg('doctors', 60);
const PATIENT_COUNT = arg('patients', 3000);
const BATCH = 1000;

const HOSPITALS = [
  'City General Hospital',
  'Green Valley Medical Center',
  'Riverside Specialized Hospital',
  'St. Mary Healthcare',
  'Northside Clinic & Diagnostics',
  'Lakeview Heart Institute',
  'Metro Children’s Hospital',
  'Sunrise Community Hospital',
];

const DIAGNOSES: Record<string, string[]> = {
  Cardiology: ['Hypertension', 'Coronary artery disease', 'Arrhythmia', 'Heart failure'],
  Dermatology: ['Eczema', 'Psoriasis', 'Acne vulgaris', 'Dermatitis'],
  Endocrinology: ['Type 2 diabetes', 'Hypothyroidism', 'Hyperthyroidism', 'PCOS'],
  Gastroenterology: ['GERD', 'Irritable bowel syndrome', 'Gastritis', 'Hepatitis B'],
  'General Medicine': ['Viral fever', 'Dengue fever', 'Typhoid', 'Influenza'],
  Neurology: ['Migraine', 'Epilepsy', 'Stroke recovery', 'Peripheral neuropathy'],
  Oncology: ['Breast cancer', 'Lung cancer', 'Lymphoma', 'Colorectal cancer'],
  Orthopedics: ['Fractured femur', 'Osteoarthritis', 'ACL tear', 'Lumbar disc herniation'],
  Pediatrics: ['Bronchiolitis', 'Childhood asthma', 'Otitis media', 'Gastroenteritis'],
  Psychiatry: ['Major depressive disorder', 'Generalised anxiety', 'Bipolar disorder', 'Insomnia'],
  Pulmonology: ['COPD', 'Asthma', 'Pneumonia', 'Tuberculosis'],
  Radiology: ['Imaging follow-up', 'Suspected fracture', 'Chest X-ray review', 'MRI assessment'],
};

// Weighted so the condition chart looks like a real ward, not a uniform split.
const CONDITION_WEIGHTS: Record<(typeof PATIENT_CONDITIONS)[number], number> = {
  stable: 38,
  recovering: 24,
  observation: 18,
  discharged: 12,
  critical: 8,
};

const phone = () => `+1 ${faker.string.numeric(3)}-${faker.string.numeric(3)}-${faker.string.numeric(4)}`;

async function seedUsers() {
  const users = [
    { name: 'Admin User', email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD, role: 'admin' },
    { name: 'Staff User', email: process.env.SEED_STAFF_EMAIL, password: process.env.SEED_STAFF_PASSWORD, role: 'staff' },
  ];
  for (const u of users) {
    if (!u.email || !u.password) throw new Error('SEED_* credentials must be set in .env');
    await UserModel.updateOne(
      { email: u.email.toLowerCase() },
      { $set: { name: u.name, role: u.role, password: await bcrypt.hash(u.password, 12) } },
      { upsert: true },
    );
    console.log(`  user  ${u.email} (${u.role})`);
  }
}

async function seedDoctors() {
  const now = Date.now();
  const docs = Array.from({ length: DOCTOR_COUNT }, (_, i) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const name = `Dr. ${firstName} ${lastName}`;
    const specialization = SPECIALIZATIONS[i % SPECIALIZATIONS.length];
    const hospital = faker.helpers.arrayElement(HOSPITALS);
    const slug = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    const email = `${slug(firstName)}.${slug(lastName)}${i < 10 ? '' : i}@doctortracker.dev`;
    const p = phone();
    // Spread "joined" dates over the last 18 months so date filters have something to do.
    const createdAt = new Date(now - faker.number.int({ min: 0, max: 540 }) * 86_400_000);
    return { name, specialization, hospital, email, phone: p, createdAt, updatedAt: createdAt, keywords: buildKeywords(name, specialization, hospital, email, p) };
  });
  return DoctorModel.insertMany(docs, { lean: true });
}

async function seedPatients(doctors: Array<{ _id: unknown; specialization: string }>) {
  const now = Date.now();
  // Give doctors uneven workloads so "patients per doctor" is interesting.
  const weights = doctors.map(() => faker.number.int({ min: 1, max: 10 }));
  const weighted = doctors.map((value, i) => ({ value, weight: weights[i] }));
  const conditions = Object.entries(CONDITION_WEIGHTS).map(([value, weight]) => ({ value, weight }));

  for (let offset = 0; offset < PATIENT_COUNT; offset += BATCH) {
    const size = Math.min(BATCH, PATIENT_COUNT - offset);
    const batch = Array.from({ length: size }, () => {
      const doctor = faker.helpers.weightedArrayElement(weighted);
      const gender = faker.helpers.arrayElement(GENDERS.slice(0, 2)) as 'male' | 'female';
      const name = faker.person.fullName({ sex: gender });
      const age = doctor.specialization === 'Pediatrics' ? faker.number.int({ min: 0, max: 17 }) : faker.number.int({ min: 18, max: 90 });
      const diagnosis = faker.helpers.arrayElement(DIAGNOSES[doctor.specialization]);
      // Skew towards recent admissions: more activity in the last few months.
      const daysAgo = Math.floor(Math.pow(Math.random(), 1.6) * 420);
      const admissionDate = new Date(now - daysAgo * 86_400_000 - faker.number.int({ min: 0, max: 86_399_999 }));
      const email = faker.datatype.boolean(0.7) ? faker.internet.email({ firstName: name.split(' ')[0] }).toLowerCase() : undefined;
      const p = phone();
      return {
        name,
        age,
        gender,
        phone: p,
        email,
        bloodGroup: faker.helpers.arrayElement(BLOOD_GROUPS),
        condition: faker.helpers.weightedArrayElement(conditions),
        diagnosis,
        admissionDate,
        doctor: doctor._id,
        createdAt: admissionDate,
        updatedAt: admissionDate,
        keywords: buildKeywords(name, email, p, diagnosis),
      };
    });
    await PatientModel.insertMany(batch, { lean: true, ordered: false });
    process.stdout.write(`\r  patients ${offset + size}/${PATIENT_COUNT}`);
  }
  process.stdout.write('\n');
}

async function main() {
  if (env.isProduction && !process.argv.includes('--force')) {
    throw new Error('Refusing to seed in production without --force');
  }
  faker.seed(42);
  await connectDatabase();

  console.log('Syncing indexes…');
  await Promise.all([UserModel.syncIndexes(), DoctorModel.syncIndexes(), PatientModel.syncIndexes()]);

  console.log('Clearing doctors and patients…');
  await Promise.all([DoctorModel.deleteMany({}), PatientModel.deleteMany({})]);

  console.log('Seeding…');
  await seedUsers();
  const doctors = await seedDoctors();
  console.log(`  doctors ${doctors.length}`);
  await seedPatients(doctors as Array<{ _id: unknown; specialization: string }>);

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
