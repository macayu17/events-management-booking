# Occasio - Event Management and Booking System

A full-stack event management platform built with React + Node.js + PostgreSQL that allows organizers to create events, manage registrations, and issue QR-coded tickets.

## 🌟 Features

### Admin/Organizer Features
- 🔐 Secure JWT authentication
- 📅 Create, edit, and delete events
- 🖼️ Upload event posters via Cloudinary
- 📝 Drag-and-drop custom registration form builder
- 🎫 Customizable ticket styling (colors, logos, templates)
- 📊 Analytics dashboard with registration & revenue insights
- 💰 Revenue tracking and financial reports
- 📥 Export attendee data to CSV
- 🎟️ Discount & promo code management
- ✉️ Broadcast emails to event participants
- 👥 Team management with role-based permissions
- ✅ QR-based check-in/check-out dashboard
- 📋 Event polls and voting

### Public User Features
- 🔍 Browse and search events by category
- 📖 View detailed event information
- 📋 Fill dynamic registration forms
- 💳 Secure payment processing (Razorpay and PhonePe)
- 📧 Receive PDF tickets with QR codes via email
- ⭐ Reviews and ratings for events
- 📆 Add events to calendar (.ics download)
- 📝 Join waitlist for sold-out events

### Technical Features
- 🔒 HMAC-signed QR codes for security
- 🔔 Webhook-based payment confirmation
- ☁️ Cloudflare R2 primary PDF storage with Cloudinary fallback
- 📄 PDF ticket generation with PDFKit
- 📱 Optional PWA support with push notifications
- 🎨 Modern responsive UI with Tailwind CSS & glassmorphism

## 🛠️ Tech Stack

### Frontend
- React 18 + Vite
- Tailwind CSS
- React Router v6
- React Hook Form
- Lucide Icons
- React PDF / PDF.js for certificate previews

### Backend
- Node.js + Express
- PostgreSQL + Prisma ORM
- JWT Authentication
- PDFKit (PDF generation)
- QRCode generation
- Razorpay and PhonePe integration
- Nodemailer (email)
- Cloudflare R2 / Cloudinary (assets)

## 📋 Prerequisites

- Node.js v22.12+
- PostgreSQL database

## 🚀 Quick Start

### 1. Database Setup

```sql
CREATE DATABASE event_management;
```

### 2. Backend Setup

```bash
cd backend
npm install
# Copy .env.example to .env and configure DATABASE_URL/JWT_SECRET/QR_SECRET_KEY
npm run prisma:generate
npm run prisma:migrate:dev
npm run dev
```
Backend runs on `http://localhost:5000`

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```
Frontend runs on `http://localhost:5173`

## 🔑 Environment Variables

### Backend (.env)
```env
DATABASE_URL=postgresql://user:password@localhost:5432/event_management
JWT_SECRET=your_jwt_secret
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET=your_r2_bucket_name
R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
R2_REGION=auto
QR_SECRET_KEY=your_qr_secret
ALLOW_UNSIGNED_TICKET_SCAN=false
PHONEPE_CLIENT_ID=your_phonepe_client_id
PHONEPE_CLIENT_SECRET=your_phonepe_client_secret
PHONEPE_CLIENT_VERSION=1
PHONEPE_ENV=sandbox
TRUST_PROXY=false
APP_VERSION=local
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:5000/api
VITE_RAZORPAY_KEY_ID=your_razorpay_key_id
VITE_ENABLE_PWA=false
```

`VITE_API_URL` is required for production frontend builds so deployed clients never fall back to localhost.

## 🚢 Deployment

- **Backend**: Deploy to Azure App Service
- **Frontend**: Deploy to Vercel with `VITE_API_URL` pointed at the Azure backend `/api` URL
- **Database**: Use Neon or Supabase for PostgreSQL
- **Migrations**: CI runs backend tests before `npm run prisma:migrate:deploy`; Azure startup only runs migrations when `AZURE_RUN_PRISMA_MIGRATIONS=true` is explicitly set.

## 📄 License

ISC
