import { Schema, model, type InferSchemaType } from 'mongoose';

export const SPECIALIZATIONS = [
  'Cardiology',
  'Dermatology',
  'Endocrinology',
  'Gastroenterology',
  'General Medicine',
  'Neurology',
  'Oncology',
  'Orthopedics',
  'Pediatrics',
  'Psychiatry',
  'Pulmonology',
  'Radiology',
] as const;

const doctorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    specialization: { type: String, required: true, enum: SPECIALIZATIONS },
    hospital: { type: String, required: true, trim: true, maxlength: 160 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 160 },
    // Denormalised search tokens, see utils/search.ts
    keywords: { type: [String], select: false },
  },
  { timestamps: true },
);

// Uniqueness + lookup by email
doctorSchema.index({ email: 1 }, { unique: true });
// Default list sort (newest first) and date-range filter on createdAt
doctorSchema.index({ createdAt: -1, _id: -1 });
// Equality filter + sort: ESR (Equality, Sort, Range) ordering, ending in the `_id` tiebreaker
// so the sort is read straight from the index instead of done in memory
doctorSchema.index({ specialization: 1, createdAt: -1, _id: -1 });
doctorSchema.index({ hospital: 1, createdAt: -1, _id: -1 });
// Prefix search over name / specialization / hospital / email / phone
doctorSchema.index({ keywords: 1 });
// Alphabetical sort (both directions)
doctorSchema.index({ name: 1, _id: 1 });

export type Doctor = InferSchemaType<typeof doctorSchema>;
export const DoctorModel = model('Doctor', doctorSchema);
