const jwt = require("jsonwebtoken");

const JWT_SECRET = "fabpsa_secret_2026_intranet";

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token no proporcionado." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido o expirado." });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user?.priv_admin) {
    return res
      .status(403)
      .json({ error: "Se requieren privilegios de administrador." });
  }
  next();
}

module.exports = { verifyToken, requireAdmin, JWT_SECRET };
