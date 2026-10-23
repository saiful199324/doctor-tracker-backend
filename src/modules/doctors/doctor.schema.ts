import { z } from 'zod';
import { SPECIALIZATIONS } from '../../models/Doctor';
import { optionalString, paginationQuery, phone } from '../../utils/schemas';

export const createDoctorSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  specialization: z.enum(SPECIALIZATIONS, { errorMap: () => ({ message: 'Select a specialization' }) }),
  hospital: z.string().trim().min(2, 'Hospital is required').max(160),
  phone,
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
});

export const updateDoctorSchema = createDoctorSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: 'Provide at least one field to update',
});

export const listDoctorsQuery = paginationQuery.extend({
  specialization: z.preprocess((v) => (v === '' ? undefined : v), z.enum(SPECIALIZATIONS).optional()),
  hospital: optionalString,
  sort: z.enum(['newest', 'oldest', 'name', '-name']).default('newest'),
});

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
export type ListDoctorsQuery = z.infer<typeof listDoctorsQuery>;
