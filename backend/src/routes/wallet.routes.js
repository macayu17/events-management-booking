/**
 * Wallet Pass Routes
 * 
 * Endpoints for downloading Apple Wallet passes and Google Wallet URLs
 */

import express from 'express';
import prisma from '../config/db.js';
import {
    generateAppleWalletPass,
    generateGoogleWalletUrl,
    getWalletAvailability
} from '../services/wallet.service.js';
import { verifyTicketDownloadToken } from '../utils/download-token.util.js';
import { getTicketArtifactBlocker } from '../utils/ticket-access.util.js';

const router = express.Router();

const verifyWalletAccess = (req, ticket) => verifyTicketDownloadToken(req.query.token, {
    ticketId: ticket.id,
    orderId: ticket.orderId,
    email: ticket.order.registration.userEmail
});

const sendArtifactBlocker = (res, ticket) => {
    const blocker = getTicketArtifactBlocker(ticket);
    if (!blocker) return false;

    res.status(blocker.statusCode).json({ error: blocker.message });
    return true;
};

// Check wallet availability
router.get('/wallet/availability', (req, res) => {
    res.json(getWalletAvailability());
});

// Generate Apple Wallet pass
router.get('/tickets/:ticketId/apple-wallet', async (req, res) => {
    try {
        const { ticketId } = req.params;

        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: {
                order: {
                    include: {
                        registration: {
                            include: { event: true }
                        }
                    }
                }
            }
        });

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        if (!verifyWalletAccess(req, ticket)) {
            return res.status(403).json({ error: 'Valid wallet download token required' });
        }
        if (sendArtifactBlocker(res, ticket)) return;

        const event = ticket.order.registration.event;
        const attendee = ticket.order.registration.formResponse;

        const passBuffer = await generateAppleWalletPass(ticket, event, attendee);

        if (!passBuffer) {
            return res.status(503).json({
                error: 'Apple Wallet is not configured',
                message: 'Please contact the administrator to set up Apple Wallet integration'
            });
        }

        res.set({
            'Content-Type': 'application/vnd.apple.pkpass',
            'Content-Disposition': `attachment; filename="ticket-${ticket.id.substring(0, 8)}.pkpass"`
        });
        res.send(passBuffer);

    } catch (error) {
        console.error('Apple Wallet error:', error);
        res.status(500).json({ error: 'Failed to generate Apple Wallet pass' });
    }
});

// Generate Google Wallet URL
router.get('/tickets/:ticketId/google-wallet', async (req, res) => {
    try {
        const { ticketId } = req.params;

        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: {
                order: {
                    include: {
                        registration: {
                            include: { event: true }
                        }
                    }
                }
            }
        });

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        if (!verifyWalletAccess(req, ticket)) {
            return res.status(403).json({ error: 'Valid wallet download token required' });
        }
        if (sendArtifactBlocker(res, ticket)) return;

        const event = ticket.order.registration.event;
        const attendee = ticket.order.registration.formResponse;

        const walletUrl = await generateGoogleWalletUrl(ticket, event, attendee);

        if (!walletUrl) {
            return res.status(503).json({
                error: 'Google Wallet is not configured',
                message: 'Please contact the administrator to set up Google Wallet integration'
            });
        }

        // Redirect to Google Wallet
        res.redirect(walletUrl);

    } catch (error) {
        console.error('Google Wallet error:', error);
        res.status(500).json({ error: 'Failed to generate Google Wallet pass' });
    }
});

export default router;
