import express from 'express';
import prisma from '../config/db.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { countBlockingCheckoutHoldsForTicketTier } from '../services/checkout-reservation.service.js';
import { buildTierCreateData, buildTierUpdateData } from '../utils/tier-input.util.js';
import {
    parseBooleanInput,
    parseRequiredIntegerInput,
    routeInputError
} from '../utils/route-input.util.js';

const router = express.Router();
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const parseRequiredString = (value, fieldName) => {
    const normalized = String(value ?? '').trim();
    if (!normalized) throw routeInputError(`${fieldName} is required`);
    return normalized;
};

const parseOptionalText = (value) => {
    if (value === undefined) return undefined;
    const normalized = String(value ?? '').trim();
    return normalized || null;
};

const findPublishedEvent = (eventId) => prisma.event.findFirst({
    where: {
        id: eventId,
        published: true
    },
    select: { id: true }
});

const countTierOrderReferences = async (tierId) => {
    const rows = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS count
        FROM orders
        WHERE payment_data #>> '{ticketTier,id}' = ${tierId}
    `;

    return Number(rows?.[0]?.count || 0);
};

const featureRouteError = (message, statusCode) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const findAdminEvent = async (req, eventId) => {
    const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, organizerId: true }
    });

    if (!event) throw featureRouteError('Event not found', 404);
    if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
        throw featureRouteError('Not authorized', 403);
    }

    return event;
};

const sendFeatureError = (res, error, fallbackMessage) => {
    res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : fallbackMessage
    });
};

const buildSpeakerCreateData = (body = {}, eventId) => ({
    eventId,
    name: parseRequiredString(body.name, 'Speaker name'),
    title: parseOptionalText(body.title),
    bio: parseOptionalText(body.bio),
    photoUrl: parseOptionalText(body.photoUrl),
    linkedIn: parseOptionalText(body.linkedIn),
    twitter: parseOptionalText(body.twitter),
    sortOrder: hasOwn(body, 'sortOrder')
        ? parseRequiredIntegerInput(body.sortOrder, 'Sort order', 0)
        : 0
});

const buildSpeakerUpdateData = (body = {}) => {
    const data = {};

    if (hasOwn(body, 'name')) data.name = parseRequiredString(body.name, 'Speaker name');
    for (const field of ['title', 'bio', 'photoUrl', 'linkedIn', 'twitter']) {
        if (hasOwn(body, field)) data[field] = parseOptionalText(body[field]);
    }
    if (hasOwn(body, 'sortOrder')) {
        data.sortOrder = parseRequiredIntegerInput(body.sortOrder, 'Sort order', 0);
    }

    if (Object.keys(data).length === 0) throw routeInputError('No supported speaker fields provided');
    return data;
};

const buildReminderCreateData = (body = {}, eventId) => ({
    eventId,
    hoursBeforeEvent: parseRequiredIntegerInput(body.hoursBeforeEvent, 'Hours before event', 0),
    subject: parseRequiredString(body.subject, 'Reminder subject'),
    message: parseRequiredString(body.message, 'Reminder message')
});

const buildReminderUpdateData = (body = {}) => {
    const data = {};

    if (hasOwn(body, 'hoursBeforeEvent')) {
        data.hoursBeforeEvent = parseRequiredIntegerInput(body.hoursBeforeEvent, 'Hours before event', 0);
    }
    if (hasOwn(body, 'subject')) data.subject = parseRequiredString(body.subject, 'Reminder subject');
    if (hasOwn(body, 'message')) data.message = parseRequiredString(body.message, 'Reminder message');
    if (hasOwn(body, 'isActive')) data.isActive = parseBooleanInput(body.isActive, 'Reminder active state');

    if (Object.keys(data).length === 0) throw routeInputError('No supported reminder fields provided');
    return data;
};

// ============================================
// TICKET TIERS
// ============================================

// Get all tiers for an event (public)
router.get('/events/:eventId/tiers', async (req, res) => {
    try {
        const { eventId } = req.params;

        const event = await findPublishedEvent(eventId);
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const tiers = await prisma.ticketTier.findMany({
            where: {
                eventId,
                isActive: true
            },
            orderBy: { sortOrder: 'asc' }
        });

        const tiersWithAvailability = await Promise.all(tiers.map(async (tier) => {
            const heldCount = tier.capacity
                ? await countBlockingCheckoutHoldsForTicketTier(tier.id)
                : 0;
            const reservedCount = tier.soldCount + heldCount;

            return {
                ...tier,
                heldCount,
                reservedCount,
                availableCount: tier.capacity ? Math.max(0, tier.capacity - reservedCount) : null
            };
        }));

        res.json(tiersWithAvailability);
    } catch (error) {
        console.error('Get tiers error:', error);
        res.status(500).json({ error: 'Failed to fetch tiers' });
    }
});

// ============================================
// SPEAKERS
// ============================================

// Get all speakers for an event (public)
router.get('/events/:eventId/speakers', async (req, res) => {
    try {
        const { eventId } = req.params;

        const event = await findPublishedEvent(eventId);
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const speakers = await prisma.speaker.findMany({
            where: { eventId },
            orderBy: { sortOrder: 'asc' }
        });

        res.json(speakers);
    } catch (error) {
        console.error('Get speakers error:', error);
        res.status(500).json({ error: 'Failed to fetch speakers' });
    }
});

// ============================================
// ADMIN ROUTES (Protected)
// ============================================

// --- TICKET TIERS ADMIN ---

// Get all tiers for an event, including inactive admin-managed tiers
router.get('/admin/events/:eventId/tiers', authenticate, async (req, res) => {
    try {
        const { eventId } = req.params;
        await findAdminEvent(req, eventId);

        const tiers = await prisma.ticketTier.findMany({
            where: { eventId },
            orderBy: { sortOrder: 'asc' }
        });

        res.json(tiers);
    } catch (error) {
        console.error('Get admin tiers error:', error);
        sendFeatureError(res, error, 'Failed to fetch tiers');
    }
});

// Create tier
router.post('/admin/events/:eventId/tiers', authenticate, async (req, res) => {
    try {
        const { eventId } = req.params;

        // Verify event ownership
        const event = await prisma.event.findUnique({ where: { id: eventId } });
        if (!event) return res.status(404).json({ error: 'Event not found' });
        if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const tier = await prisma.ticketTier.create({
            data: buildTierCreateData(req.body, eventId)
        });

        res.status(201).json(tier);
    } catch (error) {
        console.error('Create tier error:', error);
        res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Failed to create tier' });
    }
});

// Update tier
router.put('/admin/tiers/:tierId', authenticate, async (req, res) => {
    try {
        const { tierId } = req.params;

        const tier = await prisma.ticketTier.findUnique({
            where: { id: tierId },
            include: { event: true }
        });

        if (!tier) return res.status(404).json({ error: 'Tier not found' });
        if (tier.event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const updated = await prisma.ticketTier.update({
            where: { id: tierId },
            data: buildTierUpdateData(req.body, tier)
        });

        res.json(updated);
    } catch (error) {
        console.error('Update tier error:', error);
        res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Failed to update tier' });
    }
});

// Delete tier
router.delete('/admin/tiers/:tierId', authenticate, async (req, res) => {
    try {
        const { tierId } = req.params;

        const tier = await prisma.ticketTier.findUnique({
            where: { id: tierId },
            include: { event: true }
        });

        if (!tier) return res.status(404).json({ error: 'Tier not found' });
        if (tier.event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const referencedOrders = await countTierOrderReferences(tierId);
        if (tier.soldCount > 0 || referencedOrders > 0) {
            const updatedTier = await prisma.ticketTier.update({
                where: { id: tierId },
                data: { isActive: false }
            });

            return res.json({
                success: true,
                message: 'Tier deactivated because it is referenced by orders',
                tier: updatedTier
            });
        }

        await prisma.ticketTier.delete({ where: { id: tierId } });
        return res.json({ success: true, message: 'Tier deleted' });
    } catch (error) {
        console.error('Delete tier error:', error);
        res.status(500).json({ error: 'Failed to delete tier' });
    }
});

// --- SPEAKERS ADMIN ---

// Get all speakers for an event, including draft/private event speakers
router.get('/admin/events/:eventId/speakers', authenticate, async (req, res) => {
    try {
        const { eventId } = req.params;
        await findAdminEvent(req, eventId);

        const speakers = await prisma.speaker.findMany({
            where: { eventId },
            orderBy: { sortOrder: 'asc' }
        });

        res.json(speakers);
    } catch (error) {
        console.error('Get admin speakers error:', error);
        sendFeatureError(res, error, 'Failed to fetch speakers');
    }
});

// Create speaker
router.post('/admin/events/:eventId/speakers', authenticate, async (req, res) => {
    try {
        const { eventId } = req.params;

        const event = await prisma.event.findUnique({ where: { id: eventId } });
        if (!event) return res.status(404).json({ error: 'Event not found' });
        if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const speaker = await prisma.speaker.create({
            data: buildSpeakerCreateData(req.body, eventId)
        });

        res.status(201).json(speaker);
    } catch (error) {
        console.error('Create speaker error:', error);
        sendFeatureError(res, error, 'Failed to create speaker');
    }
});

// Update speaker
router.put('/admin/speakers/:speakerId', authenticate, async (req, res) => {
    try {
        const { speakerId } = req.params;

        const speaker = await prisma.speaker.findUnique({
            where: { id: speakerId },
            include: { event: true }
        });

        if (!speaker) return res.status(404).json({ error: 'Speaker not found' });
        if (speaker.event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const updated = await prisma.speaker.update({
            where: { id: speakerId },
            data: buildSpeakerUpdateData(req.body)
        });

        res.json(updated);
    } catch (error) {
        console.error('Update speaker error:', error);
        sendFeatureError(res, error, 'Failed to update speaker');
    }
});

// Delete speaker
router.delete('/admin/speakers/:speakerId', authenticate, async (req, res) => {
    try {
        const { speakerId } = req.params;

        const speaker = await prisma.speaker.findUnique({
            where: { id: speakerId },
            include: { event: true }
        });

        if (!speaker) return res.status(404).json({ error: 'Speaker not found' });
        if (speaker.event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await prisma.speaker.delete({ where: { id: speakerId } });
        res.json({ success: true, message: 'Speaker deleted' });
    } catch (error) {
        console.error('Delete speaker error:', error);
        res.status(500).json({ error: 'Failed to delete speaker' });
    }
});

// --- REMINDERS ADMIN ---

// Get reminders for an event
router.get('/admin/events/:eventId/reminders', authenticate, async (req, res) => {
    try {
        const { eventId } = req.params;

        const event = await prisma.event.findUnique({ where: { id: eventId } });
        if (!event) return res.status(404).json({ error: 'Event not found' });
        if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const reminders = await prisma.eventReminder.findMany({
            where: { eventId },
            orderBy: { hoursBeforeEvent: 'desc' }
        });

        res.json(reminders);
    } catch (error) {
        console.error('Get reminders error:', error);
        res.status(500).json({ error: 'Failed to fetch reminders' });
    }
});

// Create reminder
router.post('/admin/events/:eventId/reminders', authenticate, async (req, res) => {
    try {
        const { eventId } = req.params;

        const event = await prisma.event.findUnique({ where: { id: eventId } });
        if (!event) return res.status(404).json({ error: 'Event not found' });
        if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const reminder = await prisma.eventReminder.create({
            data: buildReminderCreateData(req.body, eventId)
        });

        res.status(201).json(reminder);
    } catch (error) {
        console.error('Create reminder error:', error);
        sendFeatureError(res, error, 'Failed to create reminder');
    }
});

// Update reminder
router.put('/admin/reminders/:reminderId', authenticate, async (req, res) => {
    try {
        const { reminderId } = req.params;

        const reminder = await prisma.eventReminder.findUnique({
            where: { id: reminderId },
            include: { event: true }
        });

        if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
        if (reminder.event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const updated = await prisma.eventReminder.update({
            where: { id: reminderId },
            data: buildReminderUpdateData(req.body)
        });

        res.json(updated);
    } catch (error) {
        console.error('Update reminder error:', error);
        sendFeatureError(res, error, 'Failed to update reminder');
    }
});

// Delete reminder
router.delete('/admin/reminders/:reminderId', authenticate, async (req, res) => {
    try {
        const { reminderId } = req.params;

        const reminder = await prisma.eventReminder.findUnique({
            where: { id: reminderId },
            include: { event: true }
        });

        if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
        if (reminder.event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await prisma.eventReminder.delete({ where: { id: reminderId } });
        res.json({ success: true, message: 'Reminder deleted' });
    } catch (error) {
        console.error('Delete reminder error:', error);
        res.status(500).json({ error: 'Failed to delete reminder' });
    }
});

export default router;
