// Run `npm run generate` before building to create the generated Prisma client
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) throw new Error('DATABASE_URL is not set');

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export type { PrismaClient };
export default prisma;
