/**
 * Makes the database's indexes match the schema definitions: builds missing ones and drops
 * ones no longer declared. Run on deploy (`npm run db:indexes`); `autoIndex` is off in production.
 */
import { connectDatabase, disconnectDatabase } from '../config/db';
import { DoctorModel } from '../models/Doctor';
import { PatientModel } from '../models/Patient';
import { UserModel } from '../models/User';

async function main() {
  await connectDatabase();
  for (const model of [UserModel, DoctorModel, PatientModel]) {
    const dropped = await model.syncIndexes();
    const current = (await model.listIndexes()).map((i) => i.name);
    console.log(`${model.modelName}: ${current.length} indexes${dropped.length ? `, dropped ${dropped.join(', ')}` : ''}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
