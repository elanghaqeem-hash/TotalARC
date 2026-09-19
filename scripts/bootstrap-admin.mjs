import { createPrismaClient } from './prisma-client.mjs';
import { randomBytes, scryptSync } from 'node:crypto';

const prisma = createPrismaClient();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function hashPassword(password) {
  if (password.length < 12) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters');
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

async function main() {
  const institutionName = required('BOOTSTRAP_INSTITUTION_NAME');
  const shortName = required('BOOTSTRAP_INSTITUTION_SHORT_NAME');
  const name = required('BOOTSTRAP_ADMIN_NAME');
  const email = required('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  const password = required('BOOTSTRAP_ADMIN_PASSWORD');

  let institution = await prisma.institution.findFirst({ where: { name: institutionName } });
  if (!institution) {
    institution = await prisma.institution.create({
      data: {
        name: institutionName,
        legalName: institutionName,
        shortName,
        institutionType: 'Corporation',
        country: 'Indonesia'
      }
    });
  }

  const passwordHash = hashPassword(password);
  await prisma.user.upsert({
    where: { email },
    update: { name, role: 'Admin', active: true, passwordHash, institutionId: institution.id, sessionVersion: { increment: 1 } },
    create: { institutionId: institution.id, name, email, role: 'Admin', department: 'Administration', passwordHash }
  });

  console.log(`Bootstrap admin ready for ${institutionName}: ${email}`);
}

main().finally(() => prisma.$disconnect());
