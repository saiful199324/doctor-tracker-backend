import { Schema, model, type InferSchemaType } from 'mongoose';

export const PATIENT_CONDITIONS = ['stable', 'critical', 'recovering', 'observation', 'discharged'] as const;
export const GENDERS = ['male', 'female', 'other'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

const patientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    age: { type: Number, required: true, min: 0, max: 130 },
    gender: { type: String, required: true, enum: GENDERS },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    email: { type: String, lowercase: true, trim: true, maxlength: 160 },
    bloodGroup: { type: String, enum: BLOOD_GROUPS },
    condition: { type: String, required: true, enum: PATIENT_CONDITIONS, default: 'observation' },
    diagnosis: { type: String, trim: true, maxlength: 500 },
    admissionDate: { type: Date, required: true, default: () => new Date() },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
    keywords: { type: [String], select: false },
  },
  { timestamps: true },
);

// Every sort ends in `_id` (a unique tiebreaker, so pages never overlap), and every index that
// serves a sort ends with that same key, so MongoDB walks the index in order and stops after one
// page instead of sorting all matches in memory. Order follows ESR: Equality, Sort, Range.

// Default "recently added" sort: all patients, per doctor, per condition
patientSchema.index({ createdAt: -1, _id: -1 });
patientSchema.index({ doctor: 1, createdAt: -1, _id: -1 });
patientSchema.index({ condition: 1, createdAt: -1, _id: -1 });
// "Recently admitted" sort and admission date-range filter (also the admissions timeline)
patientSchema.index({ admissionDate: -1, _id: -1 });
patientSchema.index({ doctor: 1, admissionDate: -1, _id: -1 });
patientSchema.index({ condition: 1, admissionDate: -1, _id: -1 });
patientSchema.index({ gender: 1, admissionDate: -1 });
// Name A–Z and age sorts (both directions); the age index also serves the age-group filter
patientSchema.index({ name: 1, _id: 1 });
patientSchema.index({ age: 1, _id: 1 });
// Prefix search, see utils/search.ts
patientSchema.index({ keywords: 1 });

export type Patient = InferSchemaType<typeof patientSchema>;
export const PatientModel = model('Patient', patientSchema);
