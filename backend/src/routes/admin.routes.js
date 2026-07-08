import express from 'express';
import certificateAdminRoutes from './admin.certificate.routes.js';
import { body, validationResult } from 'express-validator';
import prisma from '../config/db.js';
import { authenticate, requireOrganizer, checkEventAccess } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import { uploadToS3 } from '../utils/s3.util.js';
import { uploadToCloudinary, isCloudinaryConfigured } from '../utils/cloudinary.util.js';
import { validateFormSchema } from '../utils/form-schema.util.js';
import { buildTeamInviteUrl, createTeamInviteToken } from '../utils/team-invite-token.util.js';
import { mapCheckInFailure, mapCheckOutFailure, mapResetFailure, sendMappedFailure } from '../utils/checkin-response.util.js';
import { validateCertificateTemplateRef } from '../utils/certificate-admin.util.js';
import { buildAttendeeOrderWhere, mapRegistrationsToAttendees } from '../utils/admin-attendees.util.js';
import { parsePagination, buildPageResponse } from '../utils/pagination.util.js';
import { isTicketExpired, markTicketCheckedIn, markTicketCheckedOut, resetTicketCheckIn } from '../services/checkin.service.js';

const router = express.Router();

const EVENT_CATEGORIES = new Set(['MUSIC', 'TECH', 'SPORTS', 'ARTS', 'BUSINESS', 'EDUCATION', 'FOOD', 'HEALTH', 'SOCIAL', 'OTHER']);
const EVENT_TYPES = new Set(['TICKETED', 'RSVP']);
const TEAM_ROLES = new Set(['SUPER_MANAGER', 'MANAGER', 'SCANNER', 'STAFF']);

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const sendAccessDenied = (res, access) => {
  const status = access.error === 'Event not found' ? 404 : 403;
  return res.status(status).json({ error: access.error || 'Not authorized' });
};

const requireEventMutationAccess = (roles = []) => {
  return async function requireEventMutationAccessMiddleware(req, res, next) {
    try {
      const access = await checkEventAccess(req.user, req.params.id, roles);

      if (!access.hasAccess) {
        return sendAccessDenied(res, access);
      }

      req.eventAccess = access;
      return next();
    } catch (error) {
      console.error('Event access check error:', error);
      return res.status(500).json({ error: 'Failed to verify event access' });
    }
  };
};

const parseRequiredString = (value, fieldName) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw badRequest(`${fieldName} is required`);
  return normalized;
};

const parseIntegerField = (value, fieldName, min) => {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw badRequest(`${fieldName} must be an integer greater than or equal to ${min}`);
  }

  const raw = typeof value === 'number' ? String(value) : value.trim();
  if (!/^-?\d+$/.test(raw)) {
    throw badRequest(`${fieldName} must be an integer greater than or equal to ${min}`);
  }

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed < -2147483648 || parsed > 2147483647) {
    throw badRequest(`${fieldName} must be an integer greater than or equal to ${min}`);
  }
  return parsed;
};

const parseDateField = (value, fieldName) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw badRequest(`${fieldName} must be a valid date`);
  }
  return parsed;
};

const parseBooleanField = (value, fieldName) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw badRequest(`${fieldName} must be a boolean`);
};

const normalizeTeamEmail = (email) => String(email || '').trim().toLowerCase();

const normalizeTeamRole = (role = 'STAFF') => {
  const normalized = String(role || 'STAFF').trim().toUpperCase();
  return TEAM_ROLES.has(normalized) ? normalized : null;
};

const withTeamInviteLink = (teamMember) => {
  if (!teamMember || teamMember.acceptedAt) return teamMember;
  return {
    ...teamMember,
    inviteToken: createTeamInviteToken(teamMember),
    inviteUrl: buildTeamInviteUrl(teamMember),
  };
};

const PROTECTED_REGISTRATION_STATUSES = ['PAID', 'CONFIRMED'];

const buildEventUpdateData = (body = {}, { eventId, existingEvent } = {}) => {
  const data = {};

  if (hasOwn(body, 'title')) data.title = parseRequiredString(body.title, 'title');
  if (hasOwn(body, 'description')) data.description = parseRequiredString(body.description, 'description');
  if (hasOwn(body, 'location')) data.location = parseRequiredString(body.location, 'location');
  if (hasOwn(body, 'startTime')) data.startTime = parseDateField(body.startTime, 'startTime');
  if (hasOwn(body, 'endTime')) data.endTime = parseDateField(body.endTime, 'endTime');
  if (hasOwn(body, 'capacity')) data.capacity = parseIntegerField(body.capacity, 'capacity', 1);
  if (hasOwn(body, 'priceCents')) data.priceCents = parseIntegerField(body.priceCents, 'priceCents', 0);

  if (hasOwn(body, 'currency')) {
    const currency = parseRequiredString(body.currency, 'currency').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw badRequest('currency must be a 3-letter code');
    data.currency = currency;
  }

  if (hasOwn(body, 'type')) {
    const type = String(body.type || '').trim().toUpperCase();
    if (!EVENT_TYPES.has(type)) throw badRequest('type is invalid');
    data.type = type;
  }

  if (hasOwn(body, 'category')) {
    const category = String(body.category || '').trim().toUpperCase();
    if (!EVENT_CATEGORIES.has(category)) throw badRequest('category is invalid');
    data.category = category;
  }

  if (hasOwn(body, 'tags')) {
    if (!Array.isArray(body.tags)) throw badRequest('tags must be an array');
    data.tags = body.tags.map((tag) => String(tag || '').trim()).filter(Boolean);
  }

  if (hasOwn(body, 'published')) {
    data.published = parseBooleanField(body.published, 'published');
  }

  if (hasOwn(body, 'featured')) {
    data.featured = parseBooleanField(body.featured, 'featured');
  }

  if (hasOwn(body, 'ticketStyle')) {
    const ticketStyle = body.ticketStyle;
    if (ticketStyle !== null && (Array.isArray(ticketStyle) || typeof ticketStyle !== 'object')) {
      throw badRequest('ticketStyle must be an object');
    }
    data.ticketStyle = ticketStyle;
  }

  if (hasOwn(body, 'certificateEnabled')) {
    data.certificateEnabled = parseBooleanField(body.certificateEnabled, 'certificateEnabled');
  }

  if (hasOwn(body, 'certificateTemplateUrl')) {
    const value = body.certificateTemplateUrl;
    data.certificateTemplateUrl = value === null || value === ''
      ? null
      : validateCertificateTemplateRef(value, {
        eventId,
        allowLegacyGlobalTemplateRef: value === existingEvent?.certificateTemplateUrl
      });
  }

  if (hasOwn(body, 'certificateMapping')) {
    const value = body.certificateMapping;
    if (value !== null && typeof value !== 'object') {
      throw badRequest('certificateMapping must be an object or array');
    }
    data.certificateMapping = value;
  }

  if (Object.keys(data).length === 0) {
    throw badRequest('No supported event fields provided');
  }

  return data;
};

// All admin routes require authentication
router.use(authenticate);
router.use(requireOrganizer);
router.use(certificateAdminRoutes);

// Create event
router.post('/events',
  [
    body('title').notEmpty().trim(),
    body('description').notEmpty().trim(),
    body('location').notEmpty().trim(),
    body('startTime').isISO8601(),
    body('endTime').isISO8601(),
    body('capacity').isInt({ min: 1 }),
    body('priceCents').isInt({ min: 0 }),
    body('type').optional().isIn(['TICKETED', 'RSVP']),
    body('category').optional().isIn(['MUSIC', 'TECH', 'SPORTS', 'ARTS', 'BUSINESS', 'EDUCATION', 'FOOD', 'HEALTH', 'SOCIAL', 'OTHER']),
    body('tags').optional().isArray()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const title = parseRequiredString(req.body.title, 'title');
      const type = req.body.type ? String(req.body.type).trim().toUpperCase() : 'TICKETED';
      const category = req.body.category ? String(req.body.category).trim().toUpperCase() : 'OTHER';
      const currency = req.body.currency
        ? parseRequiredString(req.body.currency, 'currency').toUpperCase()
        : 'INR';

      if (!EVENT_TYPES.has(type)) throw badRequest('type is invalid');
      if (!EVENT_CATEGORIES.has(category)) throw badRequest('category is invalid');
      if (!/^[A-Z]{3}$/.test(currency)) throw badRequest('currency must be a 3-letter code');

      // Generate slug from title
      const slug = title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') + '-' + Date.now();

      const event = await prisma.event.create({
        data: {
          organizerId: req.user.id,
          title,
          slug,
          description: parseRequiredString(req.body.description, 'description'),
          location: parseRequiredString(req.body.location, 'location'),
          startTime: parseDateField(req.body.startTime, 'startTime'),
          endTime: parseDateField(req.body.endTime, 'endTime'),
          capacity: parseIntegerField(req.body.capacity, 'capacity', 1),
          priceCents: parseIntegerField(req.body.priceCents, 'priceCents', 0),
          currency,
          type,
          category,
          tags: Array.isArray(req.body.tags)
            ? req.body.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
            : []
        },
        include: {
          organizer: {
            select: { name: true, email: true }
          }
        }
      });

      res.status(201).json(event);
    } catch (error) {
      console.error('Create event error:', error);
      res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Failed to create event' });
    }
  }
);

// Update event (owners, admins, MANAGER, SUPER_MANAGER can edit)
router.put('/events/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check access - MANAGER and SUPER_MANAGER can edit
    const access = await checkEventAccess(req.user, id, ['MANAGER', 'SUPER_MANAGER']);

    if (!access.hasAccess) {
      return res.status(403).json({ error: access.error || 'Not authorized' });
    }

    const existingEvent = hasOwn(req.body, 'certificateTemplateUrl')
      ? await prisma.event.findUnique({
        where: { id },
        select: { certificateTemplateUrl: true }
      })
      : null;

    const updatedEvent = await prisma.event.update({
      where: { id },
      data: buildEventUpdateData(req.body, { eventId: id, existingEvent }),
      include: {
        organizer: {
          select: { name: true, email: true }
        }
      }
    });

    res.json(updatedEvent);
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Delete event
router.delete('/events/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findUnique({
      where: { id }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const protectedRegistration = await prisma.registration.findFirst({
      where: {
        eventId: id,
        OR: [
          { status: { in: PROTECTED_REGISTRATION_STATUSES } },
          { orders: { some: { status: 'PAID' } } },
          { orders: { some: { providerOrderId: { not: null } } } },
          { orders: { some: { amountCents: { gt: 0 } } } },
          { orders: { some: { ticket: { isNot: null } } } }
        ]
      },
      select: { id: true }
    });

    if (protectedRegistration) {
      return res.status(409).json({
        error: 'This event has paid, payment-started, or ticketed registrations. Archive or cancel it instead of deleting financial records.'
      });
    }

    await prisma.event.delete({
      where: { id }
    });

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Upload event poster
router.post('/events/:id/poster-upload', requireEventMutationAccess(['MANAGER', 'SUPER_MANAGER']), upload.single('poster'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Upload to cloud storage or use local path
    let posterUrl;
    if (isCloudinaryConfigured()) {
      // Use Cloudinary (recommended for production)
      posterUrl = await uploadToCloudinary(req.file.buffer, 'posters');
    } else if (process.env.NODE_ENV === 'production' && process.env.AWS_ACCESS_KEY_ID) {
      // Fallback to S3
      posterUrl = await uploadToS3(req.file);
    } else {
      // Local development
      posterUrl = `/uploads/${req.file.filename}`;
    }

    const updatedEvent = await prisma.event.update({
      where: { id },
      data: { posterUrl }
    });

    res.json({ posterUrl: updatedEvent.posterUrl });
  } catch (error) {
    console.error('Upload poster error:', error);
    res.status(500).json({ error: 'Failed to upload poster' });
  }
});

// Create/Update event form (owners, admins, SUPER_MANAGER can edit)
router.post('/events/:id/form', async (req, res) => {
  try {
    const { id } = req.params;
    const { schemaJson } = req.body;

    // Check access - only SUPER_MANAGER (not regular MANAGER) can edit forms
    const access = await checkEventAccess(req.user, id, ['SUPER_MANAGER']);

    if (!access.hasAccess) {
      return res.status(403).json({ error: access.error || 'Not authorized' });
    }

    const normalizedSchema = validateFormSchema(schemaJson);

    const form = await prisma.form.upsert({
      where: { eventId: id },
      update: { schemaJson: normalizedSchema },
      create: {
        eventId: id,
        schemaJson: normalizedSchema
      }
    });

    res.json(form);
  } catch (error) {
    console.error('Create form error:', error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Failed to create form'
    });
  }
});

// Get all events for organizer
router.get('/events', async (req, res) => {
  try {
    const where = req.user.role === 'ADMIN'
      ? {}
      : { organizerId: req.user.id };

    const events = await prisma.event.findMany({
      where,
      include: {
        organizer: {
          select: { name: true, email: true }
        },
        _count: {
          select: {
            registrations: {
              where: { status: 'PAID' }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(events);
  } catch (error) {
    console.error('Get admin events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Get a single event for admin/team workflows, including drafts
router.get('/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const access = await checkEventAccess(req.user, id, ['MANAGER', 'SUPER_MANAGER']);

    if (!access.hasAccess) {
      return sendAccessDenied(res, access);
    }

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        organizer: {
          select: { name: true, email: true }
        },
        form: true,
        ticketTiers: { orderBy: { sortOrder: 'asc' } },
        speakers: { orderBy: { sortOrder: 'asc' } },
        reminders: { orderBy: { hoursBeforeEvent: 'desc' } }
      }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(event);
  } catch (error) {
    console.error('Get admin event error:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// Get registrations for an event
router.get('/events/:id/registrations', async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findUnique({
      where: { id }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const pagination = parsePagination(req.query);
    const where = { eventId: id };

    const [total, registrations, paidRegistrations, revenueAgg] = await Promise.all([
      prisma.registration.count({ where }),
      prisma.registration.findMany({
        where,
        include: {
          orders: {
            include: {
              ticket: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take
      }),
      // Account-wide summary so the stat cards stay accurate under pagination.
      prisma.registration.count({ where: { eventId: id, status: 'PAID' } }),
      prisma.order.aggregate({
        where: { status: 'PAID', registration: { eventId: id } },
        _sum: { amountCents: true }
      })
    ]);

    res.json({
      ...buildPageResponse(registrations, total, pagination),
      summary: {
        paidRegistrations,
        totalRevenueCents: revenueAgg._sum.amountCents || 0
      }
    });
  } catch (error) {
    console.error('Get registrations error:', error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Failed to fetch registrations'
    });
  }
});

// Delete a registration (and associated orders/tickets)
router.delete('/registrations/:regId', async (req, res) => {
  try {
    const { regId } = req.params;

    const registration = await prisma.registration.findUnique({
      where: { id: regId },
      include: {
        event: true,
        orders: {
          select: {
            status: true,
            providerOrderId: true,
            amountCents: true,
            ticket: { select: { id: true } }
          }
        }
      }
    });

    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    if (registration.event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const hasProtectedRecords = PROTECTED_REGISTRATION_STATUSES.includes(registration.status)
      || registration.orders.some((order) =>
        order.status === 'PAID'
        || order.providerOrderId
        || order.amountCents > 0
        || order.ticket
      );

    if (hasProtectedRecords) {
      return res.status(409).json({
        error: 'Paid, payment-started, or ticketed registrations cannot be deleted. Revoke or cancel the ticket instead.'
      });
    }

    await prisma.registration.delete({
      where: { id: regId }
    });

    res.json({ message: 'Registration deleted successfully' });
  } catch (error) {
    console.error('Delete registration error:', error);
    res.status(500).json({ error: 'Failed to delete registration' });
  }
});

// Get analytics for an event
router.get('/events/:id/analytics', async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        ticketTiers: { orderBy: { sortOrder: 'asc' } },
        discounts: true
      }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // ---- KPI SCALARS via index-backed aggregates (no row transfer) ----
    const [
      statusGroups,
      failedRegistrations,
      revenueAgg,
      totalTickets,
      checkedInCount
    ] = await Promise.all([
      // Registration counts grouped by status
      prisma.registration.groupBy({
        by: ['status'],
        where: { eventId: id },
        _count: { _all: true }
      }),
      // Failed registrations are derived from failed ORDERS (there is no FAILED
      // registration status), counted at the database level.
      prisma.registration.count({
        where: { eventId: id, orders: { some: { status: 'FAILED' } } }
      }),
      // Paid revenue + paid order count
      prisma.order.aggregate({
        where: { status: 'PAID', registration: { eventId: id } },
        _sum: { amountCents: true },
        _count: { _all: true }
      }),
      // Total issued tickets for the event
      prisma.ticket.count({ where: { order: { registration: { eventId: id } } } }),
      // Checked-in tickets (either legacy scannedAt or checkedInAt)
      prisma.ticket.count({
        where: {
          order: { registration: { eventId: id } },
          OR: [{ checkedInAt: { not: null } }, { scannedAt: { not: null } }]
        }
      })
    ]);

    const statusCountFor = (status) =>
      statusGroups.find((group) => group.status === status)?._count._all || 0;
    const totalRegistrations = statusGroups.reduce((sum, group) => sum + group._count._all, 0);
    const paidRegistrations = statusCountFor('PAID');
    const pendingRegistrations = statusCountFor('PENDING');
    const cancelledRegistrations = statusCountFor('CANCELLED');

    const paidOrderCount = revenueAgg._count._all;
    const totalRevenue = (revenueAgg._sum.amountCents || 0) / 100;
    const averageOrderValue = paidOrderCount > 0 ? totalRevenue / paidOrderCount : 0;

    const notCheckedInCount = totalTickets - checkedInCount;
    const checkInRate = totalTickets > 0 ? (checkedInCount / totalTickets) * 100 : 0;

    // ---- Lean row fetch for the time-series / breakdown charts ----
    // Only the tiny scalar columns the charts need — no formResponse JSON blobs
    // or nested discount/ticket records.
    const registrations = await prisma.registration.findMany({
      where: { eventId: id },
      select: {
        createdAt: true,
        orders: {
          select: {
            status: true,
            createdAt: true,
            amountCents: true,
            provider: true,
            discountCodeId: true,
            ticket: { select: { scannedAt: true, checkedInAt: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const paidOrders = registrations.flatMap(r => r.orders.filter(o => o.status === 'PAID'));
    const tickets = registrations.flatMap(r => r.orders.flatMap(o => o.ticket ? [o.ticket] : []));

    // ---- DAILY REGISTRATIONS (last 30 days) ----
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);

    // Calculate growth (This Week vs Last Week)
    const currentWeekRegs = registrations.filter(r => {
      const d = new Date(r.createdAt);
      return d >= sevenDaysAgo && d <= today;
    }).length;
    const previousWeekRegs = registrations.filter(r => {
      const d = new Date(r.createdAt);
      return d >= fourteenDaysAgo && d < sevenDaysAgo;
    }).length;

    let registrationGrowth = 0;
    if (previousWeekRegs > 0) {
      registrationGrowth = ((currentWeekRegs - previousWeekRegs) / previousWeekRegs) * 100;
    } else if (currentWeekRegs > 0) {
      registrationGrowth = 100;
    }

    // Build daily map for last 30 days
    const dailyMap = {};
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyMap[dateStr] = 0;
    }
    registrations.forEach(r => {
      const dateStr = new Date(r.createdAt).toISOString().split('T')[0];
      if (dailyMap[dateStr] !== undefined) dailyMap[dateStr]++;
    });
    const dailyRegistrations = Object.entries(dailyMap).map(([date, count]) => ({ date, count })).reverse();

    // ---- DAILY REVENUE ----
    const revenueMap = {};
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      revenueMap[date.toISOString().split('T')[0]] = 0;
    }
    paidOrders.forEach(o => {
      const dateStr = new Date(o.createdAt).toISOString().split('T')[0];
      if (revenueMap[dateStr] !== undefined) {
        revenueMap[dateStr] += (o.amountCents || o.totalAmount || 0) / 100;
      }
    });
    const dailyRevenue = Object.entries(revenueMap).map(([date, amount]) => ({ date, amount: Number(amount.toFixed(2)) })).reverse();

    // ---- HOURLY DISTRIBUTION (all-time) ----
    const hourlyMap = Array(24).fill(0);
    registrations.forEach(r => {
      const hour = new Date(r.createdAt).getHours();
      hourlyMap[hour]++;
    });
    const hourlyDistribution = hourlyMap.map((count, hour) => ({ hour, count }));
    const peakHour = hourlyDistribution.reduce((max, h) => h.count > max.count ? h : max, { hour: 0, count: 0 });

    // ---- TICKET TIER BREAKDOWN ----
    const tierBreakdown = event.ticketTiers.map(tier => {
      const capacity = tier.capacity || null;
      return {
        id: tier.id,
        name: tier.name,
        priceCents: tier.priceCents,
        capacity,
        soldCount: tier.soldCount,
        revenue: (tier.soldCount * tier.priceCents) / 100,
        fillRate: capacity ? ((tier.soldCount / capacity) * 100) : null
      };
    });

    // ---- DISCOUNT CODE USAGE ----
    const discountUsage = event.discounts.map(d => ({
      code: d.code,
      type: d.type,
      amount: d.amount,
      usedCount: d.usedCount,
      maxUses: d.maxUses,
      isActive: d.isActive
    }));
    const totalDiscountUses = discountUsage.reduce((s, d) => s + d.usedCount, 0);
    // Estimate discount savings from orders that used a code. The lean order
    // fetch carries only discountCodeId, so resolve the code via event.discounts.
    const discountById = new Map(event.discounts.map(d => [d.id, d]));
    const discountedOrders = paidOrders.filter(o => o.discountCodeId);
    const discountSavings = discountedOrders.reduce((sum, o) => {
      const disc = discountById.get(o.discountCodeId);
      if (!disc) return sum;
      if (disc.type === 'PERCENTAGE') {
        return sum + ((o.amountCents || 0) * disc.amount / (100 - disc.amount)) / 100;
      }
      return sum + disc.amount / 100;
    }, 0);

    // ---- CHECK-IN TIMELINE ----
    const checkinTimeline = [];
    const checkedInTickets = tickets.filter(t => t.scannedAt || t.checkedInAt);
    if (checkedInTickets.length > 0) {
      const ciMap = {};
      checkedInTickets.forEach(t => {
        const ts = t.checkedInAt || t.scannedAt;
        const key = new Date(ts).toISOString().slice(0, 16); // minute resolution
        ciMap[key] = (ciMap[key] || 0) + 1;
      });
      let cumulative = 0;
      Object.entries(ciMap).sort().forEach(([time, count]) => {
        cumulative += count;
        checkinTimeline.push({ time, count, cumulative });
      });
    }

    // ---- REGISTRATION SOURCE / PAYMENT PROVIDER BREAKDOWN ----
    const providerBreakdown = {};
    paidOrders.forEach(o => {
      const provider = o.provider || 'UNKNOWN';
      if (!providerBreakdown[provider]) providerBreakdown[provider] = { count: 0, revenue: 0 };
      providerBreakdown[provider].count++;
      providerBreakdown[provider].revenue += (o.amountCents || o.totalAmount || 0) / 100;
    });

    // Recent registrations (top 15) — fetched with the extra fields the list
    // needs (attendee name, ticket id) that the lean chart query omits.
    const recentRegistrationRows = await prisma.registration.findMany({
      where: { eventId: id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        userEmail: true,
        status: true,
        createdAt: true,
        formResponse: true,
        orders: {
          select: {
            status: true,
            amountCents: true,
            ticket: { select: { id: true, scannedAt: true, checkedInAt: true } }
          }
        }
      }
    });

    const recentRegistrations = recentRegistrationRows.map(r => {
      const ticket = r.orders?.[0]?.ticket;
      return {
        attendeeName: r.formResponse?.name || 'N/A',
        email: r.userEmail,
        status: r.status,
        createdAt: r.createdAt,
        ticketId: ticket ? ticket.id.substring(0, 8).toUpperCase() : null,
        checkedIn: ticket ? !!(ticket.scannedAt || ticket.checkedInAt) : false,
        amount: r.orders?.find(o => o.status === 'PAID')?.amountCents
          ? (r.orders.find(o => o.status === 'PAID').amountCents / 100)
          : null
      };
    });

    // Conversion rate
    const conversionRate = totalRegistrations > 0 ? (paidRegistrations / totalRegistrations) * 100 : 0;

    // ---- SUMMARY STATS ----
    const capacityUsed = event.capacity > 0 ? ((totalRegistrations / event.capacity) * 100) : null;

    res.json({
      // Core stats
      totalRegistrations,
      paidRegistrations,
      pendingRegistrations,
      failedRegistrations,
      cancelledRegistrations,
      totalRevenue,
      averageOrderValue,
      conversionRate,
      registrationGrowth: Number(registrationGrowth.toFixed(1)),

      // Capacity
      eventCapacity: event.capacity,
      capacityUsed: capacityUsed !== null ? Number(capacityUsed.toFixed(1)) : null,

      // Check-in
      totalTickets,
      checkedInCount,
      notCheckedInCount,
      checkInRate,
      checkinTimeline,

      // Time series
      dailyRegistrations,
      dailyRevenue,
      hourlyDistribution,
      peakHour: { hour: peakHour.hour, count: peakHour.count },

      // Breakdowns
      tierBreakdown,
      discountUsage,
      totalDiscountUses,
      discountSavings: Number(discountSavings.toFixed(2)),
      providerBreakdown,

      // Recent
      recentRegistrations
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Broadcast email
router.post('/broadcast',
  [
    body('subject').notEmpty().trim(),
    body('content').notEmpty().trim(),
    body('type').isIn(['ALL', 'EVENT']),
    body('eventId').optional()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { subject, content, type, eventId } = req.body;
      let users = [];

      if (type === 'EVENT') {
        if (!eventId) {
          return res.status(400).json({ error: 'Event ID is required for event broadcast' });
        }

        const access = await checkEventAccess(req.user, eventId, ['SUPER_MANAGER']);
        if (!access.hasAccess) {
          return sendAccessDenied(res, access);
        }

        const registrations = await prisma.registration.findMany({
          where: {
            eventId: eventId,
            status: { in: PROTECTED_REGISTRATION_STATUSES }
          },
          select: { userEmail: true },
          distinct: ['userEmail']
        });
        users = registrations.map(r => r.userEmail);

      } else {
        if (req.user.role !== 'ADMIN') {
          return res.status(403).json({ error: 'Admin access required for all-event broadcasts' });
        }

        const registrations = await prisma.registration.findMany({
          where: {
            status: { in: PROTECTED_REGISTRATION_STATUSES }
          },
          select: { userEmail: true },
          distinct: ['userEmail']
        });
        users = registrations.map(r => r.userEmail);
      }

      if (users.length === 0) {
        return res.json({ message: 'No recipients found', count: 0 });
      }

      const { sendCustomEmail } = await import('../services/email.service.js');

      console.log(`Broadcasting to ${users.length} users: ${subject}`);

      (async () => {
        try {
          for (const email of users) {
            await sendCustomEmail(email, subject, content);
          }
          console.log('Broadcast complete');
        } catch (e) {
          console.error('Broadcast error:', e);
        }
      })();

      res.json({ message: `Broadcast started for ${users.length} recipients`, count: users.length });
    } catch (error) {
      console.error('Broadcast error:', error);
      res.status(500).json({ error: 'Failed to initiate broadcast' });
    }
  }
);

// Get financial analytics
router.get('/financials', async (req, res) => {
  try {
    const where = req.user.role === 'ADMIN'
      ? {}
      : { organizerId: req.user.id };

    // Scope: an organizer sees only their events; an admin sees everything.
    const orderScopeWhere = { status: 'PAID', registration: { event: where } };

    // Only fetch the last 6 months of paid orders for the monthly chart.
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [revenueAgg, scopedEvents, recentPaidOrders] = await Promise.all([
      // All-time revenue + ticket count via aggregate (no row transfer).
      prisma.order.aggregate({
        where: orderScopeWhere,
        _sum: { amountCents: true },
        _count: { _all: true }
      }),
      // Lean event list just for the active-events count.
      prisma.event.findMany({ where, select: { endTime: true } }),
      // Lean recent paid orders for the monthly revenue buckets.
      prisma.order.findMany({
        where: { ...orderScopeWhere, createdAt: { gte: sixMonthsAgo } },
        select: { amountCents: true, createdAt: true }
      })
    ]);

    const totalRevenue = revenueAgg._sum.amountCents || 0;
    const totalTickets = revenueAgg._count._all;

    // Initialize last 6 months, then fill from the lean recent-orders window.
    const monthlyRevenue = {};
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyRevenue[key] = 0;
    }

    recentPaidOrders.forEach(order => {
      const orderDate = new Date(order.createdAt);
      const monthKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyRevenue[monthKey] !== undefined) {
        monthlyRevenue[monthKey] += order.amountCents || 0;
      }
    });

    // Calculate previous month's revenue for growth
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

    const currentMonthRevenue = monthlyRevenue[currentMonthKey] || 0;
    const lastMonthRevenue = monthlyRevenue[lastMonthKey] || 0;

    let revenueGrowth = 0;
    if (lastMonthRevenue > 0) {
      revenueGrowth = ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;
    } else if (currentMonthRevenue > 0) {
      revenueGrowth = 100;
    }

    // Active events count
    const activeEvents = scopedEvents.filter(e => new Date(e.endTime) > new Date()).length;

    // Convert monthly revenue to array for chart
    const revenueChart = Object.entries(monthlyRevenue).map(([month, amount]) => ({
      month,
      revenue: amount / 100 // Convert from cents
    }));

    res.json({
      totalRevenue: totalRevenue / 100, // Convert from cents
      totalTickets,
      activeEvents,
      revenueGrowth: Number(revenueGrowth.toFixed(1)),
      revenueChart
    });
  } catch (error) {
    console.error('Get financials error:', error);
    res.status(500).json({ error: 'Failed to fetch financial data' });
  }
});

// Clone an event
router.post('/events/:id/clone', async (req, res) => {
  try {
    const { id } = req.params;

    const originalEvent = await prisma.event.findUnique({
      where: { id },
      include: {
        form: true
      }
    });

    if (!originalEvent) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (originalEvent.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Generate new slug
    const newTitle = `${originalEvent.title} (Copy)`;
    const newSlug = newTitle.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '-' + Date.now();

    // Clone the event
    const clonedEvent = await prisma.event.create({
      data: {
        organizerId: req.user.id,
        title: newTitle,
        slug: newSlug,
        description: originalEvent.description,
        location: originalEvent.location,
        startTime: originalEvent.startTime,
        endTime: originalEvent.endTime,
        capacity: originalEvent.capacity,
        priceCents: originalEvent.priceCents,
        currency: originalEvent.currency,
        type: originalEvent.type,
        category: originalEvent.category,
        tags: originalEvent.tags,
        posterUrl: originalEvent.posterUrl,
        published: false // Always unpublished by default
      },
      include: {
        organizer: {
          select: { name: true, email: true }
        }
      }
    });

    // Clone the form if it exists
    if (originalEvent.form) {
      await prisma.form.create({
        data: {
          eventId: clonedEvent.id,
          schemaJson: originalEvent.form.schemaJson
        }
      });
    }

    res.status(201).json(clonedEvent);
  } catch (error) {
    console.error('Clone event error:', error);
    res.status(500).json({ error: 'Failed to clone event' });
  }
});

// ============================================
// CHECK-IN MANAGEMENT ENDPOINTS
// ============================================

// Get all attendees for an event with check-in status
router.get('/events/:id/attendees', async (req, res) => {
  try {
    const { id } = req.params;
    const { search, status } = req.query;

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const orderWhere = buildAttendeeOrderWhere(status);
    const pagination = parsePagination(req.query);
    const where = {
      eventId: id,
      status: { in: ['PAID', 'CONFIRMED'] },
      ...(search && {
        OR: [
          { userEmail: { contains: search, mode: 'insensitive' } },
          { formResponse: { path: ['name'], string_contains: search } }
        ]
      })
    };

    const [total, registrations] = await Promise.all([
      prisma.registration.count({ where }),
      prisma.registration.findMany({
        where,
        include: {
          orders: {
            where: orderWhere,
            include: {
              ticket: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take
      })
    ]);

    const attendees = mapRegistrationsToAttendees(registrations, status);

    res.json(buildPageResponse(attendees, total, pagination));
  } catch (error) {
    console.error('Get attendees error:', error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Failed to fetch attendees'
    });
  }
});

// Get check-in stats for an event
router.get('/events/:id/checkin-stats', async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
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
    console.error('Get checkin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch check-in stats' });
  }
});

// Manual check-in by ticket ID
router.post('/tickets/:ticketId/checkin', async (req, res) => {
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

    const event = ticket.order.registration.event;
    if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
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
      ticket: checkInResult.ticket
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Failed to check in' });
  }
});

// Manual check-out by ticket ID
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

    const event = ticket.order.registration.event;
    if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
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
    console.error('Check-out error:', error);
    res.status(500).json({ error: 'Failed to check out' });
  }
});

// Undo check-in (reset)
router.post('/tickets/:ticketId/reset-checkin', async (req, res) => {
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

    const event = ticket.order.registration.event;
    if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (ticket.order.status !== 'PAID') {
      return res.status(400).json({ error: 'Ticket is not paid' });
    }

    const resetResult = await resetTicketCheckIn(ticketId, {
      scannedAt: ticket.scannedAt,
      checkedInAt: ticket.checkedInAt,
      checkedOutAt: ticket.checkedOutAt
    });
    if (!resetResult.success) {
      return sendMappedFailure(res, mapResetFailure(resetResult));
    }

    res.json({
      success: true,
      message: 'Check-in reset',
      ticket: resetResult.ticket
    });
  } catch (error) {
    console.error('Reset check-in error:', error);
    res.status(500).json({ error: 'Failed to reset check-in' });
  }
});

// Update ticket style for an event
router.put('/events/:id/ticket-style', async (req, res) => {
  try {
    const { id } = req.params;
    const { ticketStyle } = req.body;

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updatedEvent = await prisma.event.update({
      where: { id },
      data: { ticketStyle }
    });

    res.json({ success: true, ticketStyle: updatedEvent.ticketStyle });
  } catch (error) {
    console.error('Update ticket style error:', error);
    res.status(500).json({ error: 'Failed to update ticket style' });
  }
});

// ============================================
// ENHANCED ANALYTICS ENDPOINTS
// ============================================

// Get conversion funnel data for an event
router.get('/events/:id/analytics/funnel', async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Funnel stages via index-backed counts (no row transfer).
    const [totalRegistrations, paidRegistrations, ticketsIssued, checkedIn] = await Promise.all([
      prisma.registration.count({ where: { eventId: id } }),
      prisma.registration.count({ where: { eventId: id, status: { in: ['PAID', 'CONFIRMED'] } } }),
      prisma.ticket.count({ where: { order: { registration: { eventId: id } } } }),
      prisma.ticket.count({
        where: { order: { registration: { eventId: id } }, checkedInAt: { not: null } }
      })
    ]);

    // Calculate drop-off percentages
    const funnel = [
      { stage: 'Registrations', count: totalRegistrations, percentage: 100 },
      {
        stage: 'Payments',
        count: paidRegistrations,
        percentage: totalRegistrations > 0 ? Math.round((paidRegistrations / totalRegistrations) * 100) : 0,
        dropOff: totalRegistrations > 0 ? Math.round(((totalRegistrations - paidRegistrations) / totalRegistrations) * 100) : 0
      },
      {
        stage: 'Tickets Issued',
        count: ticketsIssued,
        percentage: totalRegistrations > 0 ? Math.round((ticketsIssued / totalRegistrations) * 100) : 0,
        dropOff: paidRegistrations > 0 ? Math.round(((paidRegistrations - ticketsIssued) / paidRegistrations) * 100) : 0
      },
      {
        stage: 'Check-ins',
        count: checkedIn,
        percentage: totalRegistrations > 0 ? Math.round((checkedIn / totalRegistrations) * 100) : 0,
        dropOff: ticketsIssued > 0 ? Math.round(((ticketsIssued - checkedIn) / ticketsIssued) * 100) : 0
      }
    ];

    res.json({ funnel, totalRegistrations, paidRegistrations, ticketsIssued, checkedIn });
  } catch (error) {
    console.error('Get funnel analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch funnel data' });
  }
});

// Get real-time attendance stats for an event
router.get('/events/:id/analytics/realtime', async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const ticketScope = { order: { registration: { eventId: id }, status: 'PAID' } };

    // Six-hour window for the hourly check-in chart.
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setHours(now.getHours() - 5, 0, 0, 0);

    // Scalars via counts; only the recent check-ins are pulled as rows.
    const [totalTickets, checkedIn, checkedOut, recentCheckins] = await Promise.all([
      prisma.ticket.count({ where: ticketScope }),
      prisma.ticket.count({ where: { ...ticketScope, checkedInAt: { not: null } } }),
      prisma.ticket.count({ where: { ...ticketScope, checkedOutAt: { not: null } } }),
      prisma.ticket.findMany({
        where: { ...ticketScope, checkedInAt: { gte: windowStart } },
        select: { checkedInAt: true }
      })
    ]);

    const currentlyInside = checkedIn - checkedOut;
    const notYetArrived = totalTickets - checkedIn;

    // Check-in rate per hour (last 6 hours)
    const hourlyData = [];
    for (let i = 5; i >= 0; i--) {
      const hourStart = new Date(now);
      hourStart.setHours(now.getHours() - i, 0, 0, 0);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hourStart.getHours() + 1);

      const count = recentCheckins.filter(t => {
        if (!t.checkedInAt) return false;
        const checkIn = new Date(t.checkedInAt);
        return checkIn >= hourStart && checkIn < hourEnd;
      }).length;

      hourlyData.push({
        hour: hourStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        checkIns: count
      });
    }

    // Calculate peak attendance (max currently inside at any point)
    // Simplified: just use current as peak for now
    const peakAttendance = currentlyInside;

    res.json({
      totalTickets,
      checkedIn,
      checkedOut,
      currentlyInside,
      notYetArrived,
      checkInRate: totalTickets > 0 ? Math.round((checkedIn / totalTickets) * 100) : 0,
      peakAttendance,
      hourlyData,
      capacity: event.capacity,
      capacityUsed: Math.round((currentlyInside / event.capacity) * 100)
    });
  } catch (error) {
    console.error('Get realtime analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch realtime data' });
  }
});

// ============================================
// TEAM MANAGEMENT ENDPOINTS
// ============================================

// Get team members for an event
router.get('/events/:id/team', async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const teamMembers = await prisma.teamMember.findMany({
      where: { eventId: id },
      orderBy: { invitedAt: 'desc' }
    });

    res.json(teamMembers.map(withTeamInviteLink));
  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// Invite a team member
router.post('/events/:id/team', async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name, role } = req.body;
    const normalizedEmail = normalizeTeamEmail(email);
    const normalizedRole = normalizeTeamRole(role);

    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!normalizedRole) {
      return res.status(400).json({ error: 'Invalid team role' });
    }

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Check if already a team member
    const existing = await prisma.teamMember.findUnique({
      where: { eventId_email: { eventId: id, email: normalizedEmail } }
    });

    if (existing) {
      return res.status(400).json({ error: 'User is already a team member' });
    }

    const teamMember = await prisma.teamMember.create({
      data: {
        eventId: id,
        email: normalizedEmail,
        name: name || null,
        role: normalizedRole
      }
    });

    res.status(201).json(withTeamInviteLink(teamMember));
  } catch (error) {
    console.error('Invite team member error:', error);
    res.status(500).json({ error: 'Failed to invite team member' });
  }
});

// Update team member role
router.put('/events/:id/team/:memberId', async (req, res) => {
  try {
    const { id, memberId } = req.params;
    const { role } = req.body;
    const normalizedRole = hasOwn(req.body || {}, 'role') ? normalizeTeamRole(role) : null;

    if (!normalizedRole) {
      return res.status(400).json({ error: 'Invalid team role' });
    }

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const existingMember = await prisma.teamMember.findUnique({ where: { id: memberId } });
    if (!existingMember || existingMember.eventId !== id) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    const teamMember = await prisma.teamMember.update({
      where: { id: memberId },
      data: { role: normalizedRole }
    });

    res.json(teamMember);
  } catch (error) {
    console.error('Update team member error:', error);
    res.status(500).json({ error: 'Failed to update team member' });
  }
});

// Remove team member
router.delete('/events/:id/team/:memberId', async (req, res) => {
  try {
    const { id, memberId } = req.params;

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (event.organizerId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const existingMember = await prisma.teamMember.findUnique({ where: { id: memberId } });
    if (!existingMember || existingMember.eventId !== id) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    await prisma.teamMember.delete({
      where: { id: memberId }
    });

    res.json({ success: true, message: 'Team member removed' });
  } catch (error) {
    console.error('Remove team member error:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

export default router;
