import express from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../config/db.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// Get reviews for an event
router.get('/events/:id/reviews', async (req, res) => {
    try {
        const { id } = req.params;
        const event = await prisma.event.findFirst({
            where: { id, published: true },
            select: { id: true }
        });

        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const reviews = await prisma.review.findMany({
            where: { eventId: event.id },
            include: {
                user: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Calculate average
        const aggregate = await prisma.review.aggregate({
            where: { eventId: event.id },
            _avg: { rating: true },
            _count: { rating: true }
        });

        res.json({
            reviews,
            stats: {
                average: aggregate._avg.rating || 0,
                count: aggregate._count.rating || 0
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch reviews' });
    }
});

// Create a review
router.post('/events/:id/reviews', [
    authenticate,
    body('rating').isInt({ min: 1, max: 5 }).toInt(),
    body('comment').optional().trim().isLength({ max: 500 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { id } = req.params;
        const { rating, comment } = req.body;
        const userId = req.user.id;

        // 1. Check if event exists
        const event = await prisma.event.findFirst({ where: { id, published: true } });
        if (!event) return res.status(404).json({ error: 'Event not found' });

        if (new Date(event.startTime) > new Date()) {
            return res.status(400).json({ error: 'Cannot review, event has not started yet' });
        }

        const registration = await prisma.registration.findFirst({
            where: {
                eventId: id,
                userEmail: req.user.email,
                status: { in: ['PAID', 'CONFIRMED'] }
            }
        });

        if (!registration) {
            return res.status(403).json({ error: 'You need a confirmed registration to review this event' });
        }

        // 3. Create Review
        const review = await prisma.review.create({
            data: {
                eventId: id,
                userId: userId,
                rating,
                comment
            }
        });

        res.status(201).json(review);
    } catch (error) {
        if (error.code === 'P2002') return res.status(400).json({ error: 'You have already reviewed this event' });
        res.status(500).json({ error: 'Failed to submit review' });
    }
});

export default router;
