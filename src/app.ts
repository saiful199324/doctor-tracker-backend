import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { env } from './config/env';
import { authenticate } from './middleware/auth';
import { resolveClientIp } from './middleware/client-ip';
import { errorHandler, notFound } from './middleware/error';
import authRoutes from './modules/auth/auth.routes';
import doctorRoutes from './modules/doctors/doctor.routes';
import patientRoutes from './modules/patients/patient.routes';
import statsRoutes from './modules/stats/stats.routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(resolveClientIp);

  app.use(helmet());
  app.use(cors({ origin: env.clientOrigins, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use(morgan(env.isProduction ? 'combined' : 'dev'));

  // Public service info, so the bare API URL explains itself.
  app.get(['/', '/api'], (_req, res) => {
    res.json({
      success: true,
      name: 'Doctor Tracker API',
      status: 'ok',
      health: '/api/health',
      authentication: 'POST /api/auth/login sets an httpOnly session cookie; all other /api routes require it',
      resources: ['/api/auth', '/api/doctors', '/api/patients', '/api/stats/overview'],
      docs: 'https://github.com/saiful199324/doctor-tracker-backend#api-reference',
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, status: 'ok', db: mongoose.connection.readyState === 1 ? 'up' : 'down' });
  });

  app.use('/api/auth', authRoutes);

  // Everything below requires a valid session.
  app.use('/api', authenticate);
  app.use('/api/doctors', doctorRoutes);
  app.use('/api/patients', patientRoutes);
  app.use('/api/stats', statsRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
