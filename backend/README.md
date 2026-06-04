# Event Management System - Backend

Backend API for Event Management and Booking System built with Node.js, Express, PostgreSQL, and Prisma.

## Features

- 🔐 JWT Authentication
- 📅 Event Management (CRUD)
- 📝 Custom Registration Forms
- 💳 Payment Integration (Razorpay + PhonePe)
- 🎟️ QR Ticket Generation
- 📧 Email Notifications
- 🔄 Background Job Processing
- ☁️ Cloudflare R2 primary PDF storage with Cloudinary fallback

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Queue**: BullMQ + Redis
- **Payment**: Razorpay + PhonePe
- **Email**: Nodemailer
- **PDF Generation**: PDFKit + pdf-lib
- **QR Code**: qrcode
- **Storage**: Cloudflare R2, Cloudinary fallback, local uploads for development

## Setup

### Prerequisites

- Node.js (v22.12 or higher)
- PostgreSQL
- Redis (for background jobs)
- AWS Account (for production)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
copy .env.example .env
```

3. Update `.env` with your configuration

4. Generate Prisma Client:
```bash
npm run prisma:generate
```

5. Run database migrations:
```bash
npm run prisma:migrate
```

6. Start development server:
```bash
npm run dev
```

## Environment Variables

See `.env.example` for all required environment variables.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Public Events
- `GET /api/events` - Get all published events
- `GET /api/events/:id` - Get event details
- `GET /api/events/:id/form` - Get event registration form

### Admin (Protected)
- `POST /api/admin/events` - Create event
- `PUT /api/admin/events/:id` - Update event
- `DELETE /api/admin/events/:id` - Delete event
- `POST /api/admin/events/:id/poster-upload` - Upload poster
- `POST /api/admin/events/:id/form` - Create/update form
- `GET /api/admin/events/:id/registrations` - Get registrations

### Registration & Payment
- `POST /api/events/:id/register` - Register for event
- `POST /api/orders/:id/create-checkout-session` - Create payment session

### Webhooks
- `POST /api/webhooks/payments` - Razorpay webhook
- `POST /api/orders/:id/verify-phonepe` - PhonePe redirect verification
- `npm run payments:reconcile-phonepe -- --limit=25 --min-age-minutes=5` - Reconcile stale PhonePe orders from the provider status API

### Tickets
- `POST /api/tickets/verify` - Verify ticket QR code
- `GET /api/tickets/:id/pdf` - Download ticket PDF

## Database Schema

The database schema is defined in `prisma/schema.prisma` and includes:
- Users
- Events
- Forms
- Registrations
- Orders
- Tickets

## Background Jobs

The system uses BullMQ for background processing:
- Ticket generation
- Email sending

## Security

- JWT-based authentication
- HMAC-signed QR codes
- Payment webhook verification
- Rate limiting
- Helmet security headers
- Input validation

## Development

```bash
# Run in development mode
npm run dev

# Access Prisma Studio
npm run prisma:studio

# Create/apply local migrations
npm run prisma:migrate:dev

# Apply committed migrations in production/CI
npm run prisma:migrate:deploy
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Configure production database
3. Set up Redis instance
4. Configure Cloudinary or S3 for poster uploads, and R2, Cloudinary, or S3 for generated PDF assets. Production fails at startup instead of using local disk when cloud storage is missing.
5. Set up Razorpay and PhonePe credentials/webhooks as needed. Sandbox PhonePe uses Standard Checkout V2 credentials: `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, and `PHONEPE_CLIENT_VERSION`; no gateway credentials are hardcoded in the app.
6. For Azure, set `AZURE_RUN_PRISMA_MIGRATIONS=true` and `AZURE_DATABASE_URL` only when you want the workflow or startup script to run `npm run prisma:migrate:deploy`. The workflow runs backend tests before migrations.
7. Deploy to Azure App Service

## Maintenance Helpers

```bash
# List recent tickets and compare DB/QR ticket IDs
npm run tickets:check

# Promote an existing user to ADMIN
ADMIN_EMAIL=user@example.com CONFIRM_ADMIN_EMAIL=user@example.com npm run admin:set

# Reconcile stale PhonePe orders when a customer paid but missed the browser callback
npm run payments:reconcile-phonepe -- --limit=25 --min-age-minutes=5
```

Diagnostic scripts under `scripts/debug-*.mjs` require `ALLOW_DEBUG_SCRIPTS=true` because they can print local database or provider data. See `scripts/README.md` before running them.

## License

ISC
