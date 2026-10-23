import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/db';
import { createApp } from './app';

async function main() {
  await connectDatabase();

  const server = createApp().listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
      console.error(`Port ${env.PORT} is unavailable (${err.code}). Set a different PORT in server/.env.`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
