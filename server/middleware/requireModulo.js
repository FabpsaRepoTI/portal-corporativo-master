// middleware/requireModulo.js
const requireModulo = (clave) => (req, res, next) => {
  const modulos = req.user?.modulos || [];
  if (!modulos.includes(clave)) {
    return res.status(403).json({ error: "Sin acceso", modulo: clave });
  }
  next();
};

module.exports = requireModulo;
