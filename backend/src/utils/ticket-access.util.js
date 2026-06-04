export const TICKET_EXPIRY_GRACE_MS = 24 * 60 * 60 * 1000;

const toDate = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const isTicketExpired = (ticket, now = new Date()) => {
  if (!ticket?.validUntil) return false;

  const validUntil = toDate(ticket.validUntil);
  if (!validUntil) return true;

  const graceEnd = new Date(validUntil.getTime() + TICKET_EXPIRY_GRACE_MS);
  return now > graceEnd;
};

export const getTicketArtifactBlocker = (ticket, now = new Date()) => {
  if (!ticket) {
    return { statusCode: 404, message: 'Ticket not found' };
  }

  if (ticket.revoked) {
    return { statusCode: 410, message: 'Ticket has been revoked' };
  }

  if (isTicketExpired(ticket, now)) {
    return { statusCode: 410, message: 'Ticket has expired' };
  }

  if (ticket.order?.status && ticket.order.status !== 'PAID') {
    return { statusCode: 409, message: 'Ticket download is available after payment is complete' };
  }

  return null;
};
