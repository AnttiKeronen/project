import { Navigate } from "react-router-dom";
import { isAuthed } from "../auth";

export function ProtectedRoute({ children }: { children: JSX.Element }) {
  if (!isAuthed()) return <Navigate to="/login" replace />;
  return children;
}
