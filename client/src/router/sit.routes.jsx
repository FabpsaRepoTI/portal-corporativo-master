// router/sit.routes.jsx
// Módulo SIT — Sistema de Información Técnica
import { Route } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import SITDashboard from "../pages/sit/SITDashboard";
import ArticulosPage from "../pages/sit/ArticulosPage";
import ArticuloDetallePage from "../pages/sit/ArticuloDetallePage";
import ControlDocumentalPage from "../pages/sit/ControlDocumentalPage";
import DashboardAdminPage from "../pages/sit/DashboardAdminPage";
import SitAsistente from "../pages/sit/components/SitAsistente";

// Fabi · Información Técnica acompaña todas las páginas del módulo
const conFabi = (pagina) => (
  <>
    {pagina}
    <SitAsistente />
  </>
);

export default (
  <>
    <Route
      path="/sit"
      element={
        <ProtectedRoute modulo="sit">
          {conFabi(<SITDashboard />)}
        </ProtectedRoute>
      }
    />
    <Route
      path="/sit/articulos"
      element={
        <ProtectedRoute modulo="sit">
          {conFabi(<ArticulosPage />)}
        </ProtectedRoute>
      }
    />
    {/* Centro de control: la ruta solo exige el módulo; el servidor decide
        (403 a quien no esté en sit_administradores) */}
    {/* Dashboard de administradoras: el servidor responde 403 a las demás */}
    <Route
      path="/sit/dashboard"
      element={
        <ProtectedRoute modulo="sit">
          {conFabi(<DashboardAdminPage />)}
        </ProtectedRoute>
      }
    />
    <Route
      path="/sit/control"
      element={
        <ProtectedRoute modulo="sit">
          {conFabi(<ControlDocumentalPage />)}
        </ProtectedRoute>
      }
    />
    <Route
      path="/sit/articulos/:codigoArticulo"
      element={
        <ProtectedRoute modulo="sit">
          {conFabi(<ArticuloDetallePage />)}
        </ProtectedRoute>
      }
    />
  </>
);
