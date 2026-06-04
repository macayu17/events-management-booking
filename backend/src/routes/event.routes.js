import express from 'express';
import { createEvent } from 'ics';
import prisma from '../config/db.js';
import { buildEventListWhere } from '../utils/event-query.util.js';
import { DEFAULT_FORM_SCHEMA } from '../utils/form-schema.util.js';

const router = express.Router();

const sendRouteError = (res, error, fallbackMessage) => {
  res.status(error.statusCode || 500).json({
    error: error.statusCode ? error.message : fallbackMessage
  });
};

const logRouteError = (message, error) => {
  if (error.statusCode && error.statusCode < 500) {
    console.warn(`${message}: ${error.message}`);
    return;
  }

  console.error(`${message}:`, error);
};

// Get all published events with filters
router.get('/', async (req, res) => {
  try {
    const where = buildEventListWhere(req.query);

    const events = await prisma.event.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        location: true,
        startTime: true,
        endTime: true,
        capacity: true,
        priceCents: true,
        currency: true,
        category: true,
        tags: true,
        posterUrl: true,
        createdAt: true,
        organizer: {
          select: {
            name: true,
            email: true
          }
        },
        _count: {
          select: {
            registrations: {
              where: { status: { in: ['PAID', 'CONFIRMED'] } }
            }
          }
        }
      },
      orderBy: { startTime: 'asc' }
    });

    res.json(events);
  } catch (error) {
    logRouteError('Get events error', error);
    sendRouteError(res, error, 'Failed to fetch events');
  }
});

// Get available categories
router.get('/meta/categories', async (req, res) => {
  const categories = [
    { value: 'MUSIC', label: 'Music & Concerts' },
    { value: 'TECH', label: 'Tech & Innovation' },
    { value: 'SPORTS', label: 'Sports & Fitness' },
    { value: 'ARTS', label: 'Arts & Culture' },
    { value: 'BUSINESS', label: 'Business & Networking' },
    { value: 'EDUCATION', label: 'Education & Workshops' },
    { value: 'FOOD', label: 'Food & Drinks' },
    { value: 'HEALTH', label: 'Health & Wellness' },
    { value: 'SOCIAL', label: 'Social & Community' },
    { value: 'OTHER', label: 'Other' }
  ];
  res.json(categories);
});

// Download ICS
router.get('/:id/calendar', async (req, res) => {
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, published: true }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const start = new Date(event.startTime);
    const end = new Date(event.endTime);

    // Format dates for ICS ([year, month, day, hour, minute])
    const eventAttributes = {
      start: [start.getFullYear(), start.getMonth() + 1, start.getDate(), start.getHours(), start.getMinutes()],
      end: [end.getFullYear(), end.getMonth() + 1, end.getDate(), end.getHours(), end.getMinutes()],
      title: event.title,
      description: event.description,
      location: event.location,
      url: `${process.env.FRONTEND_URL}/events/${event.id}`,
      // Use event.organizerId or fetch organizer detail if needed, simple for now
    };

    createEvent(eventAttributes, (error, value) => {
      if (error) {
        console.error('ICS Generation error:', error);
        return res.status(500).json({ error: 'Failed to generate calendar file' });
      }

      res.setHeader('Content-Type', 'text/calendar');
      res.setHeader('Content-Disposition', `attachment; filename="${event.slug || 'event'}.ics"`);
      res.send(value);
    });

  } catch (error) {
    console.error('Calendar download error:', error);
    res.status(500).json({ error: 'Failed to generate calendar file' });
  }
});

// Get single event by ID or slug
router.get('/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;

    const event = await prisma.event.findFirst({
      where: {
        OR: [
          { id: identifier },
          { slug: identifier }
        ],
        published: true
      },
      include: {
        organizer: {
          select: {
            name: true,
            email: true
          }
        },
        form: true,
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

    res.json(event);
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// Get event form
router.get('/:id/form', async (req, res) => {
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, published: true },
      select: { id: true }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    let form = await prisma.form.findUnique({
      where: { eventId: event.id }
    });

    // If no form exists, return a default form
    if (!form) {
      const defaultForm = {
        id: 'default',
        eventId: event.id,
        schemaJson: DEFAULT_FORM_SCHEMA,
        createdAt: new Date()
      };
      return res.json(defaultForm);
    }

    res.json(form);
  } catch (error) {
    console.error('Get form error:', error);
    res.status(500).json({ error: 'Failed to fetch form' });
  }
});

export default router;
