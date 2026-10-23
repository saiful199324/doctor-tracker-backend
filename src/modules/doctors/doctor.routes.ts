import { Router } from 'express';
import { authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { idParams } from '../../utils/schemas';
import {
  createPatientForDoctorSchema,
  doctorPatientParams,
  listPatientsQuery,
  type CreatePatientInput,
  type ListPatientsQuery,
} from '../patients/patient.schema';
import * as patientService from '../patients/patient.service';
import {
  createDoctorSchema,
  listDoctorsQuery,
  updateDoctorSchema,
  type CreateDoctorInput,
  type ListDoctorsQuery,
  type UpdateDoctorInput,
} from './doctor.schema';
import * as doctorService from './doctor.service';

const router = Router();

router.get(
  '/',
  validate({ query: listDoctorsQuery }),
  asyncHandler(async (req, res) => {
    const result = await doctorService.listDoctors(req.validated.query as ListDoctorsQuery);
    res.json({ success: true, ...result });
  }),
);

router.get(
  '/options',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await doctorService.getDoctorFilterOptions() });
  }),
);

router.post(
  '/',
  validate({ body: createDoctorSchema }),
  asyncHandler(async (req, res) => {
    const doctor = await doctorService.createDoctor(req.validated.body as CreateDoctorInput);
    res.status(201).json({ success: true, data: doctor });
  }),
);

router.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await doctorService.getDoctor(req.params.id) });
  }),
);

router.patch(
  '/:id',
  validate({ params: idParams, body: updateDoctorSchema }),
  asyncHandler(async (req, res) => {
    const doctor = await doctorService.updateDoctor(req.params.id, req.validated.body as UpdateDoctorInput);
    res.json({ success: true, data: doctor });
  }),
);

router.delete(
  '/:id',
  authorize('admin'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await doctorService.deleteDoctor(req.params.id);
    res.status(204).end();
  }),
);

// ---- Patients nested under a doctor ----

router.get(
  '/:id/patients',
  validate({ params: idParams, query: listPatientsQuery }),
  asyncHandler(async (req, res) => {
    const query = { ...(req.validated.query as ListPatientsQuery), doctor: req.params.id };
    res.json({ success: true, ...(await patientService.listPatients(query)) });
  }),
);

router.post(
  '/:id/patients',
  validate({ params: idParams, body: createPatientForDoctorSchema }),
  asyncHandler(async (req, res) => {
    const body = req.validated.body as Omit<CreatePatientInput, 'doctor'>;
    const patient = await patientService.createPatient({ ...body, doctor: req.params.id });
    res.status(201).json({ success: true, data: patient });
  }),
);

router.delete(
  '/:id/patients/:patientId',
  authorize('admin'),
  validate({ params: doctorPatientParams }),
  asyncHandler(async (req, res) => {
    await patientService.deletePatient(req.params.patientId, req.params.id);
    res.status(204).end();
  }),
);

export default router;
