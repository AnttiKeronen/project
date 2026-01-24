import React from "react";
import { Navigate } from "react-router-dom";
import { isAuthenticated } from "../auth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  // Redirect unauthenticated users to login page
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
