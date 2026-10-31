import { Route, Navigate } from "react-router-dom";
import PageLoader from "../components/PageLoader";
import PageHero from "../components/PageHero";
import MesaDeServicioPage from "../pages/mesaServicio/paginaPrincipal/MesaDeServicioPage";
import MesaDeServicioAdminPage from "../pages/mesaServicio/MesaDeServicioAdminPage";
import HardwarePage from "../pages/mesaServicio/hardware/HardwarePage";
import HardwareSolicitudesPage from "../pages/mesaServicio/hardware/HardwareSolicitudesPage";
import SolicitudPage from "../pages/mesaServicio/solicitudServicio/SolicitudPage";
import MisSolicitudesPage from "../pages/mesaServicio/solicitudesUsuario/MisSolicitudesPage";
import NuevoDesarrolloPage from "../pages/mesaServicio/desarrolloSoftware/NuevoDesarrolloPage";
import MisDesarrollosPage from "../pages/mesaServicio/solicitudesUsuario/MisDesarrollosPage";
import EncuestaResultadosPage from "../pages/mesaServicio/paginaPrincipal/EncuestaResultadosPage";

export default (
  <>
    <Route
      path="/mesa-de-servicio"
      element={
        <PageLoader>
          <MesaDeServicioPage />
        </PageLoader>
      }
    />
    <Route
      path="/mesa-de-servicio/admin"
      element={
        <PageLoader>
          <MesaDeServicioAdminPage />
        </PageLoader>
      }
    />
    <Route
      path="/mesa-de-servicio/hardware"
      element={
        <PageLoader>
          <HardwarePage />
        </PageLoader>
      }
    />
    <Route
      path="/mesa-de-servicio/hardware/solicitudes"
      element={
        <PageLoader>
          {/* Abierta sola (fuera de la pestaña de Administración): encabezado estándar */}
          <PageHero
            eyebrow="Mesa de Servicio · Hardware"
            titulo="Solicitudes de"
            resalte="hardware"
            sub="Revisa, atiende y da seguimiento a las solicitudes de equipo de los usuarios."
            volver={{ to: "/mesa-de-servicio", label: "Volver a la Mesa de Ayuda" }}
          />
          <HardwareSolicitudesPage />
        </PageLoader>
      }
    />
    <Route
      path="/mesa-de-servicio/solicitud/desarrollo-de-sistemas"
      element={<Navigate to="/mesa-de-servicio/desarrollo/nueva" replace />}
    />
    <Route
      path="/mesa-de-servicio/solicitud/:slug"
      element={
        <PageLoader>
          <SolicitudPage />
        </PageLoader>
      }
    />
    <Route
      path="/mesa-de-servicio/mis-solicitudes"
      element={
        <PageLoader>
          <MisSolicitudesPage />
        </PageLoader>
      }
    />
    <Route
      path="/mesa-de-servicio/desarrollo/nueva"
      element={
        <PageLoader>
          <NuevoDesarrolloPage />
        </PageLoader>
      }
    />
    <Route
      path="/mesa-de-servicio/mis-desarrollos"
      element={
        <PageLoader>
          {/* Abierta sola (fuera de la pestaña de Mis Solicitudes): encabezado estándar */}
          <PageHero
            eyebrow="Mesa de Servicio · Desarrollo de Software"
            titulo="Mis"
            resalte="desarrollos"
            sub="Consulta el avance de tus solicitudes de desarrollo de software."
            volver={{ to: "/mesa-de-servicio", label: "Volver a la Mesa de Ayuda" }}
          />
          <MisDesarrollosPage />
        </PageLoader>
      }
    />
    <Route
      path="/mesa-de-servicio/encuesta-resultados"
      element={
        <PageLoader>
          <EncuestaResultadosPage />
        </PageLoader>
      }
    />
  </>
);
