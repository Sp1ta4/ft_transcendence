import { createClient } from 'redis';

const redis = createClient({
	socket: {
		host: process.env.REDIS_HOST,
		port: process.env.REDIS_PORT,
	},
	password: process.env.REDIS_PASSWORD,
});
redis.connect();

export default redis;
