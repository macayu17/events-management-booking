import { Queue, Worker } from 'bullmq';
import { generateTicketPDF, createTicketRecord } from './ticket.service.js';
import { sendTicketEmail } from './email.service.js';
import { sendBookingNotifications } from './twilio.service.js';
import prisma from '../config/db.js';

let connection = null;
let ticketQueue = null;
let emailQueue = null;
let isRedisAvailable = false;

// Try to connect to Redis
async function initializeRedis() {
  try {
    const { default: redisClient } = await import('../config/redis.js');
    connection = redisClient;

    // Test connection
    await redisClient.ping();
    isRedisAvailable = true;

    // Create queues
    ticketQueue = new Queue('ticket-generation', { connection });
    emailQueue = new Queue('email-sending', { connection });

    // Ticket generation worker
    const ticketWorker = new Worker(
      'ticket-generation',
      async (job) => {
        const { orderId } = job.data;
        console.log(`Processing ticket generation for order: ${orderId}`);

        try {
          const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
              registration: {
                include: {
                  event: true
                }
              }
            }
          });

          if (!order) {
            throw new Error('Order not found');
          }

          const ticket = await generateTicketPDF(order);
          const event = order.registration.event;
          const formResponse = order.registration.formResponse;

          await emailQueue.add('send-ticket-email', {
            ticketId: ticket.id,
            email: order.registration.userEmail,
            phone: formResponse.phone || formResponse.phoneNumber || null,
            eventDetails: {
              eventTitle: event.title,
              location: event.location,
              dateTime: new Date(event.startTime).toLocaleString(),
              ticketId: ticket.id.substring(0, 8).toUpperCase()
            }
          });

          console.log(`Ticket generated successfully for order: ${orderId}`);
          return { success: true, ticketId: ticket.id };
        } catch (error) {
          console.error('Ticket generation failed:', error);
          throw error;
        }
      },
      { connection }
    );

    // Email sending worker
    const emailWorker = new Worker(
      'email-sending',
      async (job) => {
        const { ticketId, email, phone, eventDetails } = job.data;
        console.log(`Sending ticket email to: ${email}`);

        try {
          await sendTicketEmail(ticketId, email);
          console.log(`Ticket email sent successfully to: ${email}`);

          // Send SMS/WhatsApp notifications if phone number is available
          if (phone && eventDetails) {
            try {
              await sendBookingNotifications(phone, eventDetails);
              console.log(`SMS/WhatsApp notifications sent to: ${phone}`);
            } catch (twilioErr) {
              console.warn('Twilio notifications failed:', twilioErr.message);
            }
          }

          return { success: true };
        } catch (error) {
          console.error('Email sending failed:', error);
          throw error;
        }
      },
      { connection }
    );

    // Event listeners
    ticketWorker.on('completed', (job) => {
      console.log(`Job ${job.id} completed successfully`);
    });

    ticketWorker.on('failed', (job, err) => {
      console.error(`Job ${job.id} failed:`, err);
    });

    emailWorker.on('completed', (job) => {
      console.log(`Email job ${job.id} completed successfully`);
    });

    emailWorker.on('failed', (job, err) => {
      console.error(`Email job ${job.id} failed:`, err);
    });

    console.log('✅ Redis queues initialized');
  } catch (error) {
    console.warn('⚠️ Redis not available - background jobs will run synchronously');
    isRedisAvailable = false;
  }
}

// Initialize on module load
initializeRedis();

// Helper functions with fallback
export async function enqueueTicketGeneration(orderId) {
  if (isRedisAvailable && ticketQueue) {
    await ticketQueue.add('generate-ticket', { orderId }, {
      jobId: `ticket:${orderId}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
  } else {
    // Fallback: process in background without blocking the response
    // Use setImmediate to allow the API response to complete first
    console.log('Creating ticket record in background (Redis not available)');

    setImmediate(async () => {
      try {
        console.log(`Background ticket creation starting for order: ${orderId}`);
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: {
            registration: {
              include: {
                event: true
              }
            }
          }
        });

        if (order) {
          // Just create the ticket record (no PDF/Cloudinary)
          // PDF will be generated on-demand when user downloads or gets email
          const ticket = await createTicketRecord(order);
          console.log(`Ticket record created: ${ticket.id}`);

          const event = order.registration.event;
          const formResponse = order.registration.formResponse;

          // Try to send email (will generate PDF attachment on demand)
          try {
            await sendTicketEmail(ticket.id, order.registration.userEmail);
            console.log(`Email sent to: ${order.registration.userEmail}`);
          } catch (emailErr) {
            console.warn('Email sending failed:', emailErr.message);
          }

          // Send SMS/WhatsApp notifications
          const phone = formResponse.phone || formResponse.phoneNumber;
          if (phone) {
            try {
              await sendBookingNotifications(phone, {
                eventTitle: event.title,
                location: event.location,
                dateTime: new Date(event.startTime).toLocaleString(),
                ticketId: ticket.id.substring(0, 8).toUpperCase()
              });
              console.log(`SMS/WhatsApp notifications sent to: ${phone}`);
            } catch (twilioErr) {
              console.warn('Twilio notifications failed:', twilioErr.message);
            }
          }
        }
      } catch (error) {
        console.error('Background ticket creation failed:', error);
      }
    });
  }
}

export async function enqueueEmailSending(ticketId, email) {
  if (isRedisAvailable && emailQueue) {
    await emailQueue.add('send-ticket-email', { ticketId, email }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
  } else {
    // Fallback: send synchronously
    console.log('Sending email synchronously (Redis not available)');
    try {
      await sendTicketEmail(ticketId, email);
      console.log(`Email sent synchronously to: ${email}`);
    } catch (error) {
      console.warn('Email sending failed (check SMTP settings):', error.message);
    }
  }
}

export { ticketQueue, emailQueue };
