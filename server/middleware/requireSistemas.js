// middleware/requireSistemas.js
// Solo el equipo de TI: módulo mesa_servicio y área SISTEMAS (la misma regla
// con la que el menú muestra el "Panel de Operación TI"). Va después de
// verifyToken, que deja en req.user el payload firmado de la sesión.
module.exports = function requireSistemas(req, res, next) {
  const area = String(req.user?.area || "").trim().toUpperCase();
  const modulos = req.user?.modulos || [];
  if (!["SISTEMAS", "SYSTEMS"].includes(area) || !modulos.includes("mesa_servicio")) {
    return res.status(403).json({ ok: false, error: "Acceso exclusivo del equipo de TI." });
  }
  next();
};
