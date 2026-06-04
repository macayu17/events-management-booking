import express from 'express';
import prisma from '../config/db.js';
import { authenticate, checkEventAccess } from '../middleware/auth.middleware.js';
import { verifyTeamInviteToken } from '../utils/team-invite-token.util.js';
import { mapCheckInFailure, mapCheckOutFailure, sendMappedFailure } from '../utils/checkin-response.util.js';
import { isTicketExpired, markTicketCheckedIn, markTicketCheckedOut } from '../services/checkin.service.js';

const router = express.Router();

const CHECK_IN_ROLES = ['SUPER_MANAGER', 'MANAGER', 'SCANNER'];
const ANALYTICS_ROLES = ['SUPER_MANAGER', 'MANAGER'];
const EDIT_ROLES = ['SUPER_MANAGER', 'MANAGER'];

// All routes require authentication
router.use(authenticate);

// ============================================
// TEAM MEMBER ROUTES
// Get events that the current user is a team member of
// ============================================

// Get all events user is invited to as team member
router.get('/events', async (req, res) => {
    try {
        const { event: invitedEventId, invite } = req.query;
        const teamMemberships = await prisma.teamMember.findMany({
            where: {
                email: req.user.email,
                acceptedAt: { not: null }
            },
            include: {
                event: {
                    include: {
                        organizer: {
                            select: { name: true, email: true }
                        },
                        _count: {
                            select: { registrations: true }
                        }
                    }
                }
            },
            orderBy: { invitedAt: 'desc' }
        });

        if (invitedEventId && invite) {
            const pendingMembership = await prisma.teamMember.findUnique({
                where: { eventId_email: { eventId: String(invitedEventId), email: req.user.email } },
                include: {
                    event: {
                        include: {
                            organizer: {
                                select: { name: true, email: true }
                            },
                            _count: {
                                select: { registrations: true }
                            }
                        }
                    }
                }
            });

            if (
                pendingMembership &&
                !pendingMembership.acceptedAt &&
                verifyTeamInviteToken(String(invite), pendingMembership)
            ) {
                teamMemberships.unshift(pendingMembership);
            }
        }

        const events = teamMemberships.map(tm => ({
            ...tm.event,
            teamRole: tm.role,
            invitedAt: tm.invitedAt,
            acceptedAt: tm.acceptedAt
        }));

        res.json(events);
    } catch (error) {
        console.error('Get team events error:', error);
        res.status(500).json({ error: 'Failed to fetch team events' });
    }
});

// Get specific event details (for team members)
router.get('/events/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check access
        const access = await checkEventAccess(req.user, id);
        if (!access.hasAccess) {
            return res.status(403).json({ error: access.error });
        }

        const event = await prisma.event.findUnique({
            where: { id },
            include: {
                organizer: {
                    select: { name: true, email: true }
                },
                _count: {
                    select: { registrations: true }
                }
            }
        });

        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        res.json({
            ...event,
            access: {
                role: access.role,
                isOwner: access.isOwner,
                isTeamMember: access.isTeamMember,
                canCheckIn: access.isOwner || access.role === 'ADMIN' || CHECK_IN_ROLES.includes(access.role),
                canViewAnalytics: access.isOwner || access.role === 'ADMIN' || ANALYTICS_ROLES.includes(access.role),
                canEdit: access.isOwner || access.role === 'ADMIN' || EDIT_ROLES.includes(access.role)
            }
        });
    } catch (error) {
        console.error('Get team event error:', error);
        res.status(500).json({ error: 'Failed to fetch event' });
    }
});

// Get attendees for check-in (SCANNER and MANAGER roles)
router.get('/events/:id/attendees', async (req, res) => {
    try {
        const { id } = req.params;
        const { search, status } = req.query;

        // Check access - require scanner-capable team role
        const access = await checkEventAccess(req.user, id, CHECK_IN_ROLES);
        if (!access.hasAccess) {
            return res.status(403).json({ error: access.error || 'Scanner access required' });
        }

        // Build filter conditions
        let ticketWhere = {};
        if (status === 'checked-in') ticketWhere.checkedInAt = { not: null };
        if (status === 'not-checked-in') ticketWhere.checkedInAt = null;
        if (status === 'checked-out') ticketWhere.checkedOutAt = { not: null };

        const registrations = await prisma.registration.findMany({
            where: {
                eventId: id,
                status: { in: ['PAID', 'CONFIRMED'] },
                ...(search && {
                    OR: [
                        { userEmail: { contains: search, mode: 'insensitive' } },
                        { formResponse: { path: ['name'], string_contains: search } }
                    ]
                })
            },
            include: {
                orders: {
                    where: { status: 'PAID' },
                    include: {
                        ticket: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Flatten to attendees list with check-in info
        const attendees = registrations.flatMap(reg =>
            reg.orders
                .filter(o => o.ticket)
                .filter(o => {
                    if (status === 'checked-in') return o.ticket.checkedInAt;
                    if (status === 'not-checked-in') return !o.ticket.checkedInAt;
                    if (status === 'checked-out') return o.ticket.checkedOutAt;
                    return true;
                })
                .map(order => ({
                    id: order.ticket.id,
                    ticketId: order.ticket.id,
                    orderId: order.id,
                    name: reg.formResponse?.name || 'N/A',
                    email: reg.userEmail,
                    phone: reg.formResponse?.phone || null,
                    checkedInAt: order.ticket.checkedInAt,
                    checkedOutAt: order.ticket.checkedOutAt,
                    checkedInBy: order.ticket.checkedInBy,
                    issuedAt: order.ticket.issuedAt,
                    revoked: order.ticket.revoked
                }))
        );

        res.json(attendees);
    } catch (error) {
        console.error('Get team attendees error:', error);
        res.status(500).json({ error: 'Failed to fetch attendees' });
    }
});

// Get check-in stats (SCANNER and MANAGER roles)
router.get('/events/:id/checkin-stats', async (req, res) => {
    try {
        const { id } = req.params;

        // Check access
        const access = await checkEventAccess(req.user, id, CHECK_IN_ROLES);
        if (!access.hasAccess) {
            return res.status(403).json({ error: access.error || 'Scanner access required' });
        }

        // Count tickets
        const [total, checkedIn, checkedOut] = await Promise.all([
            prisma.ticket.count({
                where: {
                    order: {
                        registration: { eventId: id },
                        status: 'PAID'
                    }
                }
            }),
            prisma.ticket.count({
                where: {
                    order: {
                        registration: { eventId: id },
                        status: 'PAID'
                    },
                    checkedInAt: { not: null }
                }
            }),
            prisma.ticket.count({
                where: {
                    order: {
                        registration: { eventId: id },
                        status: 'PAID'
                    },
                    checkedOutAt: { not: null }
                }
            })
        ]);

        res.json({
            total,
            checkedIn,
            checkedOut,
            notCheckedIn: total - checkedIn,
            currentlyInside: checkedIn - checkedOut,
            checkInRate: total > 0 ? ((checkedIn / total) * 100).toFixed(1) : 0
        });
    } catch (error) {
        console.error('Get team checkin stats error:', error);
        res.status(500).json({ error: 'Failed to fetch check-in stats' });
    }
});

// Check-in a ticket (SCANNER and MANAGER roles)
router.post('/tickets/:ticketId/checkin', async (req, res) => {
    try {
        const { ticketId } = req.params;

        // Get ticket with event info
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: {
                order: {
                    include: {
                        registration: {
                            include: { event: true }
                        }
                    }
                }
            }
        });

        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        const eventId = ticket.order.registration.event.id;

        // Check access
        const access = await checkEventAccess(req.user, eventId, CHECK_IN_ROLES);
        if (!access.hasAccess) {
            return res.status(403).json({ error: access.error || 'Scanner access required' });
        }

        if (ticket.revoked) {
            return sendMappedFailure(res, mapCheckInFailure({ blockedReason: 'revoked' }));
        }

        if (isTicketExpired(ticket)) {
            return sendMappedFailure(res, mapCheckInFailure({ blockedReason: 'expired' }));
        }

        if (ticket.scannedAt || ticket.checkedInAt) {
            return sendMappedFailure(res, mapCheckInFailure({
                blockedReason: 'already-checked-in',
                checkedInAt: ticket.checkedInAt,
                scannedAt: ticket.scannedAt
            }));
        }

        const checkInResult = await markTicketCheckedIn(ticketId, req.user.id);
        if (!checkInResult.checkedIn) {
            return sendMappedFailure(res, mapCheckInFailure(checkInResult));
        }

        res.json({
            success: true,
            message: 'Checked in successfully',
            ticket: checkInResult.ticket,
            attendee: {
                name: ticket.order.registration.formResponse?.name,
                email: ticket.order.registration.userEmail
            }
        });
    } catch (error) {
        console.error('Team check-in error:', error);
        res.status(500).json({ error: 'Failed to check in' });
    }
});

// Check-out a ticket (SCANNER and MANAGER roles)
router.post('/tickets/:ticketId/checkout', async (req, res) => {
    try {
        const { ticketId } = req.params;

        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: {
                order: {
                    include: {
                        registration: {
                            include: { event: true }
                        }
                    }
                }
            }
        });

        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        const eventId = ticket.order.registration.event.id;

        // Check access
        const access = await checkEventAccess(req.user, eventId, CHECK_IN_ROLES);
        if (!access.hasAccess) {
            return res.status(403).json({ error: access.error || 'Scanner access required' });
        }

        if (ticket.order.status !== 'PAID') {
            return res.status(400).json({ error: 'Ticket is not paid' });
        }

        const checkOutResult = await markTicketCheckedOut(ticketId);
        if (!checkOutResult.success) {
            return sendMappedFailure(res, mapCheckOutFailure(checkOutResult));
        }

        res.json({
            success: true,
            message: 'Checked out successfully',
            ticket: checkOutResult.ticket
        });
    } catch (error) {
        console.error('Team check-out error:', error);
        res.status(500).json({ error: 'Failed to check out' });
    }
});

// Accept team invitation (mark acceptedAt)
router.post('/events/:id/accept', async (req, res) => {
    try {
        const { id } = req.params;

        const teamMember = await prisma.teamMember.findUnique({
            where: { eventId_email: { eventId: id, email: req.user.email } }
        });

        if (!teamMember) {
            return res.status(404).json({ error: 'No invitation found' });
        }

        if (teamMember.acceptedAt) {
            return res.json({ message: 'Already accepted', teamMember });
        }

        const inviteToken = req.body?.inviteToken || req.query.invite;
        if (!verifyTeamInviteToken(inviteToken, teamMember)) {
            return res.status(403).json({ error: 'Valid invitation link required' });
        }

        const updated = await prisma.teamMember.update({
            where: { id: teamMember.id },
            data: { acceptedAt: new Date() }
        });

        res.json({ message: 'Invitation accepted', teamMember: updated });
    } catch (error) {
        console.error('Accept invitation error:', error);
        res.status(500).json({ error: 'Failed to accept invitation' });
    }
});

export default router;
