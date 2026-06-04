const STATUS_FILTERS = new Set(['checked-in', 'not-checked-in', 'checked-out']);

export function normalizeAttendeeStatusFilter(status) {
  return STATUS_FILTERS.has(status) ? status : null;
}

export function buildAttendeeTicketWhere(status) {
  const normalizedStatus = normalizeAttendeeStatusFilter(status);

  if (normalizedStatus === 'checked-in') {
    return { checkedInAt: { not: null } };
  }

  if (normalizedStatus === 'not-checked-in') {
    return { checkedInAt: null };
  }

  if (normalizedStatus === 'checked-out') {
    return { checkedOutAt: { not: null } };
  }

  return {};
}

export function buildAttendeeOrderWhere(status) {
  const ticketWhere = buildAttendeeTicketWhere(status);

  return {
    status: 'PAID',
    ticket: Object.keys(ticketWhere).length > 0
      ? { is: ticketWhere }
      : { isNot: null },
  };
}

export function ticketMatchesAttendeeStatus(ticket, status) {
  const normalizedStatus = normalizeAttendeeStatusFilter(status);
  if (!ticket) return false;

  if (normalizedStatus === 'checked-in') return Boolean(ticket.checkedInAt);
  if (normalizedStatus === 'not-checked-in') return !ticket.checkedInAt;
  if (normalizedStatus === 'checked-out') return Boolean(ticket.checkedOutAt);

  return true;
}

export function mapRegistrationsToAttendees(registrations = [], status) {
  return registrations.flatMap((registration) => (
    registration.orders
      .filter((order) => ticketMatchesAttendeeStatus(order.ticket, status))
      .map((order) => ({
        id: order.ticket.id,
        ticketId: order.ticket.id,
        ticketShortId: order.ticket.id.substring(0, 8).toUpperCase(),
        orderId: order.id,
        name: registration.formResponse?.name || 'N/A',
        email: registration.userEmail,
        phone: registration.formResponse?.phone || null,
        checkedInAt: order.ticket.checkedInAt,
        checkedOutAt: order.ticket.checkedOutAt,
        checkedInBy: order.ticket.checkedInBy,
        issuedAt: order.ticket.issuedAt,
        bookedAt: registration.createdAt,
        revoked: order.ticket.revoked,
      }))
  ));
}
