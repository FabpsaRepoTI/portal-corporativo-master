// server/routes/sgc.equipo.routes.js
// Control del equipo SGI — montado en /api/sgc/equipo (detrás de verificarSGC).
// Solo el Coordinador SGI administra roles y módulos.
const router = require("express").Router();
const { requireCoordinador } = require("../middleware/sgcAuth.middleware");
const eq = require("../services/sgc.equipo.service");

router.use(requireCoordinador);
router.get("/", eq.getEquipo);
router.get("/buscar", eq.buscarUsuarios);
router.get("/actividad", eq.getActividad);
router.post("/", eq.agregarMiembro);
router.put("/:login", eq.actualizarMiembro);
router.delete("/:login", eq.desactivarMiembro);

module.exports = router;
