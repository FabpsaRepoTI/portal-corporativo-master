import { Route } from "react-router-dom";
import PageLoader from "../components/PageLoader";
import MantenimientoPage from "../pages/mantenimiento/MantenimientoPage";
import NuevaSolicitud from "../pages/mantenimiento/NuevaSolicitud";
import SolicitudMantenimientoRegistrada from "../pages/mantenimiento/SolicitudRegistrada";

export default (
  <>
    <Route path="/mantenimiento"
      element={<PageLoader><MantenimientoPage /></PageLoader>} />
    <Route path="/mantenimiento/nueva"
      element={<PageLoader><NuevaSolicitud /></PageLoader>} />
    <Route path="/mantenimiento/solicitudes/:id"
      element={<PageLoader><SolicitudMantenimientoRegistrada /></PageLoader>} />
  </>
);
