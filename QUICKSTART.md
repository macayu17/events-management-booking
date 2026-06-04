# Quick Start Guide

## Prerequisites Check

Before starting, make sure you have:
- ✅ Node.js (v22.12+) installed
- ✅ PostgreSQL installed and running
- ⚠️ Redis (optional - for background jobs)

## Step-by-Step Setup

### 1. Database Setup

First, create the database in PostgreSQL:

```sql
-- Open PostgreSQL command line or pgAdmin
CREATE DATABASE event_management;
```

### 2. Backend Setup

```bash
# Navigate to backend
cd backend

# Install dependencies (if not done)
npm install

# Copy .env.example to .env, then update DATABASE_URL with your PostgreSQL credentials:
# cp .env.example .env
# DATABASE_URL="postgresql://YOUR_USERNAME:YOUR_PASSWORD@localhost:5432/event_management"

# Generate Prisma Client
npm run prisma:generate

# Create/apply local database migrations
npm run prisma:migrate:dev

# Start the backend server
npm run dev
```

The backend should now be running on `http://localhost:5000`

### 3. Frontend Setup

Open a new terminal:

```bash
# Navigate to frontend
cd frontend

# Install dependencies (if not done)
npm install

# Copy .env.example to .env for local development if it does not exist
# cp .env.example .env

# Start the frontend
npm run dev
```

The frontend should now be running on `http://localhost:5173`

## Testing the Application

1. Open your browser and go to `http://localhost:5173`
2. Click "Register" to create an admin account
3. Login with your credentials
4. Create a new event
5. The event will now have a default registration form
6. Publish the event
7. Go back to the home page and click "Register Now"

## Common Issues & Solutions

### Issue: "Failed to load registration form"
**Solution**: The form route now returns a default form if none exists. Make sure:
- Backend server is running on port 5000
- Database connection is working
- No CORS errors in browser console

### Issue: Database connection failed
**Solution**: 
- Check PostgreSQL is running
- Verify DATABASE_URL in backend/.env
- Make sure database "event_management" exists

### Issue: Module not found errors
**Solution**:
```bash
# In backend folder
npm install

# In frontend folder
npm install
```

## Optional Features

### Email Notifications
To enable email notifications, update in `backend/.env`:
```
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_app_password
```

### Payment Gateways (Razorpay and PhonePe)
1. Sign up at https://razorpay.com
2. Get your API keys
3. Update in `backend/.env`:
```
RAZORPAY_KEY_ID=your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```
4. Update in `frontend/.env`:
```
VITE_RAZORPAY_KEY_ID=your_key_id
```
5. For PhonePe, add your sandbox or production credentials in `backend/.env`:
```
PHONEPE_CLIENT_ID=your_client_id
PHONEPE_CLIENT_SECRET=your_client_secret
PHONEPE_CLIENT_VERSION=1
PHONEPE_ENV=sandbox
```

### Background Jobs (Redis)
1. Install and start Redis
2. Backend will automatically connect if Redis is running on default port

## Default Form Structure

When you create an event without a custom form, the system provides a default registration form with:
- Full Name (required)
- Email (required)
- Phone Number (optional)

You can customize this by going to Admin Panel → Events → Form Builder

## Next Steps

1. Create your first event
2. Build a custom registration form
3. Test the registration flow
4. Set up payment gateway (optional)
5. Configure email notifications (optional)

---

For detailed documentation, see the main README.md file.
