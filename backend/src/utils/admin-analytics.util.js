export function summarizeRegistrationStatuses(registrations = []) {
  return registrations.reduce((summary, registration) => {
    if (registration.status === 'PAID') summary.paidRegistrations += 1;
    if (registration.status === 'PENDING') summary.pendingRegistrations += 1;
    if (registration.status === 'CANCELLED') summary.cancelledRegistrations += 1;
    if (registration.orders?.some((order) => order.status === 'FAILED')) {
      summary.failedRegistrations += 1;
    }
    return summary;
  }, {
    paidRegistrations: 0,
    pendingRegistrations: 0,
    failedRegistrations: 0,
    cancelledRegistrations: 0,
  });
}
