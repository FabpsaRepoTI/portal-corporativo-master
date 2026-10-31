"use strict";
const sql = require("mssql");
const { normalizarNombreCorto } = require("../helpers/nombreCorto");
const { getPool } = require("../db");

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
    SELECT login, name, email, active, role, phone, sitio, area, priv_admin, mfa, picture
    FROM SEC_USERS
    ${where}
    ORDER BY name ASC
  `);

  return result.recordset.map((u) => ({
    ...u,
    picture: typeof u.picture === "string" ? u.picture : null,
  }));
}

async function getUsuarioByLogin(login) {
  const pool = await getPool();
  const result = await pool.request().input("login", sql.NVarChar, login)
    .query(`
      SELECT login, name, email, active, role, phone, sitio, area, priv_admin, mfa, picture
      FROM SEC_USERS
      WHERE login = @login
    `);

  const u = result.recordset[0];
  if (!u) return null;
  return {
    ...u,
    picture: typeof u.picture === "string" ? u.picture : null,
  };
}

async function getPassword(login) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("login", sql.NVarChar, login)
    .query("SELECT pswd FROM SEC_USERS WHERE login = @login");
  const u = result.recordset[0];
  return u ? u.pswd : null;
}

async function loginExiste(login) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("login", sql.NVarChar, login)
    .query("SELECT COUNT(1) AS cnt FROM SEC_USERS WHERE login = @login");
  return result.recordset[0].cnt > 0;
}

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

  if (!login || !pswd || !name || !email || !sitio || !area)
    throw new Error("Faltan campos obligatorios.");

  const nombre = normalizarNombreCorto(name);
  const pool = await getPool();
  await pool
    .request()
    .input("login", sql.NVarChar, login.toUpperCase().trim())
    .input("pswd", sql.NVarChar, pswd)
    .input("name", sql.NVarChar, nombre)
    .input("email", sql.NVarChar, email.trim().toLowerCase())
    .input("sitio", sql.NVarChar, sitio)
    .input("area", sql.NVarChar, area.trim().toUpperCase())
    .input("role", sql.NVarChar, role)
    .input("phone", sql.NVarChar, phone).query(`
      INSERT INTO SEC_USERS
        (login, pswd, name, email, active, activation_code, priv_admin, mfa, picture, role, phone, sitio, area)
      VALUES
        (@login, @pswd, @name, @email, 'Y', NULL, NULL, NULL, NULL, @role, @phone, @sitio, @area)
    `);

  return { ok: true, login: login.toUpperCase().trim() };
}

async function editarUsuario(login, data) {
  const { name, email, sitio, area, role, phone, pswd, picture } = data;

  if (!name || !email || !sitio || !area)
    throw new Error("Faltan campos obligatorios.");

  const nombre = normalizarNombreCorto(name);
  const pool = await getPool();
  const req = pool
    .request()
    .input("login", sql.NVarChar, login)
    .input("name", sql.NVarChar, nombre)
    .input("email", sql.NVarChar, email.trim().toLowerCase())
    .input("sitio", sql.NVarChar, sitio)
    .input("area", sql.NVarChar, area.trim().toUpperCase())
    .input("role", sql.NVarChar, role ?? null)
    .input("phone", sql.NVarChar, phone ?? null);

  let setPswd = "";
  let setPicture = "";

  if (pswd && pswd.trim() !== "") {
    req.input("pswd", sql.NVarChar, pswd);
    setPswd = ", pswd = @pswd";
  }

  // Solo actualizar picture si viene como URL limpia (no base64)
  if (picture && typeof picture === "string" && !picture.startsWith("data:")) {
    req.input("picture", sql.NVarChar(500), picture);
    setPicture = ", picture = @picture";
  }

  // Si viene vacío = quitar foto
  if (picture === "") {
    req.input("picture", sql.NVarChar(500), null);
    setPicture = ", picture = @picture";
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
      ${setPicture}
    WHERE login = @login
  `);

  return { ok: true };
}

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

async function actualizarFotoUsuario(login, pictureUrl) {
  const pool = await getPool();
  await pool
    .request()
    .input("login", sql.NVarChar, login)
    .input("picture", sql.NVarChar(500), pictureUrl)
    .query(`UPDATE SEC_USERS SET picture = @picture WHERE login = @login`);
}

module.exports = {
  getUsuarios,
  getUsuarioByLogin,
  getPassword,
  loginExiste,
  crearUsuario,
  editarUsuario,
  toggleActivo,
  actualizarFotoUsuario,
};
