import { z } from 'zod';
import { BLOOD_GROUPS, GENDERS, PATIENT_CONDITIONS } from '../../models/Patient';
import { objectId, paginationQuery, phone } from '../../utils/schemas';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

const patientFields = {
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  age: z.coerce.number({ invalid_type_error: 'Age is required' }).int().min(0, 'Invalid age').max(130, 'Invalid age'),
  gender: z.enum(GENDERS, { errorMap: () => ({ message: 'Select a gender' }) }),
  phone,
  email: z.preprocess(emptyToUndefined, z.string().trim().toLowerCase().email('Enter a valid email').optional()),
  bloodGroup: z.preprocess(emptyToUndefined, z.enum(BLOOD_GROUPS).optional()),
  condition: z.enum(PATIENT_CONDITIONS, { errorMap: () => ({ message: 'Select a condition' }) }),
  diagnosis: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  admissionDate: z.coerce
    .date({ invalid_type_error: 'Enter a valid date' })
    .refine((d) => d.getTime() <= Date.now() + 24 * 60 * 60 * 1000, 'Admission date cannot be in the future'),
};

export const createPatientSchema = z.object({ ...patientFields, doctor: objectId });

/** Body for POST /doctors/:id/patients – the doctor comes from the URL. */
export const createPatientForDoctorSchema = z.object(patientFields);

export const updatePatientSchema = createPatientSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: 'Provide at least one field to update',
});

const optionalEnum = <T extends [string, ...string[]]>(values: T) =>
  z.preprocess(emptyToUndefined, z.enum(values).optional());

export const listPatientsQuery = paginationQuery.extend({
  condition: optionalEnum([...PATIENT_CONDITIONS]),
  gender: optionalEnum([...GENDERS]),
  doctor: z.preprocess(emptyToUndefined, objectId.optional()),
  ageMin: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(130).optional()),
  ageMax: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(130).optional()),
  sort: z.enum(['newest', 'admitted', 'oldest', 'name', 'age', '-age']).default('newest'),
});

export const doctorPatientParams = z.object({ id: objectId, patientId: objectId });

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type ListPatientsQuery = z.infer<typeof listPatientsQuery>;
