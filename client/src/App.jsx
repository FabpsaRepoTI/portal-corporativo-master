import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import HomePage from "./pages/HomePage";
import AplicativosPage from "./pages/AplicativosPage";
import CulturaDigitalPage from "./pages/CulturaDigitalPage";
import LoginPage from "./pages/LoginPage";
import MesaDeServicioPage from "./pages/mesaServicio/paginaPrincipal/MesaDeServicioPage";
import HardwarePage from "./pages/mesaServicio/hardware/HardwarePage";
import HardwareSolicitudesPage from "./pages/mesaServicio/hardware/HardwareSolicitudesPage";
import PageLoader from "./components/PageLoader";
import SolicitudPage from "./pages/mesaServicio/solicitudServicio/SolicitudPage";
import MisSolicitudesPage from "./pages/mesaServicio/solicitudesUsuario/MisSolicitudesPage";
import MesaAyudaAdminPage from "./pages/mesaServicio/atencionIncidencias/AtencionIncidenciasPage";
import MesaDeServicioAdminPage from "./pages/mesaServicio/MesaDeServicioAdminPage";
import NuevoDesarrolloPage from "./pages/mesaServicio/desarrolloSoftware/NuevoDesarrolloPage";
import MisDesarrollosPage from "./pages/mesaServicio/solicitudesUsuario/MisDesarrollosPage";
import BlogAdminPage from "./pages/blog/BlogAdminPage";
import FacturasCedisPage from "./pages/cedis/FacturasCedisPage";
import BlogPage from "./pages/blog/BlogPage";
import UsuariosPage from "./pages/admin/UsuariosPage";
import VisorEjecutivoPage from "./pages/VisorEjecutivoPage";

import "./App.css";

function AppLayout() {
  return (
    <div className="layout">
      <Sidebar />
      <div className="main-wrapper">
        <Navbar />
        <main className="main-content">
          <Routes>
            <Route
              path="/"
              element={
                <PageLoader>
                  <HomePage />
                </PageLoader>
              }
            />
            <Route
              path="/aplicativos"
              element={
                <PageLoader>
                  <AplicativosPage />
                </PageLoader>
              }
            />
            <Route
              path="/cultura-digital"
              element={
                <PageLoader>
                  <BlogPage />{" "}
                </PageLoader>
              }
            />
            <Route
              path="/cultura-digital/admin"
              element={
                <PageLoader>
                  <BlogAdminPage />{" "}
                </PageLoader>
              }
            />
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
                  <MesaDeServicioAdminPage />{" "}
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
            {/*<Route
              path="/mesa-de-servicio/reporte-incidente"
              element={
                <PageLoader>
                  <ReporteIncidentePage />
                </PageLoader>
              }
            />*/}
            <Route
              path="/mesa-de-servicio/solicitud/desarrollo-de-sistemas"
              element={
                <Navigate to="/mesa-de-servicio/desarrollo/nueva" replace />
              }
            />
            <Route
              path="/mesa-de-servicio/hardware/solicitudes"
              element={
                <PageLoader>
                  <HardwareSolicitudesPage />
                </PageLoader>
              }
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
              path="/mesa-de-servicio/admin"
              element={
                <PageLoader>
                  <MesaAyudaAdminPage />
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
              path="/cedis/facturas"
              element={
                <ProtectedRoute modulo="escaner">
                  <FacturasCedisPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/configuracion/usuarios"
              element={
                <PageLoader>
                  <UsuariosPage />
                </PageLoader>
              }
            />
            <Route
              path="/mesa-de-servicio/desarrollo/nueva"
              element={<NuevoDesarrolloPage />}
            />
            <Route
              path="/mesa-de-servicio/mis-desarrollos"
              element={<MisDesarrollosPage />}
            />

            <Route path="/visor-ti" element={<VisorEjecutivoPage />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter basename="/portal-corporativo/fabpsa">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
