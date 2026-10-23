import mongoose from 'mongoose';
import { env } from './env';

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);
  // Indexes are declared on the schemas; build them on boot outside production.
  // In production they should be created by a migration step instead.
  mongoose.set('autoIndex', !env.isProduction);

  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 10_000,
  });

  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
