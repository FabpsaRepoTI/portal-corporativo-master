// server/routes/sgc.mesasgi.routes.js
// Mesa de Servicio SGI — montado en /api/sgc/mesa-sgi. Abierta a cualquier
// usuario con sesión (no exige rol SGC); cargarPerfil marca si es del equipo
// SGI y el service separa lo que ve cada quien.
const router = require("express").Router();
const { verifyToken } = require("../middleware/auth");
const msi = require("../services/sgc.mesasgi.service");

router.use(verifyToken, msi.cargarPerfil);

router.get("/servicios", msi.getServicios);
router.post("/servicios", msi.soloSGI, msi.crearServicio);
router.put("/servicios/:id", msi.soloSGI, msi.actualizarServicio);
router.delete("/servicios/:id", msi.soloSGI, msi.desactivarServicio);
router.get("/mis-tickets", msi.getMisTickets);
router.get("/admin", msi.soloSGI, msi.getAdmin);
router.get("/tickets", msi.getTickets);
router.post("/tickets", msi.crearTicket);
router.get("/tickets/:id", msi.getTicket);
router.put("/tickets/:id/estatus", msi.cambiarEstatus);
router.put("/tickets/:id/asignar", msi.soloSGI, msi.asignar);
router.post("/tickets/:id/comentario", msi.comentar);

module.exports = router;
