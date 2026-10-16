// DLPMS seed script — creates the five seeded roles per DATABASE_DESIGN.md
// and a bootstrap SystemAdmin user. Run with:  npm --workspace @dlpms/api run seed
//
// Required env:
//   DATABASE_URL   (Postgres/PostGIS)
//   ADMIN_PHONE / ADMIN_PASSWORD  (optional — defaults below are for dev only)

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROLE_DEFINITIONS = [
  { code: 'Citizen', name: 'Citizen', description: 'Owner / applicant who uses the citizen PWA.' },
  { code: 'LandOfficer', name: 'Land Officer', description: 'Reviews registrations and transfers, issues certificates.' },
  { code: 'TaxOfficial', name: 'Tax Official', description: 'Calculates tax and records payments.' },
  { code: 'GISOfficer', name: 'GIS Officer', description: 'Manages parcel boundary geometry and verification.' },
  { code: 'SystemAdmin', name: 'System Administrator', description: 'Manages users, roles, audit logs, and system settings.' }
];

function normalizePhone(phone) {
  if (!phone) return '';
  const trimmed = String(phone).trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return '';
  return hasPlus ? `+${digits}` : digits;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Configure .env and try again.');
    process.exitCode = 1;
    return;
  }

  console.log('Seeding roles…');
  for (const def of ROLE_DEFINITIONS) {
    await prisma.role.upsert({
      where: { code: def.code },
      create: def,
      update: { name: def.name, description: def.description }
    });
    console.log(`  - ${def.code}`);
  }

  const adminRole = await prisma.role.findUnique({ where: { code: 'SystemAdmin' } });
  if (!adminRole) {
    throw new Error('SystemAdmin role missing after seed — aborting.');
  }

  const phone = process.env.ADMIN_PHONE ?? '+251900000000';
  const password = process.env.ADMIN_PASSWORD ?? 'Admin!change_me_2024';
  const normalized = normalizePhone(phone);

  const existing = await prisma.user.findFirst({
    where: { OR: [{ normalizedPhone: normalized }, { email: 'admin@dlpms.local' }] }
  });

  if (existing) {
    console.log(`Admin user already exists (id=${existing.id}) — skipping creation.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await prisma.user.create({
      data: {
        roleId: adminRole.id,
        phoneNumber: phone,
        normalizedPhone: normalized,
        email: 'admin@dlpms.local',
        passwordHash,
        preferredLanguage: 'en',
        otpVerifiedAt: new Date()
      }
    });
    console.log(`Created admin user id=${admin.id} phone=${phone}`);
    console.log('  (DEV ONLY — change the password before any non-local deployment.)');
  }

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
