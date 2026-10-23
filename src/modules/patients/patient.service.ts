import { Types, type SortOrder } from 'mongoose';
import { DoctorModel } from '../../models/Doctor';
import { PatientModel } from '../../models/Patient';
import { ApiError } from '../../utils/ApiError';
import { invalidate } from '../../utils/cache';
import { buildPageMeta, countMatching, dateRangeFilter } from '../../utils/pagination';
import { buildKeywords, keywordFilter } from '../../utils/search';
import type { CreatePatientInput, ListPatientsQuery, UpdatePatientInput } from './patient.schema';

const SORTS: Record<ListPatientsQuery['sort'], Record<string, SortOrder>> = {
  // Default: most recently added record first.
  newest: { createdAt: -1, _id: -1 },
  admitted: { admissionDate: -1, _id: -1 },
  oldest: { admissionDate: 1, _id: 1 },
  name: { name: 1, _id: 1 },
  age: { age: 1, _id: 1 },
  '-age': { age: -1, _id: -1 },
};

const DOCTOR_FIELDS = 'name specialization hospital';

type KeywordSource = Pick<CreatePatientInput, 'name' | 'email' | 'phone' | 'diagnosis'>;
const patientKeywords = (p: KeywordSource) => buildKeywords(p.name, p.email, p.phone, p.diagnosis);

async function assertDoctorExists(id: string | Types.ObjectId) {
  if (!(await DoctorModel.exists({ _id: id }))) {
    throw ApiError.badRequest('Validation failed', { doctor: ['Selected doctor does not exist'] });
  }
}

export async function listPatients(q: ListPatientsQuery) {
  const age: Record<string, number> = {};
  if (q.ageMin !== undefined) age.$gte = q.ageMin;
  if (q.ageMax !== undefined) age.$lte = q.ageMax;

  const filter = {
    ...keywordFilter(q.search),
    ...(q.doctor && { doctor: new Types.ObjectId(q.doctor) }),
    ...(q.condition && { condition: q.condition }),
    ...(q.gender && { gender: q.gender }),
    ...(Object.keys(age).length > 0 && { age }),
    ...dateRangeFilter('admissionDate', q.from, q.to),
  };

  const [patients, total] = await Promise.all([
    PatientModel.find(filter)
      .sort(SORTS[q.sort])
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      // One batched `$in` lookup for the page's doctors, only the fields the table shows.
      .populate('doctor', DOCTOR_FIELDS)
      .lean(),
    countMatching(PatientModel, filter),
  ]);

  return { data: patients, meta: buildPageMeta(q.page, q.limit, total) };
}

export async function getPatient(id: string) {
  const patient = await PatientModel.findById(id).populate('doctor', DOCTOR_FIELDS).lean();
  if (!patient) throw ApiError.notFound('Patient not found');
  return patient;
}

export async function createPatient(input: CreatePatientInput) {
  await assertDoctorExists(input.doctor);
  const patient = await PatientModel.create({ ...input, keywords: patientKeywords(input) });
  invalidate('stats');
  return getPatient(patient.id);
}

export async function updatePatient(id: string, input: UpdatePatientInput) {
  const existing = await PatientModel.findById(id).lean();
  if (!existing) throw ApiError.notFound('Patient not found');
  if (input.doctor) await assertDoctorExists(input.doctor);

  // Optional fields cleared in the form arrive as `undefined`: remove them from the document.
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ''> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) $unset[key] = '';
    else $set[key] = value;
  }

  const merged = { ...existing, ...input } as KeywordSource;
  $set.keywords = patientKeywords(merged);
  await PatientModel.updateOne(
    { _id: id },
    { $set, ...(Object.keys($unset).length > 0 && { $unset }) },
    { runValidators: true },
  );
  invalidate('stats');
  return getPatient(id);
}

/** Deletes a patient. When `doctorId` is given the patient must belong to that doctor. */
export async function deletePatient(id: string, doctorId?: string) {
  const filter = doctorId ? { _id: id, doctor: doctorId } : { _id: id };
  const result = await PatientModel.deleteOne(filter);
  if (result.deletedCount === 0) throw ApiError.notFound('Patient not found');
  invalidate('stats');
}
