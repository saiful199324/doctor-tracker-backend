import { Router } from 'express';
import { authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { idParams } from '../../utils/schemas';
import {
  createPatientSchema,
  listPatientsQuery,
  updatePatientSchema,
  type CreatePatientInput,
  type ListPatientsQuery,
  type UpdatePatientInput,
} from './patient.schema';
import * as patientService from './patient.service';

const router = Router();

router.get(
  '/',
  validate({ query: listPatientsQuery }),
  asyncHandler(async (req, res) => {
    const result = await patientService.listPatients(req.validated.query as ListPatientsQuery);
    res.json({ success: true, ...result });
  }),
);

router.post(
  '/',
  validate({ body: createPatientSchema }),
  asyncHandler(async (req, res) => {
    const patient = await patientService.createPatient(req.validated.body as CreatePatientInput);
    res.status(201).json({ success: true, data: patient });
  }),
);

router.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await patientService.getPatient(req.params.id) });
  }),
);

router.patch(
  '/:id',
  validate({ params: idParams, body: updatePatientSchema }),
  asyncHandler(async (req, res) => {
    const patient = await patientService.updatePatient(req.params.id, req.validated.body as UpdatePatientInput);
    res.json({ success: true, data: patient });
  }),
);

router.delete(
  '/:id',
  authorize('admin'),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await patientService.deletePatient(req.params.id);
    res.status(204).end();
  }),
);

export default router;
