const svc = require("../services/solicitudesUsuario.service");

async function getMisKpis(req, res) {
  try {
    const data = await svc.getMisKpis(req.user.login);
    res.json(data);
  } catch (err) {
    console.error("getMisKpis:", err);
    res.status(500).json({ error: "Error al obtener KPIs" });
  }
}

async function getMisSolicitudes(req, res) {
  try {
    const filtros = {
      estatus: req.query.estatus || null,
      prioridad: req.query.prioridad || null,
      buscar: req.query.buscar || null,
    };
    const data = await svc.getMisSolicitudes(req.user.login, filtros);
    res.json(data);
  } catch (err) {
    console.error("getMisSolicitudes:", err);
    res.status(500).json({ error: "Error al obtener solicitudes" });
  }
}

async function getDetalleSolicitud(req, res) {
  try {
    const data = await svc.getDetalleSolicitud(
      parseInt(req.params.id),
      req.user.login,
    );
    if (!data) return res.status(403).json({ error: "No autorizado" });
    res.json(data);
  } catch (err) {
    console.error("getDetalleSolicitud:", err);
    res.status(500).json({ error: "Error al obtener detalle" });
  }
}

async function postComentario(req, res) {
  try {
    const { comentario } = req.body;
    if (!comentario?.trim()) {
      return res.status(400).json({ error: "Comentario vacío" });
    }
    const data = await svc.postComentario(
      parseInt(req.params.id),
      req.user.login,
      req.user.name,
      comentario.trim(),
    );
    if (!data) return res.status(403).json({ error: "No autorizado" });
    res.json(data);
  } catch (err) {
    console.error("postComentario:", err);
    res.status(500).json({ error: "Error al enviar comentario" });
  }
}

async function cancelarSolicitud(req, res) {
  try {
    const result = await svc.cancelarSolicitud(
      parseInt(req.params.id),
      req.user.login,
    );
    if (!result.ok) return res.status(403).json({ error: result.error });
    res.json({ success: true });
  } catch (err) {
    console.error("cancelarSolicitud:", err);
    res.status(500).json({ error: "Error al cancelar la solicitud" });
  }
}

async function postArchivos(req, res) {
  try {
    if (!req.files?.length)
      return res.status(400).json({ error: "Sin archivos" });
    const data = await svc.postArchivos(
      parseInt(req.params.id),
      req.user.login,
      req.files,
    );
    if (!data) return res.status(403).json({ error: "No autorizado" });
    res.json(data);
  } catch (err) {
    console.error("postArchivos:", err);
    res.status(500).json({ error: "Error al subir archivos" });
  }
}

async function postEvaluacion(req, res) {
  try {
    const { calificacion, emoji, comentario } = req.body;
    if (!calificacion || calificacion < 1 || calificacion > 5)
      return res.status(400).json({ error: "Calificación inválida" });
    const result = await svc.postEvaluacion(
      parseInt(req.params.id),
      req.user.login,
      { calificacion, emoji, comentario },
    );
    if (!result.ok) return res.status(409).json({ error: result.error });
    res.json({ ok: true });
  } catch (err) {
    console.error("postEvaluacion:", err);
    res.status(500).json({ error: "Error al guardar evaluación" });
  }
}

async function cerrarSolicitud(req, res) {
  try {
    const result = await svc.cerrarSolicitud(
      parseInt(req.params.id),
      req.user.login,
    );
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (err) {
    console.error("cerrarSolicitud:", err);
    res.status(500).json({ error: "Error al cerrar la solicitud" });
  }
}

async function reabrirSolicitud(req, res) {
  try {
    const result = await svc.reabrirSolicitud(
      parseInt(req.params.id),
      req.user.login,
    );
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (err) {
    console.error("reabrirSolicitud:", err);
    res.status(500).json({ error: "Error al reabrir la solicitud" });
  }
}
module.exports = {
  getMisKpis,
  getMisSolicitudes,
  getDetalleSolicitud,
  postComentario,
  cancelarSolicitud,
  postArchivos,
  postEvaluacion,
  cerrarSolicitud,
  reabrirSolicitud,
};
