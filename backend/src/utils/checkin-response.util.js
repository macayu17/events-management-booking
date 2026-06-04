const response = (status, body) => ({ status, body });

const checkedInAtFrom = (result) => result.checkedInAt || result.scannedAt || result.fallbackAt;

export const mapCheckInFailure = (result) => {
  switch (result?.blockedReason) {
    case 'not-found':
      return response(404, { error: 'Ticket not found' });
    case 'revoked':
      return response(400, { error: 'Ticket has been revoked' });
    case 'expired':
      return response(400, { error: 'Ticket has expired' });
    case 'not-eligible':
      return response(400, { error: 'Ticket is not eligible for check-in' });
    default:
      return response(400, {
        error: 'Already checked in',
        checkedInAt: checkedInAtFrom(result || {})
      });
  }
};

export const mapCheckOutFailure = (result) => {
  switch (result?.blockedReason) {
    case 'not-found':
      return response(404, { error: 'Ticket not found' });
    case 'revoked':
      return response(400, { error: 'Ticket has been revoked' });
    case 'expired':
      return response(400, { error: 'Ticket has expired' });
    case 'not-checked-in':
      return response(400, { error: 'Not checked in yet' });
    default:
      return response(400, {
        error: 'Already checked out',
        checkedOutAt: result?.checkedOutAt || result?.fallbackAt
      });
  }
};

export const mapResetFailure = (result) => {
  switch (result?.blockedReason) {
    case 'not-found':
      return response(404, { error: 'Ticket not found' });
    case 'revoked':
      return response(400, { error: 'Ticket has been revoked' });
    case 'expired':
      return response(400, { error: 'Ticket has expired' });
    case 'state-changed':
      return response(409, { error: 'Ticket check-in state changed. Refresh and try again.' });
    default:
      return response(400, { error: 'No check-in to reset' });
  }
};

export const mapTicketScanCheckInFailure = (result, { attendee } = {}) => {
  switch (result?.blockedReason) {
    case 'not-found':
      return response(404, { valid: false, error: 'Ticket not found' });
    case 'revoked':
      return response(400, { valid: false, error: 'Ticket has been revoked' });
    case 'expired':
      return response(400, { valid: false, error: 'Ticket has expired' });
    case 'not-eligible':
      return response(400, { valid: false, error: 'Ticket is not eligible for check-in' });
    default:
      return response(400, {
        valid: false,
        alreadyScanned: true,
        error: 'Ticket already used',
        scannedAt: checkedInAtFrom(result || {}),
        attendee
      });
  }
};

export const sendMappedFailure = (res, mapped) => res.status(mapped.status).json(mapped.body);
