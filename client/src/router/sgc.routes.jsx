// router/sgc.routes.jsx
// Módulo SGI — Sistemas de Gestión. Se monta en el <Routes> raíz de App.jsx,
// FUERA de AppLayout: el SGI tiene su propio sidebar y no usa el del portal.
// Las páginas se cargan bajo demanda (React.lazy) para no sumar el SGI ni
// recharts ni reactflow al bundle inicial del portal; SGCLayout pone el <Suspense>.
// La ruta exige el módulo 'sgc' (portal_usuario_modulos); el rol dentro del
// módulo (sgc_usuario_roles) lo decide el servidor.
import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import SGCLayout from "../pages/sgc/SGCLayout";
import SGITransition from "../components/sgc/SGITransition";
const DashboardSGC = lazy(() => import("../pages/sgc/DashboardSGC"));
const ListaNC = lazy(() => import("../pages/sgc/NoConformidades/ListaNC"));
const FormNuevaNC = lazy(() => import("../pages/sgc/NoConformidades/FormNuevaNC"));
const DetalleNC = lazy(() => import("../pages/sgc/NoConformidades/DetalleNC"));
const ListaAC = lazy(() => import("../pages/sgc/AccionesCorrectivas/ListaAC"));
const FormNuevaAC = lazy(() => import("../pages/sgc/AccionesCorrectivas/FormNuevaAC"));
const DetalleAC = lazy(() => import("../pages/sgc/AccionesCorrectivas/DetalleAC"));
const ListaAuditorias = lazy(() => import("../pages/sgc/Auditorias/ListaAuditorias"));
const FormNuevaAuditoria = lazy(() => import("../pages/sgc/Auditorias/FormNuevaAuditoria"));
const DetalleAuditoria = lazy(() => import("../pages/sgc/Auditorias/DetalleAuditoria"));
const ListaIndicadores = lazy(() => import("../pages/sgc/Indicadores/ListaIndicadores"));
const DetalleIndicador = lazy(() => import("../pages/sgc/Indicadores/DetalleIndicador"));
const Riesgos = lazy(() => import("../pages/sgc/Riesgos"));
const DashboardEjecutivo = lazy(() => import("../pages/sgc/DashboardEjecutivo"));
const GestionProcesos = lazy(() => import("../pages/sgc/GestionProcesos"));
const GestionDocumental = lazy(() => import("../pages/sgc/GestionDocumental"));
const EquipoSGI = lazy(() => import("../pages/sgc/EquipoSGI"));
const ManualSGI = lazy(() => import("../pages/sgc/ManualSGI"));

export default (
  <Route
    path="/sgc"
    element={
      <ProtectedRoute modulo="sgc">
        <SGITransition>
          <SGCLayout />
        </SGITransition>
      </ProtectedRoute>
    }
  >
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<DashboardSGC />} />
    <Route path="ejecutivo" element={<DashboardEjecutivo />} />
    <Route path="no-conformidades" element={<ListaNC />} />
    <Route path="no-conformidades/nueva" element={<FormNuevaNC />} />
    <Route path="no-conformidades/:idNC" element={<DetalleNC />} />
    <Route path="acciones-correctivas" element={<ListaAC />} />
    <Route path="acciones-correctivas/nueva" element={<FormNuevaAC />} />
    <Route path="acciones-correctivas/:idAC" element={<DetalleAC />} />
    <Route path="auditorias" element={<ListaAuditorias />} />
    <Route path="auditorias/nueva" element={<FormNuevaAuditoria />} />
    <Route path="auditorias/:idAuditoria" element={<DetalleAuditoria />} />
    <Route path="indicadores" element={<ListaIndicadores />} />
    <Route path="indicadores/:idIndicador" element={<DetalleIndicador />} />
    <Route path="riesgos" element={<Riesgos />} />
    <Route path="riesgos/:idRiesgo" element={<Riesgos />} />
    <Route path="procesos" element={<GestionProcesos />} />
    <Route path="documentos" element={<GestionDocumental />} />
    <Route path="equipo" element={<EquipoSGI />} />
    <Route path="manual" element={<ManualSGI />} />
    <Route path="*" element={<Navigate to="dashboard" replace />} />
  </Route>
);
