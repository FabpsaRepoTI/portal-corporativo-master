import { Route } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import FacturasCedisPage from "../pages/cedis/FacturasCedisPage";

export default (
  <>
    <Route path="/cedis/facturas"
      element={
        <ProtectedRoute modulo="escaner">
          <FacturasCedisPage />
        </ProtectedRoute>
      }
    />
  </>
);
