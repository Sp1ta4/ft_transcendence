import 'dotenv/config';
import debug from 'debug';
import app from './app.js';
import prisma from './resources/prisma.js';
import redis from './resources/redis.js';

const _debug = debug('backend:server');

function normalizePort(val: string): number {
  const portNum = parseInt(val, 10);
  if (isNaN(portNum)) throw new Error(`Invalid port: ${val}`);
  if (portNum >= 0) return portNum;
  throw new Error(`Negative port: ${val}`);
}

async function checkConnections(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('Postgres connected');

    await redis.set('check_connection', 'connected');
    const redisValue = await redis.get('check_connection');
    console.log('Redis connected, test value:', redisValue);
    await redis.del('check_connection');
  } catch (err) {
    console.error('Connection error:', err);
    process.exit(1);
  }
}

async function bootstrap(): Promise<void> {
  const port = normalizePort(process.env['PORT'] ?? '8080');

  await checkConnections();

  app.listen(port, () => {
    _debug(`Listening on port ${port}`);
    console.log(`Server is running on port ${port}`);
  });
}

bootstrap().catch((err: unknown) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});