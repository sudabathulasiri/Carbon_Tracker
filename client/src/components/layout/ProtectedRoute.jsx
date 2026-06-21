/**
 * components/layout/ProtectedRoute.jsx
 *
 * Wraps any route that requires authentication.
 * Redirects to /auth if no valid token is present, preserving the intended
 * destination in the `from` location state so AuthPage can redirect back.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;