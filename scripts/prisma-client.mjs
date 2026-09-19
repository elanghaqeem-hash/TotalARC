import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
