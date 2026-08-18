// ─────────────────────────────────────────────────────────
//  D:\IntranetAPI\src\routes\auth.routes.js
// ─────────────────────────────────────────────────────────
const express = require("express");
const jwt = require("jsonwebtoken");
const { getPool, sql } = require("../db");
const { getModulosUsuario } = require("../services/permisos.service");

const router = express.Router();
const JWT_SECRET = "fabpsa_secret_2026_intranet";

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { login, password } = req.body;

  if (!login || !password) {
    return res.status(400).json({ error: "Login y contraseña requeridos." });
  }

  try {
    const db = await getPool();

    const result = await db.request().input("login", sql.VarChar, login.trim())
      .query(`
        SELECT login, pswd, name, email, active,
               priv_admin, role, sitio, area, picture, phone
        FROM sec_users
        WHERE login = @login
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

    // ← NUEVO: obtener módulos del usuario antes de firmar el token
    const modulos = await getModulosUsuario(login.trim());

    if (user.active !== "Y") {
      await db
        .request()
        .input("login", sql.VarChar, login.trim())
        .query(`UPDATE sec_users SET active = 'Y' WHERE login = @login`);

      const payload = buildPayload(user, modulos); // ← modulos
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
      return res.json({ code: "FIRST_ACCESS", token, user: payload });
    }

    const payload = buildPayload(user, modulos); // ← modulos
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
    return res.json({ token, user: payload });
  } catch (err) {
    console.error("Auth Error:", err.message);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── Helper ─────────────────────────────────────────────────
function buildPayload(user, modulos = []) {
  // ← modulos
  return {
    login: user.login,
    name: user.name,
    email: user.email,
    role: user.role,
    sitio: user.sitio,
    area: user.area,
    priv_admin: user.priv_admin,
    modulos, // ← modulos
  };
}

module.exports = router;
