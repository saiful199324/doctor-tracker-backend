import { DoctorModel } from '../../models/Doctor';
import { PatientModel, PATIENT_CONDITIONS } from '../../models/Patient';
import { cached } from '../../utils/cache';

export const RANGES = {
  '7d': { days: 7, unit: 'day' },
  '30d': { days: 30, unit: 'day' },
  '90d': { days: 90, unit: 'week' },
  '12m': { days: 365, unit: 'month' },
} as const;

export type StatsRange = keyof typeof RANGES;
type Unit = (typeof RANGES)[StatsRange]['unit'];

const CACHE_TTL_MS = 30_000;

/** Start of the bucket containing `date`, mirroring Mongo's `$dateTrunc` (weeks start on Sunday). */
function truncate(date: Date, unit: Unit, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const [y, m, d] = [Number(get('year')), Number(get('month')), Number(get('day'))];

  if (unit === 'month') return `${y}-${String(m).padStart(2, '0')}-01`;
  const local = new Date(Date.UTC(y, m - 1, d));
  if (unit === 'week') local.setUTCDate(local.getUTCDate() - local.getUTCDay());
  return local.toISOString().slice(0, 10);
}

/** Builds every bucket key between start and now so the chart has no gaps for empty days. */
function bucketKeys(start: Date, unit: Unit, timezone: string): string[] {
  const keys = new Set<string>();
  const cursor = new Date(start);
  const now = new Date();
  while (cursor <= now) {
    keys.add(truncate(cursor, unit, timezone));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  keys.add(truncate(now, unit, timezone));
  return [...keys];
}

export function getOverview(range: StatsRange, timezone: string) {
  return cached(`stats:${range}:${timezone}`, CACHE_TTL_MS, () => computeOverview(range, timezone));
}

async function computeOverview(range: StatsRange, timezone: string) {
  const { days, unit } = RANGES[range];
  const now = new Date();
  const start = new Date(now.getTime() - days * 86_400_000);
  const prevStart = new Date(start.getTime() - days * 86_400_000);

  // Every query is independent, so run them concurrently. Each one is served by an index:
  // admissionDate_-1, condition_1_admissionDate_-1, doctor_1_admissionDate_-1, gender_1_admissionDate_-1.
  const [
    totalDoctors,
    totalPatients,
    criticalPatients,
    admissionsInRange,
    admissionsPrevRange,
    newDoctorsInRange,
    timelineRows,
    conditionRows,
    topDoctors,
    doctorsBySpecialization,
    patientsBySpecialization,
    genderRows,
    ageRows,
    recentPatients,
  ] = await Promise.all([
    DoctorModel.estimatedDocumentCount(),
    PatientModel.estimatedDocumentCount(),
    PatientModel.countDocuments({ condition: 'critical' }),
    PatientModel.countDocuments({ admissionDate: { $gte: start } }),
    PatientModel.countDocuments({ admissionDate: { $gte: prevStart, $lt: start } }),
    DoctorModel.countDocuments({ createdAt: { $gte: start } }),

    PatientModel.aggregate<{ _id: Date; admissions: number; critical: number }>([
      { $match: { admissionDate: { $gte: start } } },
      {
        $group: {
          _id: { $dateTrunc: { date: '$admissionDate', unit, timezone, startOfWeek: 'sunday' } },
          admissions: { $sum: 1 },
          critical: { $sum: { $cond: [{ $eq: ['$condition', 'critical'] }, 1, 0] } },
        },
      },
    ]),

    PatientModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$condition', count: { $sum: 1 } } },
    ]),

    PatientModel.aggregate<{ id: string; name: string; specialization: string; patients: number }>([
      { $group: { _id: '$doctor', patients: { $sum: 1 } } },
      { $sort: { patients: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: 'doctors',
          localField: '_id',
          foreignField: '_id',
          as: 'doctor',
          pipeline: [{ $project: { name: 1, specialization: 1 } }],
        },
      },
      { $unwind: '$doctor' },
      {
        $project: {
          _id: 0,
          id: { $toString: '$_id' },
          name: '$doctor.name',
          specialization: '$doctor.specialization',
          patients: 1,
        },
      },
    ]),

    DoctorModel.aggregate<{ _id: string; doctors: number }>([
      { $group: { _id: '$specialization', doctors: { $sum: 1 } } },
    ]),

    // Group patients per doctor first (index-only), then join the much smaller result set.
    PatientModel.aggregate<{ _id: string; patients: number }>([
      { $group: { _id: '$doctor', patients: { $sum: 1 } } },
      {
        $lookup: {
          from: 'doctors',
          localField: '_id',
          foreignField: '_id',
          as: 'doctor',
          pipeline: [{ $project: { specialization: 1 } }],
        },
      },
      { $unwind: '$doctor' },
      { $group: { _id: '$doctor.specialization', patients: { $sum: '$patients' } } },
    ]),

    PatientModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$gender', count: { $sum: 1 } } }]),

    PatientModel.aggregate<{ _id: number | string; count: number }>([
      {
        $bucket: {
          groupBy: '$age',
          boundaries: [0, 13, 18, 30, 45, 60, 75, 131],
          default: 'unknown',
          output: { count: { $sum: 1 } },
        },
      },
    ]),

    PatientModel.find({}, { name: 1, condition: 1, admissionDate: 1, createdAt: 1, doctor: 1, age: 1, gender: 1 })
      .sort({ createdAt: -1, _id: -1 })
      .limit(6)
      .populate('doctor', 'name specialization')
      .lean(),
  ]);

  // `$dateTrunc` with a timezone returns the UTC instant of local midnight; key it by the local date.
  const timelineMap = new Map(timelineRows.map((r) => [truncate(r._id, unit, timezone), r]));
  const timeline = bucketKeys(start, unit, timezone).map((date) => ({
    date,
    admissions: timelineMap.get(date)?.admissions ?? 0,
    critical: timelineMap.get(date)?.critical ?? 0,
  }));

  const conditionCounts = new Map(conditionRows.map((r) => [r._id, r.count]));
  const patientsBySpec = new Map(patientsBySpecialization.map((r) => [r._id, r.patients]));
  const ageLabels: Record<string, string> = {
    0: '0–12',
    13: '13–17',
    18: '18–29',
    30: '30–44',
    45: '45–59',
    60: '60–74',
    75: '75+',
  };

  const trend =
    admissionsPrevRange === 0
      ? null
      : Math.round(((admissionsInRange - admissionsPrevRange) / admissionsPrevRange) * 1000) / 10;

  return {
    range,
    unit,
    generatedAt: now.toISOString(),
    totals: {
      doctors: totalDoctors,
      patients: totalPatients,
      criticalPatients,
      admissionsInRange,
      admissionsTrend: trend,
      newDoctorsInRange,
      avgPatientsPerDoctor: totalDoctors ? Math.round((totalPatients / totalDoctors) * 10) / 10 : 0,
    },
    timeline,
    conditions: PATIENT_CONDITIONS.map((condition) => ({
      condition,
      count: conditionCounts.get(condition) ?? 0,
    })),
    topDoctors,
    specializations: doctorsBySpecialization
      .map((r) => ({ specialization: r._id, doctors: r.doctors, patients: patientsBySpec.get(r._id) ?? 0 }))
      .sort((a, b) => b.patients - a.patients),
    genders: genderRows.map((r) => ({ gender: r._id, count: r.count })),
    ageGroups: ageRows
      .filter((r) => r._id !== 'unknown')
      .map((r) => ({ group: ageLabels[String(r._id)], count: r.count })),
    recentPatients,
  };
}
