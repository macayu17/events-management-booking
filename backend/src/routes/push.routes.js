import express from 'express';
import webpush from 'web-push';
import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';

const router = express.Router();

const optionalAuthenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return next();

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, email: true }
        });

        if (user) req.user = user;
    } catch {
        // Public subscriptions are allowed, but only authenticated requests can bind an email.
    }

    next();
};

// Configure web-push with VAPID keys
// Generate keys with: npx web-push generate-vapid-keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(
        'mailto:support@occasio.app',
        vapidPublicKey,
        vapidPrivateKey
    );
    console.log('✅ Web Push configured');
} else {
    console.warn('⚠️ VAPID keys not configured - push notifications disabled');
}

// Get VAPID public key for client subscription
router.get('/vapid-key', (req, res) => {
    if (!vapidPublicKey) {
        return res.status(503).json({ error: 'Push notifications not configured' });
    }
    res.json({ publicKey: vapidPublicKey });
});

// Subscribe to push notifications
router.post('/subscribe', optionalAuthenticate, async (req, res) => {
    try {
        const { subscription } = req.body;
        const userEmail = req.user?.email || null;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ error: 'Invalid subscription' });
        }

        // Upsert subscription
        await prisma.pushSubscription.upsert({
            where: { endpoint: subscription.endpoint },
            update: {
                keys: subscription.keys,
                userEmail
            },
            create: {
                endpoint: subscription.endpoint,
                keys: subscription.keys,
                userEmail
            }
        });

        res.json({ success: true, message: 'Subscribed to push notifications' });
    } catch (error) {
        console.error('Push subscribe error:', error);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

// Unsubscribe from push notifications
router.post('/unsubscribe', async (req, res) => {
    try {
        const { endpoint } = req.body;

        if (!endpoint) {
            return res.status(400).json({ error: 'Endpoint required' });
        }

        await prisma.pushSubscription.delete({
            where: { endpoint }
        }).catch(() => { }); // Ignore if not found

        res.json({ success: true, message: 'Unsubscribed' });
    } catch (error) {
        console.error('Push unsubscribe error:', error);
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

// Send push notification (internal use / admin only)
export async function sendPushNotification(title, body, url, targetEmails = null) {
    if (!vapidPublicKey || !vapidPrivateKey) {
        console.warn('Push notifications not configured');
        return { sent: 0, failed: 0 };
    }

    try {
        let subscriptions;

        if (targetEmails && targetEmails.length > 0) {
            subscriptions = await prisma.pushSubscription.findMany({
                where: { userEmail: { in: targetEmails } }
            });
        } else {
            subscriptions = await prisma.pushSubscription.findMany();
        }

        const payload = JSON.stringify({
            title,
            body,
            icon: '/pwa-192.png',
            badge: '/pwa-192.png',
            url: url || '/'
        });

        let sent = 0;
        let failed = 0;

        for (const sub of subscriptions) {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: sub.keys },
                    payload
                );
                sent++;
            } catch (error) {
                failed++;
                // Remove invalid subscriptions
                if (error.statusCode === 410 || error.statusCode === 404) {
                    await prisma.pushSubscription.delete({
                        where: { id: sub.id }
                    }).catch(() => { });
                }
            }
        }

        console.log(`Push notifications: ${sent} sent, ${failed} failed`);
        return { sent, failed };
    } catch (error) {
        console.error('Send push notification error:', error);
        return { sent: 0, failed: 0 };
    }
}

export default router;
