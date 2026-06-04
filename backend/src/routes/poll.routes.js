import express from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../config/db.js';
import { authenticate, requireOrganizer } from '../middleware/auth.middleware.js';
import { sendCustomEmail } from '../services/email.service.js';
import { recordPollVote } from '../services/poll-vote.service.js';
import {
    parseBooleanInput,
    parseNullableDateInput,
    parseOptionalBooleanInput
} from '../utils/route-input.util.js';

const router = express.Router();

// ============================================
// PUBLIC ROUTES
// ============================================

// Get all active polls for an event (public)
router.get('/events/:eventId/polls', async (req, res) => {
    try {
        const { eventId } = req.params;

        const event = await prisma.event.findFirst({
            where: { id: eventId, published: true },
            select: { id: true }
        });

        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const polls = await prisma.poll.findMany({
            where: {
                eventId: event.id,
                isActive: true,
                OR: [
                    { endsAt: null },
                    { endsAt: { gt: new Date() } }
                ]
            },
            include: {
                options: {
                    orderBy: { order: 'asc' },
                    include: {
                        _count: { select: { votes: true } }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(polls);
    } catch (error) {
        console.error('Get polls error:', error);
        res.status(500).json({ error: 'Failed to fetch polls' });
    }
});

// Get poll results (public)
router.get('/polls/:pollId/results', async (req, res) => {
    try {
        const { pollId } = req.params;

        const poll = await prisma.poll.findUnique({
            where: { id: pollId },
            include: {
                event: {
                    select: { published: true }
                },
                options: {
                    orderBy: { order: 'asc' },
                    include: {
                        _count: { select: { votes: true } }
                    }
                }
            }
        });

        if (!poll || !poll.event.published) {
            return res.status(404).json({ error: 'Poll not found' });
        }

        const totalVotes = poll.options.reduce((sum, opt) => sum + opt._count.votes, 0);

        const results = {
            id: poll.id,
            question: poll.question,
            totalVotes,
            options: poll.options.map(opt => ({
                id: opt.id,
                text: opt.text,
                votes: opt._count.votes,
                percentage: totalVotes > 0 ? ((opt._count.votes / totalVotes) * 100).toFixed(1) : 0
            }))
        };

        res.json(results);
    } catch (error) {
        console.error('Get poll results error:', error);
        res.status(500).json({ error: 'Failed to fetch poll results' });
    }
});

// Vote on a poll (public - requires email)
router.post('/polls/:pollId/vote',
    [
        body('optionId').optional().trim().notEmpty(),
        body('optionIds').optional().isArray({ min: 1 }),
        body('optionIds.*').optional().trim().notEmpty(),
        body().custom((value) => {
            if (value.optionId || (Array.isArray(value.optionIds) && value.optionIds.length > 0)) {
                return true;
            }
            throw new Error('Select at least one option');
        }),
        body('voterEmail').trim().isEmail().normalizeEmail()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { pollId } = req.params;
            const { optionId, optionIds } = req.body;
            const voterEmail = String(req.body.voterEmail || '').trim().toLowerCase();

            const vote = await recordPollVote({
                pollId,
                optionId,
                optionIds,
                voterEmail
            });

            res.json({ success: true, message: 'Vote recorded', createdCount: vote.createdCount });
        } catch (error) {
            console.error('Vote error:', error);
            res.status(error.statusCode || 500).json({
                error: error.statusCode ? error.message : 'Failed to record vote'
            });
        }
    }
);

// ============================================
// ADMIN ROUTES
// ============================================

// All admin routes require authentication
router.use('/admin', authenticate);
router.use('/admin', requireOrganizer);

// Get all polls for an event (admin)
router.get('/admin/events/:eventId/polls', async (req, res) => {
    try {
        const { eventId } = req.params;

        // Verify ownership
        const event = await prisma.event.findUnique({ where: { id: eventId } });
        if (!event) return res.status(404).json({ error: 'Event not found' });
        if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const polls = await prisma.poll.findMany({
            where: { eventId },
            include: {
                options: {
                    orderBy: { order: 'asc' },
                    include: {
                        _count: { select: { votes: true } }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(polls);
    } catch (error) {
        console.error('Get admin polls error:', error);
        res.status(500).json({ error: 'Failed to fetch polls' });
    }
});

// Create a poll (admin)
router.post('/admin/events/:eventId/polls',
    [
        body('question').trim().notEmpty(),
        body('options').isArray({ min: 2 }).withMessage('At least 2 options required'),
        body('options.*.text').trim().notEmpty()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { eventId } = req.params;
            const { question, description, options, allowMultiple, endsAt, notifyUsers } = req.body;
            const parsedAllowMultiple = parseOptionalBooleanInput(allowMultiple, 'allowMultiple', false);
            const parsedNotifyUsers = parseOptionalBooleanInput(notifyUsers, 'notifyUsers', false);
            const parsedEndsAt = parseNullableDateInput(endsAt, 'endsAt');

            // Verify ownership
            const event = await prisma.event.findUnique({
                where: { id: eventId },
                include: { registrations: { where: { status: 'PAID' }, select: { userEmail: true } } }
            });
            if (!event) return res.status(404).json({ error: 'Event not found' });
            if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
                return res.status(403).json({ error: 'Not authorized' });
            }

            // Create poll with options
            const poll = await prisma.poll.create({
                data: {
                    eventId,
                    question,
                    description,
                    allowMultiple: parsedAllowMultiple,
                    endsAt: parsedEndsAt,
                    options: {
                        create: options.map((opt, idx) => ({
                            text: opt.text,
                            order: idx
                        }))
                    }
                },
                include: { options: true }
            });

            // Send notification to attendees if requested
            if (parsedNotifyUsers && event.registrations.length > 0) {
                const emails = [...new Set(event.registrations.map(r => r.userEmail))];

                // Record notification
                await prisma.notification.create({
                    data: {
                        eventId,
                        type: 'poll_created',
                        title: `New Poll: ${question}`,
                        message: `A new poll has been created for "${event.title}". Cast your vote now!`,
                        recipientEmails: emails,
                        sentAt: new Date()
                    }
                });

                // Send emails in background
                setImmediate(async () => {
                    const eventUrl = `${process.env.FRONTEND_URL || 'https://occasio.vercel.app'}/events/${encodeURIComponent(eventId)}`;
                    const descriptionBlock = description ? `<p>${description}</p>` : '';
                    const optionItems = options.map(o => `<li>${o.text}</li>`).join('');

                    for (const email of emails) {
                        try {
                            await sendCustomEmail(
                                email,
                                `New Poll for ${event.title}`,
                                `<h2>New Poll Created</h2>
                <p><strong>${question}</strong></p>
                ${descriptionBlock}
                <p>Cast your vote at: ${eventUrl}</p>
                <p>Options:</p>
                <ul>${optionItems}</ul>`
                            );
                        } catch (e) {
                            console.error('Failed to send poll notification to', email);
                        }
                    }
                });
            }

            res.status(201).json(poll);
        } catch (error) {
            console.error('Create poll error:', error);
            res.status(error.statusCode || 500).json({
                error: error.statusCode ? error.message : 'Failed to create poll'
            });
        }
    }
);

// Update poll (admin)
router.put('/admin/polls/:pollId', async (req, res) => {
    try {
        const { pollId } = req.params;
        const { question, description, isActive, endsAt } = req.body;
        const hasField = (fieldName) => Object.prototype.hasOwnProperty.call(req.body, fieldName);

        const poll = await prisma.poll.findUnique({
            where: { id: pollId },
            include: { event: true }
        });

        if (!poll) return res.status(404).json({ error: 'Poll not found' });
        if (poll.event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const updated = await prisma.poll.update({
            where: { id: pollId },
            data: {
                question: question || undefined,
                description: description !== undefined ? description : undefined,
                isActive: hasField('isActive') ? parseBooleanInput(isActive, 'isActive') : undefined,
                endsAt: hasField('endsAt') ? parseNullableDateInput(endsAt, 'endsAt') : undefined
            }
        });

        res.json(updated);
    } catch (error) {
        console.error('Update poll error:', error);
        res.status(error.statusCode || 500).json({
            error: error.statusCode ? error.message : 'Failed to update poll'
        });
    }
});

// Delete poll (admin)
router.delete('/admin/polls/:pollId', async (req, res) => {
    try {
        const { pollId } = req.params;

        const poll = await prisma.poll.findUnique({
            where: { id: pollId },
            include: { event: true }
        });

        if (!poll) return res.status(404).json({ error: 'Poll not found' });
        if (poll.event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await prisma.poll.delete({ where: { id: pollId } });

        res.json({ success: true, message: 'Poll deleted' });
    } catch (error) {
        console.error('Delete poll error:', error);
        res.status(500).json({ error: 'Failed to delete poll' });
    }
});

export default router;
