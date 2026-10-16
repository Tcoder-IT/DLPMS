const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with synthetic demo data for Dire Dawa DLPMS...');
  const commonPassword = await bcrypt.hash('Password@123', 12);
  const adminPassword = await bcrypt.hash('Admin@123', 12);

  // 1. Create Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@dlpms.gov.et' },
    update: { passwordHash: adminPassword },
    create: {
      email: 'admin@dlpms.gov.et',
      phone: '+251911123456',
      passwordHash: adminPassword,
      role: 'ADMIN',
    },
  });

  // 2. Create Land Officer
  const officer = await prisma.user.upsert({
    where: { email: 'officer@dlpms.gov.et' },
    update: { passwordHash: commonPassword },
    create: {
      email: 'officer@dlpms.gov.et',
      phone: '+251911223344',
      passwordHash: commonPassword,
      role: 'LAND_OFFICER',
    },
  });

  // 3. Create Tax Official
  const taxOfficial = await prisma.user.upsert({
    where: { email: 'tax@dlpms.gov.et' },
    update: { passwordHash: commonPassword },
    create: {
      email: 'tax@dlpms.gov.et',
      phone: '+251911334455',
      passwordHash: commonPassword,
      role: 'TAX_OFFICIAL',
    },
  });

  // 4. Create GIS Officer
  const gisOfficer = await prisma.user.upsert({
    where: { email: 'gis@dlpms.gov.et' },
    update: { passwordHash: commonPassword },
    create: {
      email: 'gis@dlpms.gov.et',
      phone: '+251911445566',
      passwordHash: commonPassword,
      role: 'GIS_OFFICER',
    },
  });

  // 5. Create Citizen User 1 (Kebede Kassaye)
  const citizenUser = await prisma.user.upsert({
    where: { email: 'citizen@dlpms.gov.et' },
    update: { passwordHash: commonPassword },
    create: {
      email: 'citizen@dlpms.gov.et',
      phone: '+251911556677',
      passwordHash: commonPassword,
      role: 'CITIZEN',
    },
  });

  const citizenOwner = await prisma.owner.upsert({
    where: { userId: citizenUser.userId },
    update: {},
    create: {
      userId: citizenUser.userId,
      fullName: 'Kebede Kassaye',
      nationalId: 'ET-DD-102938',
      phone: '+251911556677',
      address: 'Kebele 02, Dire Dawa',
    },
  });

  // 6. Create Citizen User 2 (Teshager Hilfu - Buyer)
  const buyerUser = await prisma.user.upsert({
    where: { email: 'buyer@dlpms.gov.et' },
    update: { passwordHash: commonPassword },
    create: {
      email: 'buyer@dlpms.gov.et',
      phone: '+251911667788',
      passwordHash: commonPassword,
      role: 'CITIZEN',
    },
  });

  const buyerOwner = await prisma.owner.upsert({
    where: { userId: buyerUser.userId },
    update: {},
    create: {
      userId: buyerUser.userId,
      fullName: 'Teshager Hilfu',
      nationalId: 'ET-DD-584920',
      phone: '+251911667788',
      address: 'Kebele 01, Sabian, Dire Dawa',
    },
  });

  // 7. Create Land Parcels
  const parcel1 = await prisma.landParcel.upsert({
    where: { parcelNumber: 'DD-PAR-9021' },
    update: {},
    create: {
      parcelNumber: 'DD-PAR-9021',
      currentOwnerId: citizenOwner.ownerId,
      sizeSqm: 320.0,
      landUseType: 'RESIDENTIAL',
      kebele: 'Kebele 02',
      status: 'ACTIVE',
    },
  });

  const parcel2 = await prisma.landParcel.upsert({
    where: { parcelNumber: 'DD-PAR-1102' },
    update: {},
    create: {
      parcelNumber: 'DD-PAR-1102',
      currentOwnerId: citizenOwner.ownerId,
      sizeSqm: 930.0,
      landUseType: 'COMMERCIAL',
      kebele: 'Kebele 01',
      status: 'ACTIVE',
    },
  });

  const parcel3 = await prisma.landParcel.upsert({
    where: { parcelNumber: 'DD-PAR-4452' },
    update: {},
    create: {
      parcelNumber: 'DD-PAR-4452',
      currentOwnerId: buyerOwner.ownerId,
      sizeSqm: 450.0,
      landUseType: 'INDUSTRIAL',
      kebele: 'Melka Jebdu',
      status: 'ACTIVE',
    },
  });

  // 8. Create Tax Records
  const existingTax1 = await prisma.taxRecord.findFirst({
    where: { parcelId: parcel1.parcelId, taxYear: 2024 },
  });
  if (!existingTax1) {
    await prisma.taxRecord.create({
      data: {
        parcelId: parcel1.parcelId,
        taxYear: 2024,
        baseAmount: 1250.0,
        surcharge: 0,
        penalty: 0,
        totalAmount: 1250.0,
        paidAmount: 0,
        status: 'UNPAID',
      },
    });
  }

  const existingTax2 = await prisma.taxRecord.findFirst({
    where: { parcelId: parcel1.parcelId, taxYear: 2023 },
  });
  if (!existingTax2) {
    await prisma.taxRecord.create({
      data: {
        parcelId: parcel1.parcelId,
        taxYear: 2023,
        baseAmount: 1250.0,
        surcharge: 0,
        penalty: 0,
        totalAmount: 1250.0,
        paidAmount: 1250.0,
        status: 'PAID',
        paymentDate: new Date('2023-11-15'),
        receiptNumber: 'RCP-2023-8821',
      },
    });
  }

  // 9. Create Transfer Request
  const existingTransfer = await prisma.transferRequest.findUnique({
    where: { trackingId: 'TRK-98B2A1F0' },
  });
  if (!existingTransfer) {
    await prisma.transferRequest.create({
      data: {
        trackingId: 'TRK-98B2A1F0',
        parcelId: parcel2.parcelId,
        sellerId: citizenOwner.ownerId,
        buyerId: buyerOwner.ownerId,
        salePrice: 1850000.0,
        status: 'UNDER_REVIEW',
        documents: ['https://mock-storage.com/id-kebede.pdf', 'https://mock-storage.com/agreement-98b2.pdf'],
        officerComments: 'Initial verification pending deed review',
      },
    });
  }

  console.log('Seed completed successfully!');
  console.log('Default credentials:');
  console.log('  Admin:       admin@dlpms.gov.et   / Admin@123');
  console.log('  Officer:     officer@dlpms.gov.et / Password@123');
  console.log('  Tax:         tax@dlpms.gov.et     / Password@123');
  console.log('  GIS:         gis@dlpms.gov.et     / Password@123');
  console.log('  Citizen:     citizen@dlpms.gov.et / Password@123');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
