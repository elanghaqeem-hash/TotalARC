import { PrismaD1 } from '@prisma/adapter-d1';
import { PrismaClient } from '@prisma/client';
import { getCloudflareContext } from '@opennextjs/cloudflare';

type D1Binding = ConstructorParameters<typeof PrismaD1>[0];

/**
 * Create a Prisma client for the current Cloudflare request.
 *
 * Cloudflare Workers bindings are request-scoped. Reusing a global Prisma
 * client can accidentally retain a binding/connection across requests, so
 * every route handler must obtain its client through this factory.
 */
export function getPrisma() {
  const { env } = getCloudflareContext();
  const db = (env as { DB?: D1Binding }).DB;

  if (!db) {
    throw new Error('Cloudflare D1 binding "DB" is not available.');
  }

  const adapter = new PrismaD1(db);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
  });
}

export type TotalArcPrismaClient = ReturnType<typeof getPrisma>;
