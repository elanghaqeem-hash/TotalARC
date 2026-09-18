import { PrismaClient } from '@prisma/client';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);
const password = process.env.CI_E2E_PASSWORD;

async function hashPassword(value) {
  if (!value || value.length < 12) throw new Error('CI_E2E_PASSWORD must be at least 12 characters');
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(value, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derived).toString('hex')}`;
}

async function main() {
  const passwordHash = await hashPassword(password);
  const category = await prisma.processCategory.findFirst({ orderBy: { orderIndex: 'asc' } });
  if (!category) throw new Error('Reference process category is required for tenant isolation test');

  await prisma.user.deleteMany({
    where: { email: { in: ['ci-tenant-a@totalarc.test', 'ci-tenant-b@totalarc.test'] } }
  });
  await prisma.institution.deleteMany({
    where: { shortName: { in: ['CI-TENANT-A', 'CI-TENANT-B'] } }
  });

  const tenantA = await prisma.institution.create({
    data: {
      name: 'CI Tenant A',
      legalName: 'CI Tenant A',
      shortName: 'CI-TENANT-A',
      institutionType: 'Test Institution',
      users: {
        create: {
          name: 'CI Admin A',
          email: 'ci-tenant-a@totalarc.test',
          role: 'Admin',
          passwordHash,
          mustChangePassword: false
        }
      }
    }
  });

  const tenantB = await prisma.institution.create({
    data: {
      name: 'CI Tenant B',
      legalName: 'CI Tenant B',
      shortName: 'CI-TENANT-B',
      institutionType: 'Test Institution',
      users: {
        create: {
          name: 'CI Admin B',
          email: 'ci-tenant-b@totalarc.test',
          role: 'Admin',
          passwordHash,
          mustChangePassword: false
        }
      }
    }
  });

  console.log(JSON.stringify({
    tenantA: tenantA.id,
    tenantB: tenantB.id,
    categoryId: category.id
  }, null, 2));
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
