// server/routes/sgc.routes.js
// Módulo SGC/SGI — Sistemas de Gestión. Montado en /api/sgc.
// Todas las rutas (salvo /mi-rol, la Mesa SGI y notificaciones) exigen un rol activo en
// sgc_usuario_roles.
// Los permisos finos (Responsable solo lo suyo, cierres solo Coordinador,
// transiciones sin saltos) se validan en cada service.
const router = require("express").Router();
const { verifyToken } = require("../middleware/auth");
const { verificarSGC } = require("../middleware/sgcAuth.middleware");
const svc = require("../services/sgc.service");
const nc = require("../services/sgcNC.service");
const ac = require("../services/sgcAC.service");
const aud = require("../services/sgcAuditorias.service");
const ind = require("../services/sgcIndicadores.service");
const ejecutivo = require("../services/sgc.ejecutivo.service");
const arch = require("../services/sgcArchivos.service");
const pendientes = require("../services/sgc.pendientes.service");
const paleta = require("../services/sgc.paleta.service");
const diagnostico = require("../services/sgc.diagnostico.service");

// Rol del usuario actual (null si no tiene): no exige rol
router.get("/mi-rol", verifyToken, svc.getMiRol);

// Mesa de Servicio SGI y notificaciones: abiertas a cualquier usuario con sesión
router.use("/mesa-sgi", require("./sgc.mesasgi.routes"));
router.use("/notificaciones", require("./sgc.notificaciones.routes"));

router.use(verificarSGC());

// ── Catálogos y dashboard ──
router.get("/catalogos", svc.getCatalogos);
router.get("/usuarios", svc.getUsuarios);
router.get("/departamentos", svc.getDepartamentos);
router.get("/sitios", svc.getSitios);
router.get("/dashboard", svc.getDashboard);
router.get("/dashboard/ejecutivo", verificarSGC([1, 4]), ejecutivo.getDashboardEjecutivo);
router.get("/contadores", svc.getContadores);
router.get("/buscar", svc.buscar);

// ── Espacio de trabajo: mis pendientes ──
router.get("/mis-pendientes", pendientes.getMisPendientes);
router.post("/mis-pendientes/accion", pendientes.accionPendiente);
router.get("/caso/:tipo/:folio", require("../services/sgc.caso.service").getCaso);

// ── Centro de control: inteligencia (datos + reglas) y diagnóstico con IA ──
router.get("/inteligencia", require("../services/sgc.inteligencia.service").getInteligencia);
router.get("/inteligencia/diagnostico", diagnostico.getDiagnostico);
router.post("/inteligencia/diagnostico", diagnostico.generarDiagnostico);

// ── Paleta de comandos (Ctrl+K) ──
router.get("/paleta/buscar", paleta.buscar);
router.get("/paleta/vistas", paleta.listarVistas);
router.post("/paleta/vistas", paleta.guardarVista);
router.delete("/paleta/vistas/:id", paleta.borrarVista);

// ── Archivos (descarga autenticada) ──
router.get("/archivos/:idArchivo", arch.descargarArchivo);

// ── No Conformidades ──
router.get("/nc", nc.getNCs);
router.get("/nc/:id", nc.getNC);
router.post("/nc", verificarSGC([1, 3]), nc.crearNC);
router.patch("/nc/:id/estatus", nc.cambiarEstatusNC);
router.patch("/nc/:id/proceso", nc.vincularProcesoNC);
router.get("/nc/:id/historial", nc.getHistorialNC);
router.post("/nc/:id/archivo", arch.subirArchivo("NC"), arch.registrarArchivo("NC"));
router.delete("/nc/:id/archivo/:idArchivo", arch.eliminarArchivo("NC"));

// ── Acciones Correctivas ──
router.get("/ac", ac.getACs);
router.patch("/ac/plan/:idLinea/estatus", ac.cambiarEstatusLinea);
router.get("/ac/:id", ac.getAC);
router.post("/ac", ac.crearAC);
router.patch("/ac/:id/estatus", ac.cambiarEstatusAC);
router.post("/ac/:id/plan", ac.agregarLinea);
router.post("/ac/:id/archivo", arch.subirArchivo("AC"), arch.registrarArchivo("AC"));
router.delete("/ac/:id/archivo/:idArchivo", arch.eliminarArchivo("AC"));

// ── Auditorías ──
router.get("/auditorias", aud.getAuditorias);
router.get("/auditorias/:id", aud.getAuditoria);
router.post("/auditorias", verificarSGC([1, 2]), aud.crearAuditoria);
router.post("/auditorias/:id/hallazgos", verificarSGC([1, 2]), aud.crearHallazgo);
router.post("/auditorias/:id/hallazgos/:idHallazgo/nc", verificarSGC([1, 2]), aud.crearNCDeHallazgo);
router.patch("/auditorias/:id/estatus", verificarSGC([1, 2]), aud.cambiarEstatusAuditoria);
router.post("/auditorias/:id/archivo", arch.subirArchivo("AUD"), arch.registrarArchivo("AUD"));
router.delete("/auditorias/:id/archivo/:idArchivo", arch.eliminarArchivo("AUD"));

// ── Indicadores ──
router.get("/indicadores", ind.getIndicadores);
router.get("/indicadores/:id", ind.getIndicador);
router.post("/indicadores", verificarSGC([1, 4]), ind.crearIndicador);
router.post("/indicadores/:id/valores", ind.registrarValor);
router.patch("/indicadores/:id", verificarSGC([1, 4]), ind.actualizarIndicador);

// ── Riesgos y oportunidades, mapa de procesos, Fab-i ──
router.use("/riesgos", require("./sgc.riesgos.routes"));
router.use("/procesos", require("./sgc.procesos.routes"));
router.use("/fabi", require("./sgc.fabi.routes"));
router.use("/equipo", require("./sgc.equipo.routes"));

// ── Gestión Documental (SharePoint como repositorio físico) ──
router.use("/documentos", require("./sgc.documentos.routes"));

module.exports = router;
