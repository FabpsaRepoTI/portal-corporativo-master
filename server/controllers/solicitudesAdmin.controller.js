"use strict";
const svc = require("../services/solicitudesAdmin.service");

async function getKPIs(req, res) {
  try {
    res.json({ ok: true, data: await svc.getKPIs() });
  } catch (err) {
    if (err.number === 51001) return res.status(409).json({ ok: false, code: "TICKET_BLOQUEADO", message: "El ticket no existe o está concluido. Las acciones se habilitan cuando el solicitante lo reabre." });
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
    if (err.number === 51001) return res.status(409).json({ ok: false, code: "TICKET_BLOQUEADO", message: "El ticket no existe o está concluido. Las acciones se habilitan cuando el solicitante lo reabre." });
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
    if (err.number === 51001) return res.status(409).json({ ok: false, code: "TICKET_BLOQUEADO", message: "El ticket no existe o está concluido. Las acciones se habilitan cuando el solicitante lo reabre." });
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
    if (err.number === 51001) return res.status(409).json({ ok: false, code: "TICKET_BLOQUEADO", message: "El ticket no existe o está concluido. Las acciones se habilitan cuando el solicitante lo reabre." });
    console.error("[mesa-admin] asignar:", err);
    res.status(500).json({ ok: false });
  }
}

async function cambiarEstatus(req, res) {
  try {
    const { idEstatus } = req.body;
    if (!idEstatus) return res.status(400).json({ ok: false });
    const result = await svc.cambiarEstatus(
      parseInt(req.params.id),
      idEstatus,
      req.user.login,
      req.user.name ?? req.user.login,
    );
    if (result && !result.ok)
      return res
        .status(422)
        .json({ ok: false, code: result.code, message: result.message });
    res.json({ ok: true });
  } catch (err) {
    if (err.number === 51001) return res.status(409).json({ ok: false, code: "TICKET_BLOQUEADO", message: "El ticket no existe o está concluido. Las acciones se habilitan cuando el solicitante lo reabre." });
    console.error("[mesa-admin] estatus:", err);
    res.status(500).json({ ok: false });
  }
}

async function cambiarPrioridad(req, res) {
  try {
    const { idPrioridad } = req.body;
    if (!idPrioridad) return res.status(400).json({ ok: false });
    const result = await svc.cambiarPrioridad(
      parseInt(req.params.id),
      idPrioridad,
    );
    if (result && !result.ok) return res.status(422).json(result);
    res.json({ ok: true });
  } catch (err) {
    if (err.number === 51001) return res.status(409).json({ ok: false, code: "TICKET_BLOQUEADO", message: "El ticket no existe o está concluido. Las acciones se habilitan cuando el solicitante lo reabre." });
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
      0,
      comentario.trim(),
    );
    res.json({ ok: true });
  } catch (err) {
    if (err.number === 51001) return res.status(409).json({ ok: false, code: "TICKET_BLOQUEADO", message: "El ticket no existe o está concluido. Las acciones se habilitan cuando el solicitante lo reabre." });
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
    if (err.number === 51001) return res.status(409).json({ ok: false, code: "TICKET_BLOQUEADO", message: "El ticket no existe o está concluido. Las acciones se habilitan cuando el solicitante lo reabre." });
    console.error("[mesa-admin] bitacora:", err);
    res.status(500).json({ ok: false });
  }
}

async function getTecnicosSistemas(req, res) {
  try {
    res.json({ ok: true, data: await svc.getTecnicosSistemas() });
  } catch (err) {
    if (err.number === 51001) return res.status(409).json({ ok: false, code: "TICKET_BLOQUEADO", message: "El ticket no existe o está concluido. Las acciones se habilitan cuando el solicitante lo reabre." });
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
      req.user.login,
      req.user.name ?? req.user.login,
    );
    res.json({ ok: true });
  } catch (err) {
    if (err.number === 51001) return res.status(409).json({ ok: false, code: "TICKET_BLOQUEADO", message: "El ticket no existe o está concluido. Las acciones se habilitan cuando el solicitante lo reabre." });
    console.error("[mesa-admin] transferir:", err);
    res.status(500).json({ ok: false });
  }
}

async function escalar(req, res) {
  try {
    const { escalaA, comentario } = req.body;
    if (!escalaA?.trim())
      return res
        .status(400)
        .json({ ok: false, message: "Debes indicar a quién se escala." });
    const result = await svc.escalar(
      parseInt(req.params.id),
      escalaA.trim(),
      comentario ?? "",
      req.user.login,
      req.user.name ?? req.user.login,
    );
    if (result && !result.ok) return res.status(422).json(result);
    res.json({ ok: true });
  } catch (err) {
    if (err.number === 51001) return res.status(409).json({ ok: false, code: "TICKET_BLOQUEADO", message: "El ticket no existe o está concluido. Las acciones se habilitan cuando el solicitante lo reabre." });
    console.error("[mesa-admin] escalar:", err);
    res.status(500).json({ ok: false });
  }
}

async function finalizarEscalamiento(req, res) {
  try {
    const result = await svc.finalizarEscalamiento(
      parseInt(req.params.id),
      req.user.login,
      req.user.name ?? req.user.login,
    );
    if (result && !result.ok) return res.status(422).json(result);
    res.json({ ok: true });
  } catch (err) {
    if (err.number === 51001) return res.status(409).json({ ok: false, code: "TICKET_BLOQUEADO", message: "El ticket no existe o está concluido. Las acciones se habilitan cuando el solicitante lo reabre." });
    console.error("[mesa-admin] finalizarEscalamiento:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
}

async function resolverConAcciones(req, res) {
  try {
    const { accionesRealizadas } = req.body;
    if (!accionesRealizadas?.trim())
      return res
        .status(400)
        .json({ ok: false, message: "Describe las acciones realizadas." });
    const result = await svc.resolverConAcciones(
      parseInt(req.params.id),
      accionesRealizadas.trim(),
      req.user.login,
      req.user.name ?? req.user.login,
    );
    if (result && !result.ok) return res.status(422).json(result);
    res.json({ ok: true });
  } catch (err) {
    if (err.number === 51001) return res.status(409).json({ ok: false, code: "TICKET_BLOQUEADO", message: "El ticket no existe o está concluido. Las acciones se habilitan cuando el solicitante lo reabre." });
    console.error("[mesa-admin] resolverConAcciones:", err);
    res.status(500).json({ ok: false, message: err.message });
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
  finalizarEscalamiento,
  resolverConAcciones,
};
