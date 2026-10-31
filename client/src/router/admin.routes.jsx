import { Route } from "react-router-dom";
import PageLoader from "../components/PageLoader";
import UsuariosPage from "../pages/admin/UsuariosPage";
import AccesosPage from "../pages/admin/AccesosPage";

export default (
  <>
    <Route path="/configuracion/accesos" element={<PageLoader><AccesosPage /></PageLoader>} />
    <Route path="/configuracion/usuarios"
      element={<PageLoader><UsuariosPage /></PageLoader>} />
  </>
);
