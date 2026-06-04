import express from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../config/db.js';
import { countReservedEventCapacity } from '../services/checkout-reservation.service.js';

const router = express.Router();

// Join Waitlist
router.post('/events/:id/waitlist', [
    body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 32 }).withMessage('Phone number is too long')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: errors.array()[0]?.msg || 'Invalid waitlist details',
            errors: errors.array()
        });
    }

    const { id } = req.params;
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    const phone = req.body.phone ? String(req.body.phone).trim() : null;

    try {
        const event = await prisma.event.findFirst({
            where: { id, published: true },
            include: {
                _count: {
                    select: {
                        registrations: {
                            where: { status: { in: ['PAID', 'CONFIRMED'] } }
                        }
                    }
                }
            }
        });

        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        if (new Date(event.startTime) <= new Date()) {
            return res.status(409).json({ error: 'Waitlist is closed for this event' });
        }

        const reservedCapacity = event.capacity > 0
            ? await countReservedEventCapacity(id)
            : event._count.registrations;

        if (event.capacity > 0 && reservedCapacity < event.capacity) {
            return res.status(409).json({ error: 'Tickets are still available for this event' });
        }

        const existing = await prisma.waitlist.findFirst({
            where: {
                eventId: id,
                email
            }
        });

        if (existing) {
            return res.status(409).json({ error: 'You are already on the waitlist' });
        }

        const entry = await prisma.waitlist.create({
            data: {
                eventId: id,
                email,
                name,
                phone
            }
        });

        res.status(201).json({ message: 'Added to waitlist', entry });
    } catch (error) {
        console.error('Waitlist error:', error);
        res.status(500).json({ error: 'Failed to join waitlist' });
    }
});

export default router;
