const svc = require("../services/solicitudesAdmin.service");

async function getKPIs(req, res) {
  try {
    res.json({ ok: true, data: await svc.getKPIs() });
  } catch (err) {
    console.error("[mesa-admin] kpis:", err);
    res.status(500).json({ ok: false });
  }
}

async function getSolicitudes(req, res) {
  try {
    const result = await svc.getSolicitudes({
      estatus: req.query.estatus,
      prioridad: req.query.prioridad,
      categoria: req.query.categoria,
      tecnico: req.query.tecnico,
      busqueda: req.query.busqueda,
      fechaDesde: req.query.fechaDesde,
      fechaHasta: req.query.fechaHasta,
      pagina: parseInt(req.query.pagina) || 1,
      porPagina: parseInt(req.query.porPagina) || 10,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[mesa-admin] getSolicitudes:", err);
    res.status(500).json({ ok: false });
  }
}

async function getSolicitudDetalle(req, res) {
  try {
    const data = await svc.getSolicitudDetalle(parseInt(req.params.id));
    if (!data) return res.status(404).json({ ok: false });
    res.json({ ok: true, data });
  } catch (err) {
    console.error("[mesa-admin] detalle:", err);
    res.status(500).json({ ok: false });
  }
}

async function asignar(req, res) {
  try {
    await svc.asignar(
      parseInt(req.params.id),
      req.user.login,
      req.user.name ?? req.user.login,
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[mesa-admin] asignar:", err);
    res.status(500).json({ ok: false });
  }
}

// ── MODIFICADO: pasa loginSolicitante para validar asignación ──
async function cambiarEstatus(req, res) {
  try {
    const { idEstatus } = req.body;
    if (!idEstatus) return res.status(400).json({ ok: false });

    const result = await svc.cambiarEstatus(
      parseInt(req.params.id),
      idEstatus,
      req.user.login, // ← nuevo: para validar que sea el asignado
    );

    // El service devuelve { ok: false, code, message } si hay validación fallida
    if (result && !result.ok) {
      return res
        .status(422)
        .json({ ok: false, code: result.code, message: result.message });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[mesa-admin] estatus:", err);
    res.status(500).json({ ok: false });
  }
}

async function cambiarPrioridad(req, res) {
  try {
    const { idPrioridad } = req.body;
    if (!idPrioridad) return res.status(400).json({ ok: false });
    await svc.cambiarPrioridad(parseInt(req.params.id), idPrioridad);
    res.json({ ok: true });
  } catch (err) {
    console.error("[mesa-admin] prioridad:", err);
    res.status(500).json({ ok: false });
  }
}

async function agregarComentario(req, res) {
  try {
    const { comentario } = req.body;
    if (!comentario?.trim()) return res.status(400).json({ ok: false });
    await svc.agregarComentario(
      parseInt(req.params.id),
      req.user.login,
      req.user.name ?? req.user.login,
      req.user.area === "SISTEMAS" ? 1 : 0,
      comentario.trim(),
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[mesa-admin] comentario:", err);
    res.status(500).json({ ok: false });
  }
}

async function agregarBitacora(req, res) {
  try {
    const { nota } = req.body;
    if (!nota?.trim())
      return res.status(400).json({ ok: false, message: "Nota vacía." });
    await svc.agregarBitacora(
      parseInt(req.params.id),
      req.user.login,
      req.user.name ?? req.user.login,
      nota.trim(),
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[mesa-admin] bitacora:", err);
    res.status(500).json({ ok: false });
  }
}

async function getTecnicosSistemas(req, res) {
  try {
    res.json({ ok: true, data: await svc.getTecnicosSistemas() });
  } catch (err) {
    console.error("[mesa-admin] tecnicos:", err);
    res.status(500).json({ ok: false });
  }
}

async function transferir(req, res) {
  try {
    const { tecnicoLogin, nombreTecnico } = req.body;
    if (!tecnicoLogin) return res.status(400).json({ ok: false });
    await svc.transferir(
      parseInt(req.params.id),
      tecnicoLogin,
      nombreTecnico ?? tecnicoLogin,
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[mesa-admin] transferir:", err);
    res.status(500).json({ ok: false });
  }
}

// ── NUEVO: escalar ──────────────────────────────────────────────
async function escalar(req, res) {
  try {
    const { escalaA, comentario } = req.body;
    if (!escalaA?.trim()) {
      return res
        .status(400)
        .json({ ok: false, message: "Debes indicar a quién se escala." });
    }
    await svc.escalar(
      parseInt(req.params.id),
      escalaA.trim(),
      comentario ?? "",
      req.user.login,
      req.user.name ?? req.user.login,
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[mesa-admin] escalar:", err);
    res.status(500).json({ ok: false });
  }
}

module.exports = {
  getKPIs,
  getSolicitudes,
  getSolicitudDetalle,
  asignar,
  cambiarEstatus,
  cambiarPrioridad,
  agregarComentario,
  agregarBitacora,
  getTecnicosSistemas,
  transferir,
  escalar,
};
