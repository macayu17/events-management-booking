import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { useTheme } from './contexts/ThemeContext';

// Public Pages
const HomePage = lazy(() => import('./pages/public/HomePage'));
const EventDetailsPage = lazy(() => import('./pages/public/EventDetailsPage'));
const RegistrationPage = lazy(() => import('./pages/public/RegistrationPage'));
const SuccessPage = lazy(() => import('./pages/public/SuccessPage'));
const PhonePeCallbackPage = lazy(() => import('./pages/public/PhonePeCallbackPage'));
const InfoPage = lazy(() => import('./pages/public/InfoPage'));
const NotFoundPage = lazy(() => import('./pages/public/NotFoundPage'));

// Scanner Page
const ScannerPage = lazy(() => import('./pages/scanner/ScannerPage'));

// Auth Pages
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));

// Admin Pages
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const EventListPage = lazy(() => import('./pages/admin/EventListPage'));
const CreateEventPage = lazy(() => import('./pages/admin/CreateEventPage'));
const EditEventPage = lazy(() => import('./pages/admin/EditEventPage'));
const FormBuilderPage = lazy(() => import('./pages/admin/FormBuilderPage'));
const RegistrationsPage = lazy(() => import('./pages/admin/RegistrationsPage'));
const AnalyticsPage = lazy(() => import('./pages/admin/AnalyticsPage'));
const FinancialsPage = lazy(() => import('./pages/admin/FinancialsPage'));
const DiscountCodesPage = lazy(() => import('./pages/admin/DiscountCodesPage'));
const EventControlPage = lazy(() => import('./pages/admin/EventControlPage'));
const TeamEventsPage = lazy(() => import('./pages/admin/TeamEventsPage'));
const TeamCheckinPage = lazy(() => import('./pages/admin/TeamCheckinPage'));

// Layout
import PublicLayout from './layouts/PublicLayout';
import AdminLayout from './layouts/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import { LoadingBlock } from './components/StateBlock';

function PageLoader() {
  return <LoadingBlock title="Loading Occasio" message="Preparing the page." />;
}

function App() {
  const { isDark } = useTheme();

  return (
    <AuthProvider>
      <Router>
        <Toaster
          position="top-right"
          toastOptions={{
            className: '',
            style: {
              background: isDark ? '#1f2937' : '#fff',
              color: isDark ? '#f9fafb' : '#111827',
            },
          }}
        />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Routes */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/events/:id" element={<EventDetailsPage />} />
              <Route path="/events/:id/register" element={<RegistrationPage />} />
              <Route path="/success" element={<SuccessPage />} />
              <Route path="/payment/phonepe/callback" element={<PhonePeCallbackPage />} />
              <Route path="/privacy" element={<InfoPage />} />
              <Route path="/terms" element={<InfoPage />} />
              <Route path="/contact" element={<InfoPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            {/* Auth Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />



            {/* Admin Routes */}
            <Route element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/events" element={<EventListPage />} />
              <Route path="/admin/events/create" element={<CreateEventPage />} />
              <Route path="/admin/events/:id/edit" element={<EditEventPage />} />
              <Route path="/admin/events/:eventId/control" element={<EventControlPage />} />
              <Route path="/admin/events/:id/form" element={<FormBuilderPage />} />
              <Route path="/admin/events/:id/registrations" element={<RegistrationsPage />} />
              <Route path="/admin/events/:id/analytics" element={<AnalyticsPage />} />
              <Route path="/admin/events/:id/discounts" element={<DiscountCodesPage />} />
              <Route path="/admin/financials" element={<FinancialsPage />} />

              {/* Team Member Routes */}
              <Route path="/admin/team-events" element={<TeamEventsPage />} />
              <Route path="/admin/team-event/:id/checkin" element={<TeamCheckinPage />} />

              {/* Scanner - limited to admins/organizers */}
              <Route path="/scanner" element={<ScannerPage />} />
              <Route path="/admin/*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </Suspense>
      </Router>
    </AuthProvider>
  );
}

export default App;
