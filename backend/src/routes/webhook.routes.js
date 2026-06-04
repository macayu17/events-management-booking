import express from 'express';
import prisma from '../config/db.js';
import { verifyRazorpayWebhookSignature } from '../services/payment.service.js';
import { completePaidOrder } from '../services/order-completion.service.js';

const router = express.Router();

// Razorpay webhook
router.post('/payments', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const body = req.body;

    // Verify signature
    const isValid = verifyRazorpayWebhookSignature(body, signature);

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(body.toString());

    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      const orderId = payment.order_id;
      if (!orderId) {
        return res.status(400).json({ error: 'Webhook payment is missing order id' });
      }

      // Find order
      const order = await prisma.order.findUnique({
        where: {
          provider_providerOrderId: {
            provider: 'RAZORPAY',
            providerOrderId: orderId
          }
        }
      });

      if (!order) {
        console.error('Order not found:', orderId);
        return res.status(404).json({ error: 'Order not found' });
      }

      if (
        order.provider !== 'RAZORPAY' ||
        order.amountCents !== payment.amount ||
        order.currency !== payment.currency
      ) {
        return res.status(400).json({ error: 'Webhook payment does not match order' });
      }

      if (order.status === 'PAID') {
        return res.json({ received: true, alreadyProcessed: true });
      }

      if (order.status === 'FAILED') {
        console.error('Captured payment ignored because local order is failed:', orderId);
        return res.json({ received: true, ignored: true, reason: 'order_failed' });
      }

      await completePaidOrder(order.id, {
        razorpayWebhook: payment
      });

      console.log('Payment processed successfully:', orderId);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Webhook processing failed'
    });
  }
});

export default router;
