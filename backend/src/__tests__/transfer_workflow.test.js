const request = require('supertest');
const app = require('../app');
const prisma = require('../config/db');

describe('End-to-End Land Transfer Workflow Integration Test', () => {
    let citizenToken;
    let officerToken;
    let citizenParcel;
    let buyerOwner;
    let citizenOwner;
    let createdTrackingId;
    let createdRequestId;

    beforeAll(async () => {
        // 1. Citizen login
        const citizenLogin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'citizen@dlpms.gov.et', password: 'Password@123' });
        citizenToken = citizenLogin.body.accessToken;

        // 2. Officer login
        const officerLogin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'officer@dlpms.gov.et', password: 'Password@123' });
        officerToken = officerLogin.body.accessToken;

        // 3. Ensure citizen owns a test parcel
        citizenOwner = await prisma.owner.findFirst({
            where: { user: { email: 'citizen@dlpms.gov.et' } }
        });
        buyerOwner = await prisma.owner.findFirst({
            where: { nationalId: 'ET-DD-584920' }
        });

        let parcel = await prisma.landParcel.findFirst({
            where: { parcelNumber: 'DD-PAR-9021' }
        });

        if (parcel && citizenOwner) {
            await prisma.landParcel.update({
                where: { parcelId: parcel.parcelId },
                data: { currentOwnerId: citizenOwner.ownerId }
            });
        }

        // 4. Fetch citizen parcels via API
        const parcelsRes = await request(app)
            .get('/api/citizen/parcels')
            .set('Authorization', `Bearer ${citizenToken}`);
        citizenParcel = parcelsRes.body[0];
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('Step 1: Citizen submits a land transfer application', async () => {
        expect(citizenParcel).toBeDefined();
        expect(buyerOwner).toBeDefined();

        const transferPayload = {
            parcelId: citizenParcel.parcelId,
            buyerNationalId: buyerOwner.nationalId,
            salePrice: 2200000,
            documents: ['deed_contract.pdf', 'kebele_tax_receipt.pdf']
        };

        const res = await request(app)
            .post('/api/citizen/transfer')
            .set('Authorization', `Bearer ${citizenToken}`)
            .send(transferPayload);

        expect(res.statusCode).toEqual(201);
        expect(res.body).toHaveProperty('trackingId');
        expect(res.body).toHaveProperty('requestId');

        createdTrackingId = res.body.trackingId;
        createdRequestId = res.body.requestId;
    });

    it('Step 2: Citizen can track the status by trackingId', async () => {
        expect(createdTrackingId).toBeDefined();

        const res = await request(app)
            .get(`/api/citizen/status/${createdTrackingId}`)
            .set('Authorization', `Bearer ${citizenToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body.trackingId).toEqual(createdTrackingId);
        expect(res.body.status).toEqual('UNDER_REVIEW');
    });

    it('Step 3: Land Officer views the pending transfer in review queue', async () => {
        const res = await request(app)
            .get('/api/officer/transfers/pending')
            .set('Authorization', `Bearer ${officerToken}`);

        expect(res.statusCode).toEqual(200);
        const found = res.body.find(t => t.trackingId === createdTrackingId);
        expect(found).toBeDefined();
    });

    it('Step 4: Land Officer approves the transfer, updating legal title ownership', async () => {
        expect(createdRequestId).toBeDefined();

        const res = await request(app)
            .put(`/api/officer/transfer/${createdRequestId}/approve`)
            .set('Authorization', `Bearer ${officerToken}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body.transfer.status).toEqual('APPROVED');

        // Verify parcel ownership updated in database
        const updatedParcel = await prisma.landParcel.findUnique({
            where: { parcelId: citizenParcel.parcelId }
        });
        expect(updatedParcel.currentOwnerId).toEqual(buyerOwner.ownerId);
    });
});
