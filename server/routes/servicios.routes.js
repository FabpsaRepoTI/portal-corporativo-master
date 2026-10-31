const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const {
  listarServicios,
  obtenerServicio,
} = require("../controllers/servicios.controller");

router.get("/", verifyToken, listarServicios);
router.get("/:slug", verifyToken, obtenerServicio);

module.exports = router;
