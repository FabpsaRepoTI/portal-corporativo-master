// ─────────────────────────────────────────────
//  usuarios.service.js
//  D:\IntranetAPI\src\services\usuarios.service.js
// ─────────────────────────────────────────────
const sql = require("mssql");
const { getPool } = require("../db");

/* ─── LISTAR USUARIOS ─────────────────────────
   Devuelve todos los usuarios (sin exponer pswd).
   Soporta búsqueda por texto, sitio y área.
──────────────────────────────────────────────── */
async function getUsuarios({ search = "", sitio = "", area = "" } = {}) {
  const pool = await getPool();
  const req = pool.request();

  let where = "WHERE 1=1";

  if (search) {
    req.input("search", sql.NVarChar, `%${search}%`);
    where +=
      " AND (login LIKE @search OR name LIKE @search OR email LIKE @search)";
  }
  if (sitio) {
    req.input("sitio", sql.NVarChar, sitio);
    where += " AND sitio = @sitio";
  }
  if (area) {
    req.input("area", sql.NVarChar, area);
    where += " AND area = @area";
  }

  const result = await req.query(`
    SELECT
      login,
      name,
      email,
      active,
      role,
      phone,
      sitio,
      area,
      priv_admin,
      mfa,
      picture
    FROM SEC_USERS
    ${where}
    ORDER BY name ASC
  `);

  return result.recordset;
}

/* ─── OBTENER UN USUARIO ──────────────────────── */
async function getUsuarioByLogin(login) {
  const pool = await getPool();
  const result = await pool.request().input("login", sql.NVarChar, login)
    .query(`
      SELECT
        login, name, email, active,
        role, phone, sitio, area,
        priv_admin, mfa, picture
      FROM SEC_USERS
      WHERE login = @login
    `);

  return result.recordset[0] ?? null;
}

/* ─── VERIFICAR LOGIN DUPLICADO ──────────────── */
async function loginExiste(login) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("login", sql.NVarChar, login)
    .query("SELECT COUNT(1) AS cnt FROM SEC_USERS WHERE login = @login");

  return result.recordset[0].cnt > 0;
}

/* ─── CREAR USUARIO ──────────────────────────── */
async function crearUsuario(data) {
  const {
    login,
    pswd,
    name,
    email,
    sitio,
    area,
    role = null,
    phone = null,
  } = data;

  // Validaciones mínimas de integridad
  if (!login || !pswd || !name || !email || !sitio || !area) {
    throw new Error("Faltan campos obligatorios.");
  }

  const pool = await getPool();

  await pool
    .request()
    .input("login", sql.NVarChar, login.toUpperCase().trim())
    .input("pswd", sql.NVarChar, pswd)
    .input("name", sql.NVarChar, name.trim())
    .input("email", sql.NVarChar, email.trim().toLowerCase())
    .input("sitio", sql.NVarChar, sitio)
    .input("area", sql.NVarChar, area.trim().toUpperCase())
    .input("role", sql.NVarChar, role)
    .input("phone", sql.NVarChar, phone).query(`
      INSERT INTO SEC_USERS
        (login, pswd, name, email, active, activation_code,
         priv_admin, mfa, picture, role, phone, sitio, area)
      VALUES
        (@login, @pswd, @name, @email, 'Y', NULL,
         NULL, NULL, NULL, @role, @phone, @sitio, @area)
    `);

  return { ok: true, login: login.toUpperCase().trim() };
}

/* ─── EDITAR USUARIO ─────────────────────────── */
async function editarUsuario(login, data) {
  const { name, email, sitio, area, role, phone, pswd } = data;

  if (!name || !email || !sitio || !area) {
    throw new Error("Faltan campos obligatorios.");
  }

  const pool = await getPool();
  const req = pool
    .request()
    .input("login", sql.NVarChar, login)
    .input("name", sql.NVarChar, name.trim())
    .input("email", sql.NVarChar, email.trim().toLowerCase())
    .input("sitio", sql.NVarChar, sitio)
    .input("area", sql.NVarChar, area.trim().toUpperCase())
    .input("role", sql.NVarChar, role ?? null)
    .input("phone", sql.NVarChar, phone ?? null);

  // Solo actualiza pswd si se envió un valor nuevo
  let setPswd = "";
  if (pswd && pswd.trim() !== "") {
    req.input("pswd", sql.NVarChar, pswd);
    setPswd = ", pswd = @pswd";
  }

  await req.query(`
    UPDATE SEC_USERS SET
      name  = @name,
      email = @email,
      sitio = @sitio,
      area  = @area,
      role  = @role,
      phone = @phone
      ${setPswd}
    WHERE login = @login
  `);

  return { ok: true };
}

/* ─── TOGGLE ACTIVO/INACTIVO ─────────────────── */
async function toggleActivo(login, active) {
  const val = active ? "Y" : "N";
  const pool = await getPool();

  await pool
    .request()
    .input("login", sql.NVarChar, login)
    .input("active", sql.NVarChar, val)
    .query("UPDATE SEC_USERS SET active = @active WHERE login = @login");

  return { ok: true, active: val };
}

module.exports = {
  getUsuarios,
  getUsuarioByLogin,
  loginExiste,
  crearUsuario,
  editarUsuario,
  toggleActivo,
};
