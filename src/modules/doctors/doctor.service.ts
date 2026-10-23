import { Types, type SortOrder } from 'mongoose';
import { DoctorModel, SPECIALIZATIONS } from '../../models/Doctor';
import { PatientModel } from '../../models/Patient';
import { ApiError } from '../../utils/ApiError';
import { invalidate } from '../../utils/cache';
import { buildPageMeta, countMatching, dateRangeFilter } from '../../utils/pagination';
import { buildKeywords, keywordFilter } from '../../utils/search';
import type { CreateDoctorInput, ListDoctorsQuery, UpdateDoctorInput } from './doctor.schema';

const SORTS: Record<ListDoctorsQuery['sort'], Record<string, SortOrder>> = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  name: { name: 1, _id: 1 },
  '-name': { name: -1, _id: -1 },
};

type KeywordSource = Pick<CreateDoctorInput, 'name' | 'specialization' | 'hospital' | 'email' | 'phone'>;
const doctorKeywords = (d: KeywordSource) => buildKeywords(d.name, d.specialization, d.hospital, d.email, d.phone);

/** Returns `{ doctorId -> count }` for the given doctors using one indexed aggregation. */
async function countPatientsFor(doctorIds: Types.ObjectId[]): Promise<Map<string, number>> {
  if (doctorIds.length === 0) return new Map();
  const rows = await PatientModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { doctor: { $in: doctorIds } } },
    { $group: { _id: '$doctor', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

export async function listDoctors(q: ListDoctorsQuery) {
  const filter = {
    ...keywordFilter(q.search),
    ...(q.specialization && { specialization: q.specialization }),
    ...(q.hospital && { hospital: q.hospital }),
    ...dateRangeFilter('createdAt', q.from, q.to),
  };

  // Page + count run concurrently; `lean()` skips document hydration for read-only data.
  const [doctors, total] = await Promise.all([
    DoctorModel.find(filter)
      .sort(SORTS[q.sort])
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    countMatching(DoctorModel, filter),
  ]);

  const counts = await countPatientsFor(doctors.map((d) => d._id));
  return {
    data: doctors.map((d) => ({ ...d, patientCount: counts.get(String(d._id)) ?? 0 })),
    meta: buildPageMeta(q.page, q.limit, total),
  };
}

export async function getDoctor(id: string) {
  const doctor = await DoctorModel.findById(id).lean();
  if (!doctor) throw ApiError.notFound('Doctor not found');

  const breakdown = await PatientModel.aggregate<{ _id: string; count: number }>([
    { $match: { doctor: doctor._id } },
    { $group: { _id: '$condition', count: { $sum: 1 } } },
  ]);
  const byCondition = Object.fromEntries(breakdown.map((b) => [b._id, b.count]));
  const patientCount = breakdown.reduce((sum, b) => sum + b.count, 0);

  return { ...doctor, patientCount, byCondition };
}

export async function createDoctor(input: CreateDoctorInput) {
  const doctor = await DoctorModel.create({ ...input, keywords: doctorKeywords(input) });
  invalidate('stats');
  const { keywords: _keywords, ...rest } = doctor.toObject();
  return { ...rest, patientCount: 0 };
}

export async function updateDoctor(id: string, input: UpdateDoctorInput) {
  const existing = await DoctorModel.findById(id).lean();
  if (!existing) throw ApiError.notFound('Doctor not found');

  const merged = { ...existing, ...input } as KeywordSource;
  const doctor = await DoctorModel.findByIdAndUpdate(
    id,
    { $set: { ...input, keywords: doctorKeywords(merged) } },
    { new: true, runValidators: true },
  ).lean();
  invalidate('stats');
  return doctor;
}

export async function deleteDoctor(id: string) {
  const hasPatients = await PatientModel.exists({ doctor: id });
  if (hasPatients) {
    throw ApiError.conflict('This doctor still has patients. Remove or reassign them first.');
  }
  const deleted = await DoctorModel.findByIdAndDelete(id).lean();
  if (!deleted) throw ApiError.notFound('Doctor not found');
  invalidate('stats');
}

/** Lightweight data for filter dropdowns and the patient form's doctor picker. */
export async function getDoctorFilterOptions() {
  const [doctors, hospitals] = await Promise.all([
    DoctorModel.find({}, { name: 1, specialization: 1 }).sort({ name: 1 }).lean(),
    DoctorModel.distinct('hospital'),
  ]);
  return {
    doctors: doctors.map((d) => ({ id: String(d._id), name: d.name, specialization: d.specialization })),
    hospitals: hospitals.sort(),
    specializations: SPECIALIZATIONS,
  };
}
