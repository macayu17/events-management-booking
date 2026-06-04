import prisma from '../config/db.js';
import { TICKET_EXPIRY_GRACE_MS, isTicketExpired } from '../utils/ticket-access.util.js';

const CHECKIN_ELIGIBLE_REGISTRATION_STATUSES = ['PAID', 'CONFIRMED'];

export { isTicketExpired };

const expiryCutoffFrom = (date) => new Date(date.getTime() - TICKET_EXPIRY_GRACE_MS);

const ticketTransitionSelect = {
  scannedAt: true,
  checkedInAt: true,
  checkedOutAt: true,
  revoked: true,
  validUntil: true,
  order: {
    select: {
      status: true,
      registration: {
        select: { status: true }
      }
    }
  }
};

const ticketFreshnessGuard = (now) => ({
  revoked: false,
  OR: [
    { validUntil: null },
    { validUntil: { gte: expiryCutoffFrom(now) } }
  ]
});

const checkInEligibilityGuard = (now) => ({
  ...ticketFreshnessGuard(now),
  order: {
    status: 'PAID',
    registration: {
      status: { in: CHECKIN_ELIGIBLE_REGISTRATION_STATUSES }
    }
  }
});

const currentTicketState = (ticketId) => prisma.ticket.findUnique({
  where: { id: ticketId },
  select: ticketTransitionSelect
});

const blockedTransition = (blockedReason, ticket, fallbackAt) => ({
  success: false,
  checkedIn: false,
  checkedOut: false,
  reset: false,
  blockedReason,
  scannedAt: ticket?.scannedAt || null,
  checkedInAt: ticket?.checkedInAt || null,
  checkedOutAt: ticket?.checkedOutAt || null,
  fallbackAt
});

export const classifyCheckInBlocker = (ticket, now = new Date()) => {
  if (!ticket) return blockedTransition('not-found', ticket, now);
  if (ticket.revoked) return blockedTransition('revoked', ticket, now);
  if (isTicketExpired(ticket)) return blockedTransition('expired', ticket, now);
  if (
    ticket.order?.status !== 'PAID'
    || !CHECKIN_ELIGIBLE_REGISTRATION_STATUSES.includes(ticket.order?.registration?.status)
  ) {
    return blockedTransition('not-eligible', ticket, now);
  }
  return blockedTransition('already-checked-in', ticket, now);
};

export const classifyCheckOutBlocker = (ticket, now = new Date()) => {
  if (!ticket) return blockedTransition('not-found', ticket, now);
  if (!ticket.checkedInAt) return blockedTransition('not-checked-in', ticket, now);
  return blockedTransition('already-checked-out', ticket, now);
};

export const classifyResetBlocker = (ticket, now = new Date()) => {
  if (!ticket) return blockedTransition('not-found', ticket, now);
  if (ticket.scannedAt || ticket.checkedInAt || ticket.checkedOutAt) {
    return blockedTransition('state-changed', ticket, now);
  }
  return blockedTransition('not-checked-in', ticket, now);
};

export async function markTicketCheckedIn(ticketId, userId) {
  const now = new Date();
  const updateResult = await prisma.ticket.updateMany({
    where: {
      id: ticketId,
      scannedAt: null,
      checkedInAt: null,
      ...checkInEligibilityGuard(now)
    },
    data: {
      scannedAt: now,
      checkedInAt: now,
      checkedInBy: userId
    }
  });

  if (updateResult.count === 0) {
    return classifyCheckInBlocker(await currentTicketState(ticketId), now);
  }

  return {
    success: true,
    checkedIn: true,
    ticket: await prisma.ticket.findUnique({ where: { id: ticketId } })
  };
}

export async function markTicketCheckedOut(ticketId) {
  const now = new Date();
  const updateResult = await prisma.ticket.updateMany({
    where: {
      id: ticketId,
      checkedInAt: { not: null },
      checkedOutAt: null
    },
    data: {
      checkedOutAt: now
    }
  });

  if (updateResult.count === 0) {
    return classifyCheckOutBlocker(await currentTicketState(ticketId), now);
  }

  return {
    success: true,
    checkedOut: true,
    ticket: await prisma.ticket.findUnique({ where: { id: ticketId } })
  };
}

const expectedStateWhere = (expectedState) => {
  if (!expectedState) return {};

  return {
    scannedAt: expectedState.scannedAt || null,
    checkedInAt: expectedState.checkedInAt || null,
    checkedOutAt: expectedState.checkedOutAt || null
  };
};

export async function resetTicketCheckIn(ticketId, expectedState = null) {
  const now = new Date();
  const updateResult = await prisma.ticket.updateMany({
    where: {
      id: ticketId,
      ...expectedStateWhere(expectedState),
      OR: [
        { scannedAt: { not: null } },
        { checkedInAt: { not: null } },
        { checkedOutAt: { not: null } },
      ]
    },
    data: {
      scannedAt: null,
      checkedInAt: null,
      checkedOutAt: null,
      checkedInBy: null
    }
  });

  if (updateResult.count === 0) {
    return classifyResetBlocker(await currentTicketState(ticketId), now);
  }

  return {
    success: true,
    reset: true,
    ticket: await prisma.ticket.findUnique({ where: { id: ticketId } })
  };
}
