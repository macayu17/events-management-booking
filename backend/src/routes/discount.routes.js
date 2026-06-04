import express from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../config/db.js';
import { authenticate, requireOrganizer } from '../middleware/auth.middleware.js';
import {
    parseNullableDateInput,
    parseNullableIntegerInput,
    routeInputError
} from '../utils/route-input.util.js';
import {
    hasValidDiscountAmount,
    normalizeDiscountAmountForStorage
} from '../utils/registration-pricing.util.js';

const router = express.Router();

// Validate discount code (Public/User)
router.post('/validate', [
    body('eventId').notEmpty(),
    body('code').notEmpty()
], async (req, res) => {
    const { eventId, code } = req.body;
    const normalizedCode = String(code || '').trim().toUpperCase();

    try {
        const discount = await prisma.discountCode.findUnique({
            where: {
                eventId_code: {
                    eventId,
                    code: normalizedCode
                }
            },
            include: {
                event: {
                    select: {
                        published: true,
                        startTime: true
                    }
                }
            }
        });

        if (!discount || !discount.isActive || !discount.event?.published) {
            return res.status(404).json({ error: 'Invalid discount code' });
        }

        // checks
        const now = new Date();
        if (discount.event.startTime <= now) return res.status(409).json({ error: 'Registration is closed for this event' });
        if (!hasValidDiscountAmount(discount)) return res.status(404).json({ error: 'Invalid discount code' });
        if (discount.validFrom && discount.validFrom > now) return res.status(400).json({ error: 'Code not active yet' });
        if (discount.validUntil && discount.validUntil < now) return res.status(400).json({ error: 'Code expired' });
        if (discount.maxUses && discount.usedCount >= discount.maxUses) return res.status(400).json({ error: 'Code usage limit reached' });

        res.json({
            code: discount.code,
            type: discount.type,
            amount: discount.amount
        });

    } catch (error) {
        console.error('Validate discount error:', error);
        res.status(500).json({ error: 'Validation failed' });
    }
});

// ORG ROUTES
router.use(authenticate);
router.use(requireOrganizer);

// Get codes for event
router.get('/events/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        const event = await prisma.event.findUnique({ where: { id: eventId } });
        if (!event) return res.status(404).json({ error: 'Event not found' });
        if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const discountCodes = await prisma.discountCode.findMany({
            where: { eventId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(discountCodes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch codes' });
    }
});

// Create code
router.post('/events/:eventId', [
    body('code').trim().notEmpty().toUpperCase(),
    body('type').isIn(['PERCENTAGE', 'FIXED_AMOUNT']),
    body('amount').isInt({ min: 1 }).toInt(),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { eventId } = req.params;
        const { code, type, amount, maxUses, validFrom, validUntil } = req.body;
        const parsedMaxUses = parseNullableIntegerInput(maxUses, 'maxUses', 1);
        const parsedValidFrom = parseNullableDateInput(validFrom, 'validFrom');
        const parsedValidUntil = parseNullableDateInput(validUntil, 'validUntil');
        if (parsedValidFrom && parsedValidUntil && parsedValidFrom > parsedValidUntil) {
            throw routeInputError('validUntil must be after validFrom');
        }
        const storedAmount = normalizeDiscountAmountForStorage(type, amount);

        const event = await prisma.event.findUnique({ where: { id: eventId } });
        if (!event) return res.status(404).json({ error: 'Event not found' });
        if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Unauthorized' });

        const newCode = await prisma.discountCode.create({
            data: {
                eventId,
                code,
                type,
                amount: storedAmount,
                maxUses: parsedMaxUses,
                validFrom: parsedValidFrom,
                validUntil: parsedValidUntil
            }
        });

        res.json(newCode);
    } catch (error) {
        console.error(error);
        if (error.code === 'P2002') return res.status(400).json({ error: 'Code already exists for this event' });
        res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : 'Failed to create code'
        });
    }
});

// Toggle status
router.patch('/:id/toggle', async (req, res) => {
    try {
        const code = await prisma.discountCode.findUnique({ where: { id: req.params.id }, include: { event: true } });
        if (!code) return res.status(404).json({ error: 'Not found' });

        if (code.event.organizerId !== req.user.id && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Unauthorized' });

        const updated = await prisma.discountCode.update({
            where: { id: req.params.id },
            data: { isActive: !code.isActive }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Update failed' });
    }
});

export default router;
