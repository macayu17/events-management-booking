import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { validateRuntimeEnv } from './config/env.js';

// Import routes
import authRoutes from './routes/auth.routes.js';
import eventRoutes from './routes/event.routes.js';
import adminRoutes from './routes/admin.routes.js';
import registrationRoutes from './routes/registration.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import ticketRoutes from './routes/ticket.routes.js';

import waitlistRoutes from './routes/waitlist.routes.js';
import discountRoutes from './routes/discount.routes.js';
import reviewRoutes from './routes/review.routes.js';
import pollRoutes from './routes/poll.routes.js';
import pushRoutes from './routes/push.routes.js';
import teamRoutes from './routes/team.routes.js';
import featureRoutes from './routes/feature.routes.js';
import walletRoutes from './routes/wallet.routes.js';

const app = express();
const PORT = process.env.PORT || 5000;
validateRuntimeEnv();

const certificatePreviewPathPattern = /^\/api\/admin\/events\/[^/]+\/certificates\/test\/?$/;
const regularJsonParser = express.json({ limit: '2mb' });

const parseTrustProxy = () => {
  const value = process.env.TRUST_PROXY;
  if (!value) return process.env.NODE_ENV === 'production' ? 1 : false;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'false' || normalized === '0') return false;
  if (normalized === 'true') return true;

  const numericValue = Number.parseInt(normalized, 10);
  return Number.isFinite(numericValue) ? numericValue : value;
};

const parseAllowedOrigins = () => {
  const configured = [
    process.env.FRONTEND_URL,
    ...(process.env.CORS_ORIGINS || '').split(','),
    'https://occasio.ayushh.in',
    'https://www.occasio.ayushh.in'
  ].filter(Boolean);

  return new Set(configured.map((origin) => {
    try {
      return new URL(origin.trim()).origin;
    } catch {
      return origin.trim();
    }
  }));
};

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Middleware
const trustProxy = parseTrustProxy();
if (trustProxy !== false) {
  app.set('trust proxy', trustProxy);
}

app.use(helmet());
app.use(limiter);
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = parseAllowedOrigins();

    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check if origin is localhost (dev environment)
    if (process.env.NODE_ENV !== 'production' && origin.match(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/)) {
      return callback(null, true);
    }

    let normalizedOrigin;
    try {
      normalizedOrigin = new URL(origin).origin;
    } catch {
      normalizedOrigin = origin;
    }

    if (allowedOrigins.has(normalizedOrigin)) {
      return callback(null, true);
    }

    const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
    return callback(new Error(msg), false);
  },
  credentials: true
}));

// Webhook routes need raw body
app.use('/api/webhooks', express.raw({ type: 'application/json' }));

// Regular JSON parsing for other routes.
app.use((req, res, next) => {
  if (certificatePreviewPathPattern.test(req.path)) {
    return next();
  }
  return regularJsonParser(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Serve uploaded files
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads/tickets', (req, res) => {
  res.status(404).json({ error: 'Ticket downloads require a signed download link' });
});
app.use('/uploads/certificates/generated', (req, res) => {
  res.status(404).json({ error: 'Generated certificate downloads are not public' });
});
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', registrationRoutes);
app.use('/api', waitlistRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api', reviewRoutes);
app.use('/api', pollRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/team', teamRoutes);
app.use('/api', featureRoutes);
app.use('/api', walletRoutes);

// Health check with version for deployment verification
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    version: process.env.APP_VERSION || process.env.GITHUB_SHA || 'local',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Stop the existing process or change PORT in backend/.env.`);
    return process.exit(1);
  }

  console.error('❌ Server startup error:', error);
  process.exit(1);
});

export default app;
