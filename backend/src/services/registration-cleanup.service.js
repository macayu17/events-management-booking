import prisma from '../config/db.js';

export async function deleteUnstartedRegistrationDraft(registrationId) {
  const result = await prisma.registration.deleteMany({
    where: {
      id: registrationId,
      status: 'PENDING',
      orders: {
        every: {
          status: 'CREATED',
          providerOrderId: null,
          ticket: { is: null },
        },
      },
    },
  });

  return result.count;
}
