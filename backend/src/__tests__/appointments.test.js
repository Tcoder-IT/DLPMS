const request = require('supertest');
const app = require('../app');
const prisma = require('../config/db');

describe('Priority B: Appointment Scheduling', () => {
    let citizenToken;
    let officerToken;
    let citizenUserId;
    let officerUserId;
    let futureSlot;
    let createdAppointmentId;

    beforeAll(async () => {
        const citizenLogin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'citizen@dlpms.gov.et', password: 'Password@123' });
        citizenToken = citizenLogin.body.accessToken;

        const officerLogin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'officer@dlpms.gov.et', password: 'Password@123' });
        officerToken = officerLogin.body.accessToken;

        const citizenUser = await prisma.user.findUnique({ where: { email: 'citizen@dlpms.gov.et' } });
        citizenUserId = citizenUser.userId;

        const officerUser = await prisma.user.findUnique({ where: { email: 'officer@dlpms.gov.et' } });
        officerUserId = officerUser.userId;

        // Use a far-future slot: 30 days from now at 09:00 AM
        const d = new Date();
        d.setDate(d.getDate() + 30);
        d.setHours(9, 0, 0, 0);
        futureSlot = d.toISOString();

        // Clear any test appointments that might interfere with slot checks
        await prisma.appointment.deleteMany({
            where: {
                OR: [
                    { citizenId: citizenUserId, status: { in: ['BOOKED', 'CONFIRMED'] } },
                    { officerId: officerUserId, dateTime: new Date(futureSlot) }
                ]
            }
        });
    });

    afterAll(async () => {
        // Clean up test appointments
        await prisma.appointment.deleteMany({
            where: {
                OR: [
                    { citizenId: citizenUserId },
                    { officerId: officerUserId, dateTime: { gte: new Date() } }
                ]
            }
        });
        await prisma.$disconnect();
    });

    describe('Officer Discovery & Slot Query', () => {
        it('GET /api/appointments/officers — should list all active land officers', async () => {
            const res = await request(app)
                .get('/api/appointments/officers')
                .set('Authorization', `Bearer ${citizenToken}`);
            expect(res.statusCode).toEqual(200);
            expect(Array.isArray(res.body)).toBe(true);
            const officer = res.body.find(o => o.userId === officerUserId);
            expect(officer).toBeDefined();
        });

        it('GET /api/appointments/officers/:id/slots — should return empty slots for a free day', async () => {
            const d = new Date(futureSlot);
            const dateStr = d.toISOString().split('T')[0];
            const res = await request(app)
                .get(`/api/appointments/officers/${officerUserId}/slots?date=${dateStr}`)
                .set('Authorization', `Bearer ${citizenToken}`);
            expect(res.statusCode).toEqual(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });

    describe('Citizen Booking', () => {
        it('should book a future appointment successfully', async () => {
            const res = await request(app)
                .post('/api/appointments')
                .set('Authorization', `Bearer ${citizenToken}`)
                .send({ officerId: officerUserId, serviceType: 'LAND_REGISTRATION', dateTime: futureSlot });

            expect(res.statusCode).toEqual(201);
            expect(res.body.appointment.status).toEqual('BOOKED');
            expect(res.body.appointment.citizenId).toEqual(citizenUserId);
            createdAppointmentId = res.body.appointment.appointmentId;
        });

        it('should block booking a past date (400)', async () => {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1);

            const res = await request(app)
                .post('/api/appointments')
                .set('Authorization', `Bearer ${citizenToken}`)
                .send({ officerId: officerUserId, serviceType: 'TAX_QUERY', dateTime: pastDate.toISOString() });

            expect(res.statusCode).toEqual(400);
        });

        it('should prevent double-booking officer at the same slot (409)', async () => {
            const res = await request(app)
                .post('/api/appointments')
                .set('Authorization', `Bearer ${citizenToken}`)
                .send({ officerId: officerUserId, serviceType: 'DOCUMENT_VERIFICATION', dateTime: futureSlot });

            expect(res.statusCode).toEqual(409);
            expect(res.body.error).toMatch(/already booked/i);
        });

        it('should reject booking with an invalid officer ID (400)', async () => {
            const res = await request(app)
                .post('/api/appointments')
                .set('Authorization', `Bearer ${citizenToken}`)
                .send({ officerId: '00000000-0000-0000-0000-000000000000', serviceType: 'TAX_QUERY', dateTime: futureSlot });

            expect(res.statusCode).toEqual(400);
            expect(res.body.error).toMatch(/valid active land officer/i);
        });
    });

    describe('Citizen Viewing & Cancellation', () => {
        it('GET /api/appointments/my — citizen sees own appointments', async () => {
            const res = await request(app)
                .get('/api/appointments/my')
                .set('Authorization', `Bearer ${citizenToken}`);
            expect(res.statusCode).toEqual(200);
            expect(Array.isArray(res.body)).toBe(true);
            const found = res.body.find(a => a.appointmentId === createdAppointmentId);
            expect(found).toBeDefined();
        });

        it('should cancel the appointment successfully', async () => {
            const res = await request(app)
                .put(`/api/appointments/${createdAppointmentId}/cancel`)
                .set('Authorization', `Bearer ${citizenToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.appointment.status).toEqual('CANCELLED');
        });

        it('should reject cancelling an already-cancelled appointment (400)', async () => {
            const res = await request(app)
                .put(`/api/appointments/${createdAppointmentId}/cancel`)
                .set('Authorization', `Bearer ${citizenToken}`);
            expect(res.statusCode).toEqual(400);
        });
    });

    describe('Officer Queue & Workflow', () => {
        let officerTestApptId;

        beforeAll(async () => {
            // Book a new appointment for officer workflow testing
            const d2 = new Date();
            d2.setDate(d2.getDate() + 31);
            d2.setHours(10, 0, 0, 0);

            const appt = await prisma.appointment.create({
                data: {
                    citizenId: citizenUserId,
                    officerId: officerUserId,
                    serviceType: 'TRANSFER_APPROVAL',
                    dateTime: d2,
                    status: 'BOOKED'
                }
            });
            officerTestApptId = appt.appointmentId;
        });

        it('GET /api/appointments/queue — officer sees their appointments', async () => {
            const res = await request(app)
                .get('/api/appointments/queue')
                .set('Authorization', `Bearer ${officerToken}`);
            expect(res.statusCode).toEqual(200);
            expect(Array.isArray(res.body)).toBe(true);
            const found = res.body.find(a => a.appointmentId === officerTestApptId);
            expect(found).toBeDefined();
            expect(found.citizen?.owner?.fullName).toBeDefined();
        });

        it('citizen cannot access officer queue (403)', async () => {
            const res = await request(app)
                .get('/api/appointments/queue')
                .set('Authorization', `Bearer ${citizenToken}`);
            expect(res.statusCode).toEqual(403);
        });

        it('officer can confirm a BOOKED appointment', async () => {
            const res = await request(app)
                .put(`/api/appointments/${officerTestApptId}/confirm`)
                .set('Authorization', `Bearer ${officerToken}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.appointment.status).toEqual('CONFIRMED');
        });

        it('officer can mark appointment as COMPLETED', async () => {
            const res = await request(app)
                .put(`/api/appointments/${officerTestApptId}/outcome`)
                .set('Authorization', `Bearer ${officerToken}`)
                .send({ outcome: 'COMPLETED' });
            expect(res.statusCode).toEqual(200);
            expect(res.body.appointment.status).toEqual('COMPLETED');
        });

        it('officer cannot mark an already COMPLETED appointment (400)', async () => {
            const res = await request(app)
                .put(`/api/appointments/${officerTestApptId}/outcome`)
                .set('Authorization', `Bearer ${officerToken}`)
                .send({ outcome: 'NO_SHOW' });
            expect(res.statusCode).toEqual(400);
        });
    });
});
