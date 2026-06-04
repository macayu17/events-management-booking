import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAttendeeOrderWhere,
  buildAttendeeTicketWhere,
  mapRegistrationsToAttendees,
  normalizeAttendeeStatusFilter,
  ticketMatchesAttendeeStatus,
} from '../src/utils/admin-attendees.util.js';

const baseTicket = {
  id: 'ticket-12345678',
  checkedInAt: null,
  checkedOutAt: null,
  checkedInBy: null,
  issuedAt: new Date('2026-06-03T10:00:00.000Z'),
  revoked: false,
};

const registration = {
  userEmail: 'attendee@example.com',
  formResponse: { name: 'Attendee One', phone: '1234567890' },
  createdAt: new Date('2026-06-03T09:00:00.000Z'),
  orders: [
    {
      id: 'order-1',
      ticket: {
        ...baseTicket,
        id: 'ticket-checked-in',
        checkedInAt: new Date('2026-06-03T11:00:00.000Z'),
      },
    },
    {
      id: 'order-2',
      ticket: {
        ...baseTicket,
        id: 'ticket-not-checked-in',
      },
    },
    {
      id: 'order-3',
      ticket: {
        ...baseTicket,
        id: 'ticket-checked-out',
        checkedInAt: new Date('2026-06-03T11:00:00.000Z'),
        checkedOutAt: new Date('2026-06-03T12:00:00.000Z'),
      },
    },
    {
      id: 'order-4',
      ticket: null,
    },
  ],
};

test('attendee status filter normalizes supported query values', () => {
  assert.equal(normalizeAttendeeStatusFilter('checked-in'), 'checked-in');
  assert.equal(normalizeAttendeeStatusFilter('not-checked-in'), 'not-checked-in');
  assert.equal(normalizeAttendeeStatusFilter('checked-out'), 'checked-out');
  assert.equal(normalizeAttendeeStatusFilter('all'), null);
  assert.equal(normalizeAttendeeStatusFilter(undefined), null);
});

test('attendee ticket where maps status filters to Prisma relation filters', () => {
  assert.deepEqual(buildAttendeeTicketWhere('checked-in'), {
    checkedInAt: { not: null },
  });
  assert.deepEqual(buildAttendeeTicketWhere('not-checked-in'), {
    checkedInAt: null,
  });
  assert.deepEqual(buildAttendeeTicketWhere('checked-out'), {
    checkedOutAt: { not: null },
  });
  assert.deepEqual(buildAttendeeTicketWhere('all'), {});
});

test('attendee order where applies paid status and ticket relation filtering in Prisma shape', () => {
  assert.deepEqual(buildAttendeeOrderWhere('checked-in'), {
    status: 'PAID',
    ticket: { is: { checkedInAt: { not: null } } },
  });
  assert.deepEqual(buildAttendeeOrderWhere('not-checked-in'), {
    status: 'PAID',
    ticket: { is: { checkedInAt: null } },
  });
  assert.deepEqual(buildAttendeeOrderWhere('all'), {
    status: 'PAID',
    ticket: { isNot: null },
  });
});

test('attendee status matcher keeps null tickets out of mapped results', () => {
  assert.equal(ticketMatchesAttendeeStatus(null, 'checked-in'), false);
  assert.equal(ticketMatchesAttendeeStatus(baseTicket, 'not-checked-in'), true);
  assert.equal(ticketMatchesAttendeeStatus({ ...baseTicket, checkedInAt: new Date() }, 'checked-in'), true);
  assert.equal(ticketMatchesAttendeeStatus({ ...baseTicket, checkedOutAt: new Date() }, 'checked-out'), true);
});

test('attendee mapper filters and flattens registrations consistently', () => {
  assert.deepEqual(
    mapRegistrationsToAttendees([registration], 'checked-in').map((attendee) => attendee.ticketId),
    ['ticket-checked-in', 'ticket-checked-out']
  );
  assert.deepEqual(
    mapRegistrationsToAttendees([registration], 'not-checked-in').map((attendee) => attendee.ticketId),
    ['ticket-not-checked-in']
  );
  assert.deepEqual(
    mapRegistrationsToAttendees([registration], 'checked-out').map((attendee) => attendee.ticketId),
    ['ticket-checked-out']
  );

  const [attendee] = mapRegistrationsToAttendees([registration], 'not-checked-in');
  assert.equal(attendee.name, 'Attendee One');
  assert.equal(attendee.email, 'attendee@example.com');
  assert.equal(attendee.ticketShortId, 'TICKET-N');
});
