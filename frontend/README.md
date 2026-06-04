# Event Management System - Frontend

Frontend application for Event Management and Booking System built with React and Vite.

## Features

- 🎨 Modern UI with Tailwind CSS
- 📱 Responsive Design
- 🔐 Authentication & Authorization
- 📅 Event Browsing & Details
- 📝 Dynamic Form Rendering
- 💳 Payment Integration
- 🎫 Ticket Management
- 👨‍💼 Admin Dashboard
- 📊 Analytics & Reporting

## Tech Stack

- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router v6
- **HTTP Client**: Axios
- **Form Handling**: React Hook Form
- **Notifications**: React Hot Toast
- **Icons**: Lucide React
- **Date Handling**: date-fns

## Setup

### Prerequisites

- Node.js (v22.12 or higher)
- Backend API running

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
copy .env.example .env
```

3. Update `.env` with your configuration:
```
VITE_API_URL=http://localhost:5000/api
VITE_RAZORPAY_KEY_ID=your_razorpay_key_id
VITE_ENABLE_PWA=false
```

4. Start development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Project Structure

```
src/
├── components/        # Reusable components
├── context/          # React context providers
├── layouts/          # Layout components
├── pages/            # Page components
│   ├── public/       # Public pages
│   ├── auth/         # Authentication pages
│   └── admin/        # Admin pages
├── utils/            # Utility functions
├── App.jsx           # Main app component
├── main.jsx          # Entry point
└── index.css         # Global styles
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Features Overview

### Public Features
- Browse upcoming events
- View event details
- Register for events
- Dynamic registration forms
- Payment processing
- Ticket delivery via email

### Admin Features
- Dashboard with analytics
- Create and manage events
- Upload event posters
- Build custom registration forms
- View registrations
- Export attendee data
- Publish/unpublish events

## Environment Variables

- `VITE_API_URL` - Backend API URL
- `VITE_RAZORPAY_KEY_ID` - Razorpay public key
- `VITE_ENABLE_PWA` - Set to `true` only when service worker generation is required

## Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Deployment

The frontend is configured for Vercel. Other static hosts need equivalent SPA routing and `VITE_API_URL` pointing to the Azure backend.

### Vercel Deployment

```bash
npm install -g vercel
vercel
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

ISC
