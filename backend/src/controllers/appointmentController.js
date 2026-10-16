const prisma = require('../config/db');

const SLOT_DURATION_MINUTES = 30;

/**
 * Checks if two date windows overlap.
 * Each window is [start, start + SLOT_DURATION_MINUTES).
 */
function slotsOverlap(dateA, dateB) {
    const start1 = new Date(dateA).getTime();
    const end1 = start1 + SLOT_DURATION_MINUTES * 60 * 1000;
    const start2 = new Date(dateB).getTime();
    const end2 = start2 + SLOT_DURATION_MINUTES * 60 * 1000;
    return start1 < end2 && start2 < end1;
}

// ─── CITIZEN: Book Appointment ────────────────────────────────────────────────
exports.bookAppointment = async (req, res) => {
    try {
        const { officerId, serviceType, dateTime } = req.body;
        const slotDate = new Date(dateTime);
        const now = new Date();

        // 1. Must be in the future
        if (slotDate <= now) {
            return res.status(400).json({ error: 'Appointment must be scheduled in the future' });
        }

        // 2. Officer must be an active LAND_OFFICER
        const officer = await prisma.user.findUnique({ where: { userId: officerId } });
        if (!officer || !officer.isActive || officer.role !== 'LAND_OFFICER') {
            return res.status(400).json({ error: 'Selected officer is not a valid active land officer' });
        }

        // 3. Prevent double-booking: officer cannot have another BOOKED/CONFIRMED slot overlapping this one
        const officerConflicts = await prisma.appointment.findMany({
            where: {
                officerId,
                status: { in: ['BOOKED', 'CONFIRMED'] }
            }
        });
        const officerBlocked = officerConflicts.some(a => slotsOverlap(a.dateTime, slotDate));
        if (officerBlocked) {
            return res.status(409).json({
                error: `Officer is already booked at this time slot. Please choose a different time.`
            });
        }

        // 4. Citizen cannot have overlapping appointments either
        const citizenConflicts = await prisma.appointment.findMany({
            where: {
                citizenId: req.user.userId,
                status: { in: ['BOOKED', 'CONFIRMED'] }
            }
        });
        const citizenBlocked = citizenConflicts.some(a => slotsOverlap(a.dateTime, slotDate));
        if (citizenBlocked) {
            return res.status(409).json({
                error: 'You already have an appointment overlapping this time slot.'
            });
        }

        const appointment = await prisma.appointment.create({
            data: {
                citizenId: req.user.userId,
                officerId,
                serviceType,
                dateTime: slotDate,
                status: 'BOOKED'
            },
            include: {
                officer: { select: { email: true } }
            }
        });

        res.status(201).json({ message: 'Appointment booked successfully', appointment });
    } catch (error) {
        console.error('bookAppointment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ─── CITIZEN: Get Own Appointments ───────────────────────────────────────────
exports.getMyAppointments = async (req, res) => {
    try {
        const appointments = await prisma.appointment.findMany({
            where: { citizenId: req.user.userId },
            orderBy: { dateTime: 'asc' },
            include: {
                officer: { select: { email: true, owner: { select: { fullName: true } } } }
            }
        });
        res.status(200).json(appointments);
    } catch (error) {
        console.error('getMyAppointments error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ─── CITIZEN: Cancel Appointment ─────────────────────────────────────────────
exports.cancelAppointment = async (req, res) => {
    try {
        const { appointmentId } = req.params;

        const appt = await prisma.appointment.findUnique({ where: { appointmentId } });
        if (!appt) {
            return res.status(404).json({ error: 'Appointment not found' });
        }
        if (appt.citizenId !== req.user.userId) {
            return res.status(403).json({ error: 'You can only cancel your own appointments' });
        }
        if (!['BOOKED', 'CONFIRMED'].includes(appt.status)) {
            return res.status(400).json({ error: `Cannot cancel appointment with status: ${appt.status}` });
        }

        // Must cancel at least 1 hour before the slot
        const now = new Date();
        const cutoff = new Date(appt.dateTime.getTime() - 60 * 60 * 1000);
        if (now > cutoff) {
            return res.status(400).json({
                error: 'Appointments can only be cancelled at least 1 hour before the scheduled time'
            });
        }

        const updated = await prisma.appointment.update({
            where: { appointmentId },
            data: { status: 'CANCELLED' }
        });
        res.status(200).json({ message: 'Appointment cancelled successfully', appointment: updated });
    } catch (error) {
        console.error('cancelAppointment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ─── CITIZEN/PUBLIC: Get Available Officers ───────────────────────────────────
exports.getAvailableOfficers = async (req, res) => {
    try {
        const officers = await prisma.user.findMany({
            where: { role: 'LAND_OFFICER', isActive: true },
            select: {
                userId: true,
                email: true,
                owner: { select: { fullName: true } }
            }
        });
        res.status(200).json(officers);
    } catch (error) {
        console.error('getAvailableOfficers error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ─── CITIZEN: Get Officer Booked Slots ────────────────────────────────────────
exports.getOfficerBookedSlots = async (req, res) => {
    try {
        const { officerId } = req.params;
        const { date } = req.query; // yyyy-mm-dd

        let where = {
            officerId,
            status: { in: ['BOOKED', 'CONFIRMED'] }
        };

        if (date) {
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);
            where.dateTime = { gte: dayStart, lte: dayEnd };
        }

        const slots = await prisma.appointment.findMany({
            where,
            select: { dateTime: true, status: true }
        });
        res.status(200).json(slots);
    } catch (error) {
        console.error('getOfficerBookedSlots error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ─── OFFICER: Get Officer's Appointment Queue ─────────────────────────────────
exports.getOfficerAppointments = async (req, res) => {
    try {
        const { status, date } = req.query;
        let where = { officerId: req.user.userId };
        if (status) where.status = status;
        if (date) {
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);
            where.dateTime = { gte: dayStart, lte: dayEnd };
        }

        const appointments = await prisma.appointment.findMany({
            where,
            orderBy: { dateTime: 'asc' },
            include: {
                citizen: {
                    select: {
                        email: true,
                        owner: { select: { fullName: true, nationalId: true, phone: true } }
                    }
                }
            }
        });
        res.status(200).json(appointments);
    } catch (error) {
        console.error('getOfficerAppointments error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ─── OFFICER: Confirm Appointment ────────────────────────────────────────────
exports.confirmAppointment = async (req, res) => {
    try {
        const { appointmentId } = req.params;

        const appt = await prisma.appointment.findUnique({ where: { appointmentId } });
        if (!appt) return res.status(404).json({ error: 'Appointment not found' });
        if (appt.officerId !== req.user.userId) {
            return res.status(403).json({ error: 'You can only confirm your own appointments' });
        }
        if (appt.status !== 'BOOKED') {
            return res.status(400).json({ error: `Cannot confirm appointment with status: ${appt.status}` });
        }

        const updated = await prisma.appointment.update({
            where: { appointmentId },
            data: { status: 'CONFIRMED' }
        });
        res.status(200).json({ message: 'Appointment confirmed', appointment: updated });
    } catch (error) {
        console.error('confirmAppointment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ─── OFFICER: Mark Complete or No-Show ───────────────────────────────────────
exports.updateAppointmentOutcome = async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const { outcome } = req.body; // 'COMPLETED' | 'NO_SHOW'

        if (!['COMPLETED', 'NO_SHOW'].includes(outcome)) {
            return res.status(400).json({ error: "outcome must be 'COMPLETED' or 'NO_SHOW'" });
        }

        const appt = await prisma.appointment.findUnique({ where: { appointmentId } });
        if (!appt) return res.status(404).json({ error: 'Appointment not found' });
        if (appt.officerId !== req.user.userId) {
            return res.status(403).json({ error: 'You can only update outcomes for your own appointments' });
        }
        if (!['BOOKED', 'CONFIRMED'].includes(appt.status)) {
            return res.status(400).json({ error: `Cannot update outcome for appointment with status: ${appt.status}` });
        }

        const updated = await prisma.appointment.update({
            where: { appointmentId },
            data: { status: outcome }
        });
        res.status(200).json({ message: `Appointment marked as ${outcome}`, appointment: updated });
    } catch (error) {
        console.error('updateAppointmentOutcome error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
