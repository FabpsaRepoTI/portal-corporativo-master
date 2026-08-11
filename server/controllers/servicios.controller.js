const {
  getServicios,
  getServicioBySlug,
} = require("../services/servicios.service");

async function listarServicios(req, res) {
  try {
    const data = await getServicios();
    res.json({ ok: true, data });
  } catch (err) {
    console.error("[servicios] listar:", err);
    res.status(500).json({ ok: false, message: "Error al obtener servicios" });
  }
}

async function obtenerServicio(req, res) {
  try {
    const { slug } = req.params;
    const data = await getServicioBySlug(slug);

    if (!data) {
      return res
        .status(404)
        .json({ ok: false, message: "Servicio no encontrado" });
    }

    res.json({ ok: true, data });
  } catch (err) {
    console.error("[servicios] obtener:", err);
    res
      .status(500)
      .json({ ok: false, message: "Error al obtener configuración" });
  }
}

module.exports = { listarServicios, obtenerServicio };
