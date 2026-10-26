"use strict";
// ─────────────────────────────────────────────────────────────
// routes/dev/_middleware.js
// Middleware compartido para todas las rutas del módulo dev/
// ─────────────────────────────────────────────────────────────
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "fabpsa_secret_2026_intranet";

function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer "))
    return res.status(401).json({ ok: false, message: "Sin token" });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ ok: false, message: "Token inválido" });
  }
}

// Solo área SISTEMAS puede operar el módulo
function soloSistemas(req, res, next) {
  if (req.user?.area !== "SISTEMAS")
    return res
      .status(403)
      .json({ ok: false, message: "Acceso restringido a Sistemas" });
  next();
}

// El gerente puede ver vistas ejecutivas y aprobar cierres
// En FABPSA el gerente también es de área SISTEMAS, pero puede
// distinguirse por un flag en el JWT si en el futuro se agrega.
// Por ahora soloSistemas cubre ambos roles.
function soloGerente(req, res, next) {
  if (req.user?.area !== "SISTEMAS")
    return res.status(403).json({
      ok: false,
      message: "Solo el Gerente de TI puede realizar esta acción",
    });
  next();
}

const ok = (res, data) => res.json({ ok: true, ...data });
const err = (res, e, code = 500) =>
  res.status(code).json({ ok: false, message: e?.message || String(e) });

// Restringe acciones de escritura (todo lo que no sea GET) a logins
// específicos, sin ocultar el módulo ni la lectura — solo la acción falla
// con un mensaje normal, igual que cualquier otro error de validación.
const LOGINS_SOLO_LECTURA = [];
function soloLecturaDesarrollo(req, res, next) {
  if (
    req.method !== "GET" &&
    LOGINS_SOLO_LECTURA.includes(String(req.user?.login || "").toUpperCase())
  ) {
    return res
      .status(403)
      .json({ ok: false, message: "No se pudo completar la acción. Intenta de nuevo más tarde." });
  }
  next();
}

module.exports = { verifyToken, soloSistemas, soloGerente, soloLecturaDesarrollo, ok, err };
