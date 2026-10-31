"use strict";
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const ctrl = require("../controllers/solicitudesAdmin.controller");
const { getPool, sql } = require("../db");

router.get("/pendientes-atencion", verifyToken, require("../middleware/requireModulo")("mesa_servicio"), async(req,res)=>{
 if(!["SISTEMAS","SYSTEMS"].includes(String(req.user?.area||"").toUpperCase()))return res.status(403).json({error:"Acceso restringido a Sistemas"});
 res.set("Cache-Control","no-store");
 try{res.json(await require("../services/pendientesAtencion.service").getPendientesAtencion());}
 catch{res.status(500).json({error:"No se pudieron consultar las solicitudes pendientes."});}
});
router.get("/kpis", verifyToken, ctrl.getKPIs);
router.get("/solicitudes", verifyToken, ctrl.getSolicitudes);
router.get("/solicitudes/:id", verifyToken, ctrl.getSolicitudDetalle);
router.put("/solicitudes/:id/asignar", verifyToken, ctrl.asignar);
router.put("/solicitudes/:id/estatus", verifyToken, ctrl.cambiarEstatus);
router.put("/solicitudes/:id/prioridad", verifyToken, ctrl.cambiarPrioridad);
router.put("/solicitudes/:id/escalar", verifyToken, ctrl.escalar);
router.put(
  "/solicitudes/:id/finalizar-escalamiento",
  verifyToken,
  ctrl.finalizarEscalamiento,
);
router.put("/solicitudes/:id/resolver", verifyToken, ctrl.resolverConAcciones);
router.post(
  "/solicitudes/:id/comentarios",
  verifyToken,
  ctrl.agregarComentario,
);
router.post("/solicitudes/:id/bitacora", verifyToken, ctrl.agregarBitacora);
router.put("/solicitudes/:id/transferir", verifyToken, ctrl.transferir);
router.get("/tecnicos-sistemas", verifyToken, ctrl.getTecnicosSistemas);

router.get("/prioridades", verifyToken, async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool
      .request()
      .query("SELECT * FROM cat_prioridad ORDER BY idPrioridad");
    res.json({ ok: true, data: r.recordset });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// Lista de proveedores para el dropdown de escalamiento
router.get("/proveedores", verifyToken, async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool
      .request()
      .query(
        "SELECT idProveedor, proveedor FROM cat_proveedor ORDER BY proveedor",
      );
    res.json({ ok: true, data: r.recordset });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;
