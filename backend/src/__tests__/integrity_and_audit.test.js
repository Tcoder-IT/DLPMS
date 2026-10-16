const request = require('supertest');
const app = require('../app');
const prisma = require('../config/db');
const { verifyAuditChain, recordAuditLog } = require('../services/auditService');

describe('Priority A: Data Integrity, Ownership Transactions & Cryptographic Audit Chain', () => {
    let adminToken;
    let officerToken;
    let citizenToken;
    let officerUser;
    let citizenOwner;
    let buyerOwner;
    let testParcel;

    beforeAll(async () => {
        // 1. Authenticate users
        const adminLogin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@dlpms.gov.et', password: 'Admin@123' });
        adminToken = adminLogin.body.accessToken;

        const officerLogin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'officer@dlpms.gov.et', password: 'Password@123' });
        officerToken = officerLogin.body.accessToken;

        const citizenLogin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'citizen@dlpms.gov.et', password: 'Password@123' });
        citizenToken = citizenLogin.body.accessToken;

        officerUser = await prisma.user.findUnique({
            where: { email: 'officer@dlpms.gov.et' }
        });

        citizenOwner = await prisma.owner.findFirst({
            where: { user: { email: 'citizen@dlpms.gov.et' } }
        });

        buyerOwner = await prisma.owner.findFirst({
            where: { nationalId: 'ET-DD-584920' }
        });

        // Ensure or create an isolated test parcel for integrity testing
        testParcel = await prisma.landParcel.upsert({
            where: { parcelNumber: 'DD-INTEGRITY-001' },
            update: { currentOwnerId: citizenOwner.ownerId, status: 'ACTIVE' },
            create: {
                parcelNumber: 'DD-INTEGRITY-001',
                currentOwnerId: citizenOwner.ownerId,
                sizeSqm: 500,
                landUseType: 'COMMERCIAL',
                kebele: 'Kebele 03',
                status: 'ACTIVE'
            }
        });

        // Reset audit log table so verification tests the canonical chain from genesis
        await prisma.auditLog.deleteMany({});
    });

    afterAll(async () => {
        // Clean up test records
        await prisma.ownershipHistory.deleteMany({
            where: { parcelId: testParcel.parcelId }
        });
        await prisma.transferRequest.deleteMany({
            where: { parcelId: testParcel.parcelId }
        });
        await prisma.auditLog.deleteMany({});
        await prisma.$disconnect();
    });

    describe('Transactional Transfer Approval & History Tracking', () => {
        let validTransfer;

        beforeEach(async () => {
            // Ensure parcel is currently owned by citizen
            await prisma.landParcel.update({
                where: { parcelId: testParcel.parcelId },
                data: { currentOwnerId: citizenOwner.ownerId }
            });

            // Create a fresh UNDER_REVIEW transfer
            validTransfer = await prisma.transferRequest.create({
                data: {
                    trackingId: 'TRK-INT-' + Date.now(),
                    parcelId: testParcel.parcelId,
                    sellerId: citizenOwner.ownerId,
                    buyerId: buyerOwner.ownerId,
                    salePrice: 1500000,
                    status: 'UNDER_REVIEW',
                    documents: ['sale_contract.pdf']
                }
            });
        });

        it('should atomically approve transfer, update parcel owner, and record OwnershipHistory', async () => {
            const res = await request(app)
                .put(`/api/officer/transfer/${validTransfer.requestId}/approve`)
                .set('Authorization', `Bearer ${officerToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.transfer.status).toEqual('APPROVED');
            expect(res.body.transfer.approvedByOfficerId).toEqual(officerUser.userId);

            // Verify parcel owner in database
            const updatedParcel = await prisma.landParcel.findUnique({
                where: { parcelId: testParcel.parcelId }
            });
            expect(updatedParcel.currentOwnerId).toEqual(buyerOwner.ownerId);

            // Verify OwnershipHistory entry was created
            const history = await prisma.ownershipHistory.findFirst({
                where: { transferRequestId: validTransfer.requestId }
            });
            expect(history).not.toBeNull();
            expect(history.previousOwnerId).toEqual(citizenOwner.ownerId);
            expect(history.newOwnerId).toEqual(buyerOwner.ownerId);
            expect(history.transferPrice).toEqual(1500000);
            expect(history.recordedByUserId).toEqual(officerUser.userId);
        });

        it('should reject re-approval of an already APPROVED transfer with 400', async () => {
            // First approval
            await request(app)
                .put(`/api/officer/transfer/${validTransfer.requestId}/approve`)
                .set('Authorization', `Bearer ${officerToken}`);

            // Second approval attempt
            const res = await request(app)
                .put(`/api/officer/transfer/${validTransfer.requestId}/approve`)
                .set('Authorization', `Bearer ${officerToken}`);

            expect(res.statusCode).toEqual(400);
            expect(res.body.error).toMatch(/Cannot approve transfer: current status is APPROVED/i);
        });

        it('should prevent conflicting transfers if seller is no longer the legal owner', async () => {
            // Transfer parcel away to buyer
            await prisma.landParcel.update({
                where: { parcelId: testParcel.parcelId },
                data: { currentOwnerId: buyerOwner.ownerId }
            });

            // Try to approve a transfer where citizenOwner is the seller
            const res = await request(app)
                .put(`/api/officer/transfer/${validTransfer.requestId}/approve`)
                .set('Authorization', `Bearer ${officerToken}`);

            expect(res.statusCode).toEqual(400);
            expect(res.body.error).toMatch(/Ownership mismatch: Seller/i);
        });
    });

    describe('Cryptographic Audit Chain Integrity & Tamper Detection', () => {
        it('should verify that uncorrupted audit chain passes verification', async () => {
            // Add a couple of valid audit entries
            await recordAuditLog({
                userId: officerUser.userId,
                action: 'VERIFY_CADASTRAL_BOUNDARY',
                entityType: 'LandParcel',
                entityId: testParcel.parcelId,
                newValue: { verified: true, surveyor: 'Abebe' }
            });

            const report = await verifyAuditChain();
            expect(report.isValid).toBe(true);
            expect(report.brokenAtLogId).toBeNull();
            expect(report.error).toBeNull();
        });

        it('should allow admin to verify audit chain via GET /api/admin/audit-logs/verify', async () => {
            const res = await request(app)
                .get('/api/admin/audit-logs/verify')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('isValid');
            expect(res.body.isValid).toBe(true);
        });

        it('should detect database tampering when an audit log content is modified', async () => {
            // 1. Record an audit log
            const log = await recordAuditLog({
                userId: officerUser.userId,
                action: 'CONFIDENTIAL_NOTE',
                entityType: 'Note',
                entityId: 'note-101',
                newValue: { text: 'Legitimate original content' }
            });

            expect(log).not.toBeNull();

            // 2. Artificially tamper with the database row directly
            await prisma.auditLog.update({
                where: { logId: log.logId },
                data: { newValue: { text: 'TAMPERED FORGED CONTENT' } }
            });

            // 3. Verify audit chain detects the alteration
            const report = await verifyAuditChain();
            expect(report.isValid).toBe(false);
            expect(report.brokenAtLogId).toEqual(log.logId);
            expect(report.error).toMatch(/Content tampering detected/i);

            // Restore the row so subsequent checks remain clean
            await prisma.auditLog.update({
                where: { logId: log.logId },
                data: { newValue: { text: 'Legitimate original content' } }
            });
        });
    });
});
