import { Route } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import PageLoader from "../components/PageLoader";
import GestionDesarrolloPage from "../pages/gestionDesarrollo/GestionDesarrolloPage";

// Cuando se agreguen sub-rutas (expediente de proyecto, etc.)
// se añaden aquí sin tocar App.jsx
export default (
  <>
    <Route path="/gestion-desarrollo"
      element={<ProtectedRoute modulo="gestion_desarrollo"><PageLoader><GestionDesarrolloPage /></PageLoader></ProtectedRoute>} />
  </>
);
