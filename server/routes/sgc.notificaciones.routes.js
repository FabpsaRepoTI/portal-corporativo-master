// server/routes/sgc.notificaciones.routes.js
// Notificaciones del SGC — montado en /api/sgc/notificaciones. Solo exige
// sesión: cada quien ve únicamente las suyas (login del JWT).
const router = require("express").Router();
const { verifyToken } = require("../middleware/auth");
const svc = require("../services/sgc.notificaciones.service");

router.use(verifyToken);
router.get("/", svc.getNotificaciones);
router.put("/leer-todo", svc.marcarTodas);
router.put("/:id/leer", svc.marcarLeida);
router.patch("/:id/accion", svc.accionNotificacion);

module.exports = router;
