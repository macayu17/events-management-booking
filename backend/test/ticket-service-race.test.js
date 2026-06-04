import assert from 'node:assert/strict';
import test from 'node:test';
import prisma from '../src/config/db.js';

process.env.QR_SECRET_KEY = 'test-secret';
const { createTicketRecord } = await import('../src/services/ticket.service.js');

const buildOrder = () => ({
  id: 'order-race-1',
  registrationId: 'registration-race-1',
  registration: {
    event: {
      id: 'event-race-1',
      endTime: new Date('2030-01-01T00:00:00.000Z')
    }
  }
});

test('ticket creation refetches after an orderId unique race', async () => {
  const originalTicket = prisma.ticket;
  const ticketFromWinningRequest = {
    id: 'ticket-race-1',
    orderId: 'order-race-1',
    qrPayload: '{}',
    validUntil: new Date('2030-01-01T00:00:00.000Z')
  };

  let findUniqueCalls = 0;
  let createCalls = 0;
  let updateCalls = 0;

  prisma.ticket = {
    findUnique: async ({ where }) => {
      assert.deepEqual(where, { orderId: 'order-race-1' });
      findUniqueCalls += 1;
      return findUniqueCalls === 1 ? null : ticketFromWinningRequest;
    },
    create: async ({ data }) => {
      createCalls += 1;
      assert.equal(data.orderId, 'order-race-1');
      assert.equal(data.qrPayload, '{}');
      const error = new Error('Unique constraint failed on orderId');
      error.code = 'P2002';
      error.meta = { target: ['orderId'] };
      throw error;
    },
    update: async ({ where, data }) => {
      updateCalls += 1;
      assert.deepEqual(where, { id: 'ticket-race-1' });
      const payload = JSON.parse(data.qrPayload);
      assert.equal(payload.ticketId, 'ticket-race-1');
      assert.equal(payload.orderId, 'order-race-1');
      assert.equal(payload.eventId, 'event-race-1');
      assert.equal(payload.registrationId, 'registration-race-1');
      assert.equal(typeof payload.sig, 'string');
      return { ...ticketFromWinningRequest, qrPayload: data.qrPayload };
    }
  };

  try {
    const ticket = await createTicketRecord(buildOrder());
    const payload = JSON.parse(ticket.qrPayload);

    assert.equal(ticket.id, 'ticket-race-1');
    assert.equal(payload.orderId, 'order-race-1');
    assert.equal(findUniqueCalls, 2);
    assert.equal(createCalls, 1);
    assert.equal(updateCalls, 1);
  } finally {
    prisma.ticket = originalTicket;
  }
});
