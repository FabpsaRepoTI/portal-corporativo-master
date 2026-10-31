// router/mesasgi.routes.jsx
// Mesa de Servicio SGI: solicitudes de cualquier colaborador al departamento
// SGI. Se monta DENTRO del layout del portal (cualquier usuario con sesión);
// el servidor decide quién es del equipo SGI. Páginas bajo demanda.
import { lazy, Suspense } from "react";
import { Route } from "react-router-dom";
const MesaSGILayout = lazy(() => import("../pages/mesaSGI/MesaSGILayout"));
const MesaSGIHome = lazy(() => import("../pages/mesaSGI/MesaSGIHome"));
const NuevoTicketSGI = lazy(() => import("../pages/mesaSGI/NuevoTicketSGI"));
const MisTicketsSGI = lazy(() => import("../pages/mesaSGI/MisTicketsSGI"));
const DetalleTicketSGI = lazy(() => import("../pages/mesaSGI/DetalleTicketSGI"));
const AdminSGI = lazy(() => import("../pages/mesaSGI/AdminSGI"));

// Los chunks son pequeños: sin indicador para no parpadear
const conCarga = (el) => <Suspense fallback={null}>{el}</Suspense>;

export default (
  <Route path="/mesa-sgi" element={conCarga(<MesaSGILayout />)}>
    <Route index element={conCarga(<MesaSGIHome />)} />
    <Route path="nueva" element={conCarga(<NuevoTicketSGI />)} />
    <Route path="mis-tickets" element={conCarga(<MisTicketsSGI />)} />
    <Route path="ticket/:id" element={conCarga(<DetalleTicketSGI />)} />
    <Route path="admin" element={conCarga(<AdminSGI />)} />
  </Route>
);
