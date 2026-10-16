const request = require('supertest');
const app = require('../app');
const prisma = require('../config/db');

describe('DLPMS Authentication & Citizen API Integration Tests', () => {
    beforeAll(async () => {
        const citizenOwner = await prisma.owner.findFirst({
            where: { user: { email: 'citizen@dlpms.gov.et' } }
        });
        if (citizenOwner) {
            const parcel = await prisma.landParcel.findFirst();
            if (parcel) {
                await prisma.landParcel.update({
                    where: { parcelId: parcel.parcelId },
                    data: { currentOwnerId: citizenOwner.ownerId }
                });
            }
        }
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    describe('GET /health', () => {
        it('should return 200 and healthy status', async () => {
            const res = await request(app).get('/health');
            expect(res.statusCode).toEqual(200);
            expect(res.body.status).toEqual('OK');
        });
    });

    describe('POST /api/auth/login', () => {
        it('should successfully log in with valid admin credentials', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'admin@dlpms.gov.et',
                    password: 'Admin@123'
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('accessToken');
            expect(res.body).toHaveProperty('refreshToken');
        });

        it('should successfully log in with valid citizen credentials', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'citizen@dlpms.gov.et',
                    password: 'Password@123'
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('accessToken');
        });

        it('should reject invalid password with 401', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'admin@dlpms.gov.et',
                    password: 'WrongPassword!'
                });

            expect(res.statusCode).toEqual(401);
            expect(res.body).toHaveProperty('error');
        });

        it('should reject non-existent user with 401', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'ghost@dlpms.gov.et',
                    password: 'Password@123'
                });

            expect(res.statusCode).toEqual(401);
        });
    });

    describe('GET /api/citizen/parcels', () => {
        it('should reject unauthenticated request with 401', async () => {
            const res = await request(app).get('/api/citizen/parcels');
            expect(res.statusCode).toEqual(401);
        });

        it('should return parcels for authenticated citizen', async () => {
            // 1. Login as citizen
            const loginRes = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'citizen@dlpms.gov.et',
                    password: 'Password@123'
                });

            const token = loginRes.body.accessToken;

            // 2. Fetch parcels
            const parcelsRes = await request(app)
                .get('/api/citizen/parcels')
                .set('Authorization', `Bearer ${token}`);

            expect(parcelsRes.statusCode).toEqual(200);
            expect(Array.isArray(parcelsRes.body)).toBe(true);
            expect(parcelsRes.body.length).toBeGreaterThanOrEqual(1);
            expect(parcelsRes.body[0]).toHaveProperty('parcelNumber');
            expect(parcelsRes.body[0]).toHaveProperty('sizeSqm');
        });
    });

    describe('GET /api/officer/transfers/pending', () => {
        it('should reject citizen role from accessing officer route with 403', async () => {
            const loginRes = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'citizen@dlpms.gov.et',
                    password: 'Password@123'
                });

            const token = loginRes.body.accessToken;

            const res = await request(app)
                .get('/api/officer/transfers/pending')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toEqual(403);
        });

        it('should allow officer role to access pending transfers', async () => {
            const loginRes = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'officer@dlpms.gov.et',
                    password: 'Password@123'
                });

            const token = loginRes.body.accessToken;

            const res = await request(app)
                .get('/api/officer/transfers/pending')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toEqual(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });
});
