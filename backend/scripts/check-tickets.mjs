import prisma from '../src/config/db.js';

async function checkTickets() {
  try {
    const tickets = await prisma.ticket.findMany({
      take: 5,
      orderBy: { issuedAt: 'desc' },
      include: {
        order: {
          include: {
            registration: true
          }
        }
      }
    });

    console.log(`Found ${tickets.length} recent tickets`);

    for (const ticket of tickets) {
      let qrPayload;
      try {
        qrPayload = JSON.parse(ticket.qrPayload);
      } catch {
        qrPayload = { error: 'Could not parse QR payload' };
      }

      console.log('-'.repeat(60));
      console.log('Ticket ID in DB:', ticket.id);
      console.log('Ticket ID in QR:', qrPayload.ticketId || '(missing)');
      console.log('IDs match:', ticket.id === qrPayload.ticketId ? 'yes' : 'no');
      console.log('Order ID:', ticket.orderId);
      console.log('Issued at:', ticket.issuedAt);
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkTickets().catch((error) => {
  console.error('Ticket check failed:', error.message);
  process.exitCode = 1;
});
