import { createClient } from 'redis';

const redis = createClient({
  socket: {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: process.env['REDIS_PORT'] ? parseInt(process.env['REDIS_PORT'], 10) : 6379,
  },
  // password: process.env['REDIS_PASSWORD'],
});

void redis.connect();

export type Redis = typeof redis;
export default redis;
