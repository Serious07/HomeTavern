import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const location = useLocation();
  const { isAuthenticated, loading } = useAuthContext();

  // Debug logging
  console.log('[ProtectedRoute] Checking auth - isAuthenticated:', isAuthenticated, 'loading:', loading);
  console.log('[ProtectedRoute] Current location:', location.pathname);

  // Show loading state while checking auth
  if (loading) {
    console.log('[ProtectedRoute] Still loading - showing spinner');
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <svg className="animate-spin h-10 w-10 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log('[ProtectedRoute] Not authenticated - redirecting to /login');
    // Redirect to login but save the location they were trying to access
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  console.log('[ProtectedRoute] Authenticated - rendering children');
  return <>{children}</>;
};

export default ProtectedRoute;
