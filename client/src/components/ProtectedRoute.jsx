import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

const styles = {
  loadingWrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#F7F5F2",
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #E4DED8",
    borderTopColor: "#0A6B65",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
  },
};
