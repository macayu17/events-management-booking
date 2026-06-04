import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingBlock } from './StateBlock';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingBlock fullPage title="Checking session" message="Verifying your admin access." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
