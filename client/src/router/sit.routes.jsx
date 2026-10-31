// router/sit.routes.jsx
// Módulo SIT — Sistema de Información Técnica. Se monta en el <Routes> raíz de
// App.jsx, FUERA de AppLayout (como el SGC): tiene su propia barra lateral,
// barra superior y pestañas (SITLayout). Las páginas se cargan bajo demanda y
// Fabi · Información Técnica lo pone el layout para todas.
import { lazy } from "react";
import { Route } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import SITLayout from "../pages/sit/SITLayout";
const SITDashboard = lazy(() => import("../pages/sit/SITDashboard"));
const ArticulosPage = lazy(() => import("../pages/sit/ArticulosPage"));
const ArticuloDetallePage = lazy(() => import("../pages/sit/ArticuloDetallePage"));
const ControlDocumentalPage = lazy(() => import("../pages/sit/ControlDocumentalPage"));
const DashboardAdminPage = lazy(() => import("../pages/sit/DashboardAdminPage"));

export default (
  <Route
    path="/sit"
    element={
      <ProtectedRoute modulo="sit">
        <SITLayout />
      </ProtectedRoute>
    }
  >
    <Route index element={<SITDashboard />} />
    <Route path="articulos" element={<ArticulosPage />} />
    <Route path="articulos/:codigoArticulo" element={<ArticuloDetallePage />} />
    {/* Indicadores documentales y centro de control: la ruta solo exige el
        módulo; el servidor responde 403 a quien no sea administradora documental */}
    <Route path="dashboard" element={<DashboardAdminPage />} />
    <Route path="control" element={<ControlDocumentalPage />} />
  </Route>
);
