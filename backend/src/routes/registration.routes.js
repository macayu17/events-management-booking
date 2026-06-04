import express from 'express';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import crypto from 'crypto';
import prisma from '../config/db.js';
import { createRazorpayOrder, createPhonePePayment } from '../services/payment.service.js';
import { completePaidOrder, mergePaymentData } from '../services/order-completion.service.js';
import {
  countBlockingCheckoutHoldsForTicketTier,
  countReservedEventCapacity,
  releaseCheckoutReservation,
  reserveOrderForCheckout
} from '../services/checkout-reservation.service.js';
import { completePhonePeOrderFromProviderStatus } from '../services/phonepe-reconciliation.service.js';
import { deleteUnstartedRegistrationDraft } from '../services/registration-cleanup.service.js';
import {
  buildTicketTierSnapshot,
  calculateDiscountedAmountCents,
  isDiscountUsable,
  normalizeDiscountCode,
  resolveSelectedTicketTier
} from '../utils/registration-pricing.util.js';
import { createTicketDownloadToken } from '../utils/download-token.util.js';
import { createCheckoutAccessToken, verifyCheckoutAccessToken } from '../utils/checkout-token.util.js';
import { DEFAULT_FORM_SCHEMA, formSchemaToAjv } from '../utils/form-schema.util.js';

const router = express.Router();
const ajv = new Ajv();
addFormats(ajv);

const createPaymentCallbackNonce = () => crypto.randomBytes(24).toString('base64url');
const routeError = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// Register for an event
router.post('/events/:id/register', async (req, res) => {
  try {
    const { id } = req.params;
    const { formResponse, discountCode, paymentGateway, tierId } = req.body;
    const selectedGateway = paymentGateway === 'PHONEPE' ? 'PHONEPE' : 'RAZORPAY';

    // Get event and form
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        form: true,
        ticketTiers: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (!event.published) {
      return res.status(400).json({ error: 'Event is not published' });
    }

    if (new Date(event.startTime) <= new Date()) {
      return res.status(409).json({ error: 'Registration is closed for this event' });
    }

    if (event.capacity > 0) {
      const reservedCount = await countReservedEventCapacity(id);

      if (reservedCount >= event.capacity) {
        return res.status(409).json({ error: 'Event is sold out' });
      }
    }

    const tierSelection = resolveSelectedTicketTier(event.ticketTiers, tierId);
    if (tierSelection.error) {
      return res.status(tierSelection.statusCode).json({ error: tierSelection.error });
    }
    const selectedTier = tierSelection.selectedTier;
    if (selectedTier?.capacity) {
      const activeTierHolds = await countBlockingCheckoutHoldsForTicketTier(selectedTier.id);
      if (selectedTier.soldCount + activeTierHolds >= selectedTier.capacity) {
        return res.status(409).json({ error: 'Selected ticket tier is sold out' });
      }
    }

    // Get form schema - use default if no custom form exists
    let formSchema;
    if (event.form) {
      formSchema = event.form.schemaJson;
    } else {
      formSchema = DEFAULT_FORM_SCHEMA;
    }

    // Validate form response
    let validate;
    try {
      validate = ajv.compile(formSchemaToAjv(formSchema));
    } catch (schemaError) {
      return res.status(400).json({ error: 'Registration form is misconfigured', message: schemaError.message });
    }

    if (!validate(formResponse)) {
      console.error('Form validation failed:', validate.errors);
      return res.status(400).json({
        error: 'Invalid form data',
        details: validate.errors
      });
    }

    // Extract email from form response
    const userEmail = formResponse.email;

    if (!userEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Create registration
    const registration = await prisma.registration.create({
      data: {
        eventId: id,
        userEmail,
        formResponse,
        status: 'PENDING'
      }
    });

    // Calculate Amount & Validate Discount
    const baseAmountCents = selectedTier ? selectedTier.priceCents : event.priceCents;
    let amountCents = baseAmountCents;
    let validDiscount = null;

    const normalizedDiscountCode = normalizeDiscountCode(discountCode);

    if (normalizedDiscountCode && baseAmountCents > 0) {
      const code = await prisma.discountCode.findUnique({
        where: { eventId_code: { eventId: id, code: normalizedDiscountCode } }
      });

      if (isDiscountUsable(code)) {
        validDiscount = code;
        amountCents = calculateDiscountedAmountCents(baseAmountCents, code);
      }
    }

    if (event.type === 'RSVP') {
      amountCents = 0;
    }

    // Create order with selected payment gateway
    const order = await prisma.order.create({
      data: {
        registrationId: registration.id,
        amountCents: amountCents,
        currency: event.currency,
        provider: selectedGateway,
        status: 'CREATED',
        discountCodeId: validDiscount ? validDiscount.id : undefined,
        paymentData: buildTicketTierSnapshot(selectedTier)
      }
    });

    // If free event (or became free via discount) or RSVP
    if (amountCents === 0 || event.type === 'RSVP') {
      const regStatus = event.type === 'RSVP' ? 'CONFIRMED' : 'PAID';

      let completion;
      try {
        completion = await completePaidOrder(order.id, {}, { registrationStatus: regStatus });
      } catch (completionError) {
        await deleteUnstartedRegistrationDraft(registration.id).catch((cleanupError) => {
          console.error('Failed to clean up unpaid registration draft:', cleanupError);
        });
        throw completionError;
      }

      return res.json({
        registration: { ...registration, status: regStatus },
        order: completion.order,
        requiresPayment: false,
        downloadToken: createTicketDownloadToken({
          orderId: completion.order.id,
          email: completion.registration.userEmail
        })
      });
    }

    res.json({
      registration,
      order,
      requiresPayment: true,
      checkoutAccessToken: createCheckoutAccessToken({
        ...order,
        registration
      })
    });
  } catch (error) {
    console.error('Registration error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack
    });
    res.status(error.statusCode || 500).json({
      error: 'Registration failed',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create payment session
router.post('/orders/:id/create-checkout-session', async (req, res) => {
  try {
    const { id } = req.params;
    const { checkoutAccessToken } = req.body || {};

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        registration: {
          include: {
            event: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status === 'PAID') {
      return res.status(400).json({ error: 'Order already paid' });
    }

    if (order.status === 'FAILED') {
      return res.status(409).json({ error: 'Order payment session expired' });
    }

    if (!verifyCheckoutAccessToken(checkoutAccessToken, order)) {
      return res.status(403).json({ error: 'Invalid checkout session' });
    }

    let reservedNow = false;
    let reservedOrder = order;

    try {
      const reservation = await reserveOrderForCheckout(order.id);
      reservedNow = reservation.reservedNow;
      reservedOrder = reservation.order;
    } catch (error) {
      throw error;
    }

    // Handle based on payment provider
    if (reservedOrder.provider === 'PHONEPE') {
      const existingPhonePe = reservedOrder.paymentData?.phonePe;
      if (reservedOrder.providerOrderId && existingPhonePe?.paymentUrl && existingPhonePe?.callbackNonce) {
        return res.json({
          provider: 'PHONEPE',
          paymentUrl: existingPhonePe.paymentUrl,
          transactionId: reservedOrder.providerOrderId,
          checkoutAccessToken: createCheckoutAccessToken(reservedOrder)
        });
      }

      try {
        // PhonePe redirect-based flow
        const callbackNonce = createPaymentCallbackNonce();
        const callbackUrl = `${process.env.FRONTEND_URL}/payment/phonepe/callback?orderId=${reservedOrder.id}&nonce=${callbackNonce}`;
        const phonePeResponse = await createPhonePePayment(reservedOrder, callbackUrl);

        // Update order with transaction ID
        reservedOrder = await prisma.order.update({
          where: { id },
          data: {
            providerOrderId: phonePeResponse.transactionId,
            paymentData: mergePaymentData(reservedOrder.paymentData, {
              phonePe: {
                transactionId: phonePeResponse.transactionId,
                callbackNonce,
                paymentUrl: phonePeResponse.paymentUrl
              }
            })
          },
          include: {
            registration: true
          }
        });

        return res.json({
          provider: 'PHONEPE',
          paymentUrl: phonePeResponse.paymentUrl,
          transactionId: phonePeResponse.transactionId,
          checkoutAccessToken: createCheckoutAccessToken(reservedOrder)
        });
      } catch (error) {
        if (reservedNow) await releaseCheckoutReservation(id).catch((releaseError) => {
          console.error('Failed to release checkout reservation:', releaseError);
        });
        throw error;
      }
    }

    // Razorpay popup-based flow (default)
    const existingRazorpayOrder = reservedOrder.paymentData?.razorpayOrder;
    if (reservedOrder.providerOrderId && existingRazorpayOrder?.id === reservedOrder.providerOrderId) {
      return res.json({
        provider: 'RAZORPAY',
        orderId: existingRazorpayOrder.id,
        amount: existingRazorpayOrder.amount,
        currency: existingRazorpayOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        checkoutAccessToken: createCheckoutAccessToken(reservedOrder)
      });
    }

    try {
      const paymentOrder = await createRazorpayOrder(reservedOrder);
      const nextPaymentData = mergePaymentData(reservedOrder.paymentData, {
        razorpayOrder: paymentOrder
      });

      const updateResult = await prisma.order.updateMany({
        where: {
          id,
          status: 'CREATED',
          provider: 'RAZORPAY',
          providerOrderId: null
        },
        data: {
          providerOrderId: paymentOrder.id,
          paymentData: nextPaymentData
        }
      });

      if (updateResult.count === 0) {
        const currentOrder = await prisma.order.findUnique({
          where: { id },
          include: { registration: true }
        });
        const currentRazorpayOrder = currentOrder?.paymentData?.razorpayOrder;

        if (currentOrder?.providerOrderId && currentRazorpayOrder?.id === currentOrder.providerOrderId) {
          return res.json({
            provider: 'RAZORPAY',
            orderId: currentRazorpayOrder.id,
            amount: currentRazorpayOrder.amount,
            currency: currentRazorpayOrder.currency,
            keyId: process.env.RAZORPAY_KEY_ID,
            checkoutAccessToken: createCheckoutAccessToken(currentOrder)
          });
        }

        throw routeError('Checkout session changed before Razorpay handoff completed', 409);
      }

      reservedOrder = await prisma.order.findUnique({
        where: { id },
        include: { registration: true }
      });

      res.json({
        provider: 'RAZORPAY',
        orderId: paymentOrder.id,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        checkoutAccessToken: createCheckoutAccessToken(reservedOrder)
      });
    } catch (error) {
      if (reservedNow) await releaseCheckoutReservation(id).catch((releaseError) => {
        console.error('Failed to release checkout reservation:', releaseError);
      });
      throw error;
    }
  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Failed to create checkout session',
      ...(error.gatewayCode ? { gatewayCode: error.gatewayCode } : {})
    });
  }
});

// Verify PhonePe payment status (called after redirect)
router.post('/orders/:id/verify-phonepe', async (req, res) => {
  try {
    const { id } = req.params;
    const { checkoutAccessToken, nonce } = req.body || {};

    const order = await prisma.order.findUnique({
      where: { id },
      include: { registration: true }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!verifyCheckoutAccessToken(checkoutAccessToken, order)) {
      return res.status(403).json({ error: 'Invalid checkout session' });
    }

    if (order.provider !== 'PHONEPE' || !order.providerOrderId) {
      return res.status(400).json({ error: 'Order is not awaiting PhonePe verification' });
    }

    const expectedNonce = order.paymentData?.phonePe?.callbackNonce;
    if (!expectedNonce || nonce !== expectedNonce) {
      return res.status(403).json({ error: 'Invalid payment callback' });
    }

    if (order.status === 'PAID') {
      return res.json({
        success: true,
        message: 'Payment already verified',
        eventId: order.registration.eventId,
        orderId: order.id,
        downloadToken: createTicketDownloadToken({
          orderId: order.id,
          email: order.registration.userEmail
        })
      });
    }

    if (order.status === 'FAILED') {
      return res.status(409).json({ error: 'Order payment session expired' });
    }

    const result = await completePhonePeOrderFromProviderStatus(order);

    if (result.outcome === 'completed' || result.outcome === 'already-paid') {
      const completion = result.completion;

      return res.json({
        success: true,
        message: 'Payment verified successfully',
        eventId: order.registration.eventId,
        orderId: order.id,
        downloadToken: createTicketDownloadToken({
          orderId: completion.order.id,
          email: completion.registration.userEmail
        })
      });
    }

    if (result.outcome === 'pending') {
      return res.status(202).json({ success: false, message: 'Payment pending', state: 'PENDING' });
    }

    return res.status(400).json({ success: false, message: 'Payment failed', state: result.statusResponse?.paymentState });
  } catch (error) {
    console.error('PhonePe verification error:', error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Failed to verify PhonePe payment'
    });
  }
});

// Verify and complete payment (for manual verification after Razorpay success)
router.post('/orders/:id/verify-payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { checkoutAccessToken, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        registration: true
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!verifyCheckoutAccessToken(checkoutAccessToken, order)) {
      return res.status(403).json({ error: 'Invalid checkout session' });
    }

    if (order.provider !== 'RAZORPAY' || order.providerOrderId !== razorpay_order_id) {
      return res.status(400).json({ error: 'Payment does not match this order' });
    }

    if (order.status === 'FAILED') {
      return res.status(409).json({ error: 'Order payment session expired' });
    }

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const providedBuffer = Buffer.from(String(razorpay_signature || ''), 'hex');
    const isValid = expectedBuffer.length === providedBuffer.length
      && crypto.timingSafeEqual(expectedBuffer, providedBuffer);

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    if (order.status === 'PAID') {
      return res.json({
        success: true,
        message: 'Payment already verified',
        downloadToken: createTicketDownloadToken({
          orderId: order.id,
          email: order.registration.userEmail
        })
      });
    }

    const completion = await completePaidOrder(order.id, {
      razorpayPayment: {
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature
      }
    });

    res.json({
      success: true,
      message: 'Payment verified successfully',
      downloadToken: createTicketDownloadToken({
        orderId: completion.order.id,
        email: completion.registration.userEmail
      })
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Failed to verify payment'
    });
  }
});

export default router;
