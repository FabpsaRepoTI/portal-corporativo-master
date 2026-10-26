// D:\IntranetAPI\src\routes\auth.routes.js
const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { getPool, sql } = require("../db");
const { getModulosUsuario } = require("../services/permisos.service");
const { verifyToken, JWT_SECRET } = require("../middleware/auth");

const router = express.Router();
// El token dura poco (para que los cambios de permisos se reflejen pronto) y
// el cliente lo renueva en silencio. La SESIÓN, en cambio, dura 8 h desde el
// login: mientras no pasen, un token vencido (equipo suspendido, pestaña
// dormida, navegador cerrado) todavía se puede renovar sin volver a entrar.
const SESSION_TTL = "20m";
const SESSION_MAX_SEG = 8 * 60 * 60;

// Secret interno para firmar tokens de captcha — distinto al JWT de sesión
const CAPTCHA_SECRET =
  "fabpsa_captcha_2026_" + crypto.randomBytes(8).toString("hex");

// ── GET /api/auth/captcha-token ───────────────────────────
router.get("/captcha-token", (req, res) => {
  const token = jwt.sign({ type: "captcha", ts: Date.now() }, CAPTCHA_SECRET, {
    expiresIn: "10m",
  });
  return res.json({ captchaToken: token });
});

// ── POST /api/auth/login ──────────────────────────────────
router.post("/login", async (req, res) => {
  const { login, password, captchaToken } = req.body;

  if (!login || !password) {
    return res.status(400).json({ error: "Login y contraseña requeridos." });
  }

  if (!captchaToken) {
    return res.status(400).json({
      code: "CAPTCHA_REQUIRED",
      error: "Completa la verificación de seguridad.",
    });
  }
  try {
    const decoded = jwt.verify(captchaToken, CAPTCHA_SECRET);
    if (decoded.type !== "captcha") throw new Error("tipo inválido");
  } catch {
    return res.status(400).json({
      code: "CAPTCHA_INVALID",
      error: "Verificación de seguridad inválida o expirada. Intenta de nuevo.",
    });
  }

  try {
    const db = await getPool();

    const result = await db.request().input("login", sql.VarChar, login.trim())
      .query(`
        SELECT login, pswd, name, email, active,
               priv_admin, role, sitio, area, picture, phone
        FROM sec_users WHERE login = @login
      `);

    const user = result.recordset[0];

    if (!user) {
      return res.status(401).json({
        code: "NOT_FOUND",
        error: "No existe un usuario registrado con ese identificador.",
      });
    }
    if (user.pswd !== password) {
      return res.status(401).json({
        code: "WRONG_PASSWORD",
        error: "Usuario o contraseña incorrectos.",
      });
    }

    // ── Trae módulos + flag esMto ─────────────────────────
    const { modulos, esMto } = await getModulosUsuario(login.trim());

    /*if (user.active !== "Y") {
      await db
        .request()
        .input("login", sql.VarChar, login.trim())
        .query(`UPDATE sec_users SET active = 'Y' WHERE login = @login`);
      const payload = buildPayload(user, modulos, esMto);
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
      return res.json({ code: "FIRST_ACCESS", token, user: payload });
    }*/

    const payload = buildPayload(user, modulos, esMto, Math.floor(Date.now() / 1000));
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_TTL });
    return res.json({ token, user: payload });
  } catch (err) {
    console.error("Auth Error:", err.message);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── POST /api/auth/refresh ────────────────────────────────
// Acepta un token con firma válida aunque ya haya vencido, siempre que la
// sesión no pase de 8 h desde el login. Reconsulta permisos en BD para que
// los cambios de acceso se reflejen sin esperar a un nuevo login.
router.post("/refresh", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token no proporcionado." });
  }

  let anterior;
  try {
    anterior = jwt.verify(authHeader.split(" ")[1], JWT_SECRET, { ignoreExpiration: true });
  } catch {
    return res.status(401).json({ error: "Token inválido." });
  }

  // Tokens emitidos antes de este cambio no traen sesionInicio: se toma iat
  const sesionInicio = anterior.sesionInicio || anterior.iat;
  if (!sesionInicio || Date.now() / 1000 - sesionInicio > SESSION_MAX_SEG) {
    return res.status(401).json({ error: "La sesión terminó. Inicia sesión de nuevo.", expired: true });
  }

  try {
    const { modulos, esMto } = await getModulosUsuario(anterior.login);
    const payload = buildPayload(anterior, modulos, esMto, sesionInicio);
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_TTL });
    return res.json({ token, user: payload });
  } catch (err) {
    console.error("Auth Refresh Error:", err.message);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── buildPayload ──────────────────────────────────────────
function buildPayload(user, modulos = [], esMto = false, sesionInicio) {
  return {
    sesionInicio, // segundos epoch del login; limita la sesión a 8 h
    login: user.login,
    name: user.name,
    email: user.email,
    role: user.role,
    sitio: user.sitio,
    area: user.area,
    priv_admin: user.priv_admin,
    modulos,
    esMto, // true = técnico/jefe de Mantenimiento, false = solicitante normal
  };
}

module.exports = router;
