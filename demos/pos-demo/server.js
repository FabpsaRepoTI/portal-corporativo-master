// server.js — Mostrador · API del punto de venta + agente de IA.
// Node + Express + SQLite (node:sqlite). Sirve la app en http://localhost:4100
// Sesión simple por PIN (demo): 1234 cajero, 9999 gerente.
const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });
// Reutiliza la llave de IA del portal si la demo no tiene la suya
if (!process.env.ANTHROPIC_API_KEY) require("dotenv").config({ path: path.join(__dirname, "../../server/.env"), quiet: true });

const express = require("express");
const store = require("./db");
const agente = require("./agente");

const app = express();
app.use(express.json({ limit: "200kb" }));
app.use(express.static(path.join(__dirname, "public")));

const IVA = 0.16;
const r2 = (n) => Math.round(n * 100) / 100;
const ahora = () => new Date().toISOString();
const desde = (dias) => { const d = new Date(); d.setDate(d.getDate() - (dias - 1)); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const err = (res, status, error) => res.status(status).json({ ok: false, error });

// ── Sesión por PIN ───────────────────────────────────────
const sesiones = new Map(); // token → { nombre, rol, expira }
app.post("/api/login", (req, res) => {
  const pin = String(req.body?.pin || "");
  const u = store.db.prepare("SELECT nombre, rol FROM usuarios WHERE pin = ?").get(pin);
  if (!u) return err(res, 401, "PIN incorrecto");
  const token = crypto.randomBytes(24).toString("hex");
  sesiones.set(token, { ...u, expira: Date.now() + 12 * 3600e3 });
  res.json({ ok: true, token, usuario: u });
});
function auth(req, res, next) {
  const s = sesiones.get(String(req.headers.authorization || "").replace("Bearer ", ""));
  if (!s || s.expira < Date.now()) return err(res, 401, "Sesión expirada; vuelve a entrar con tu PIN");
  req.usuario = s;
  next();
}
const soloGerente = (req, res, next) => (req.usuario.rol === "gerente" ? next() : err(res, 403, "Solo el gerente puede hacer esto"));
app.use("/api", (req, res, next) => (req.path === "/login" ? next() : auth(req, res, next)));

// ── Catálogo e inventario ────────────────────────────────
app.get("/api/productos", (req, res) => {
  res.json({ ok: true, data: store.db.prepare("SELECT * FROM productos WHERE activo = 1 ORDER BY categoria, nombre").all() });
});
app.get("/api/productos/codigo/:codigo", (req, res) => {
  const c = String(req.params.codigo).trim();
  const p = store.db.prepare("SELECT * FROM productos WHERE activo = 1 AND (codigo_barras = ? OR UPPER(sku) = UPPER(?))").get(c, c);
  return p ? res.json({ ok: true, data: p }) : err(res, 404, "Código no registrado");
});
app.post("/api/productos", soloGerente, (req, res) => {
  const b = req.body || {};
  const nombre = String(b.nombre || "").trim().slice(0, 80);
  const precio = Number(b.precio), costo = Number(b.costo || 0), stock = parseInt(b.stock || 0, 10);
  if (!nombre || !(precio > 0) || costo < 0 || stock < 0) return err(res, 400, "Nombre, precio (> 0), costo y existencia válidos son obligatorios");
  const n = store.db.prepare("SELECT COUNT(*) AS n FROM productos").get().n + 1;
  const sku = "NEW-" + String(n).padStart(3, "0");
  const codigo = String(b.codigo_barras || "").trim() || "750" + String(Date.now()).slice(-10);
  try {
    store.db.prepare("INSERT INTO productos (sku, codigo_barras, nombre, categoria, precio, costo, stock, emoji) VALUES (?,?,?,?,?,?,?,?)")
      .run(sku, codigo, nombre, String(b.categoria || "General").slice(0, 30), precio, costo, stock, "📦");
  } catch { return err(res, 409, "Ese código de barras ya existe"); }
  res.status(201).json({ ok: true, data: { sku } });
});
// Entradas de mercancía (una o varias líneas: también aplica la orden del agente)
app.post("/api/inventario/entradas", soloGerente, (req, res) => {
  const lineas = Array.isArray(req.body?.lineas) ? req.body.lineas.slice(0, 50) : [];
  if (!lineas.length) return err(res, 400, "Sin líneas");
  const db = store.db;
  db.exec("BEGIN");
  try {
    for (const l of lineas) {
      const cant = parseInt(l.cantidad, 10);
      if (!(cant > 0) || cant > 10000) throw new Error("Cantidad inválida");
      const r = db.prepare("UPDATE productos SET stock = stock + ? WHERE sku = ?").run(cant, String(l.sku));
      if (!r.changes) throw new Error("Producto inexistente: " + l.sku);
      db.prepare("INSERT INTO movimientos_inventario (fecha, sku, tipo, cantidad, referencia, usuario) VALUES (?,?,?,?,?,?)")
        .run(ahora(), l.sku, "entrada", cant, String(req.body.referencia || "Entrada manual").slice(0, 60), req.usuario.nombre);
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); return err(res, 400, e.message); }
  res.json({ ok: true });
});

// ── Ventas (cobro) ───────────────────────────────────────
app.post("/api/ventas", (req, res) => {
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items : [];
  const metodo = String(b.metodo);
  if (!items.length || items.length > 100) return err(res, 400, "El ticket está vacío");
  if (!["efectivo", "tarjeta", "transferencia", "credito"].includes(metodo)) return err(res, 400, "Método de pago inválido");
  const db = store.db;
  const cliente = db.prepare("SELECT * FROM clientes WHERE id = ?").get(parseInt(b.cliente_id || 1, 10));
  if (!cliente) return err(res, 400, "Cliente inválido");
  if (metodo === "credito" && cliente.id === 1) return err(res, 400, "Para vender a crédito elige un cliente registrado");

  db.exec("BEGIN");
  try {
    // Precio y existencia salen de la base (no del navegador)
    const lineas = items.map((it) => {
      const p = db.prepare("SELECT * FROM productos WHERE sku = ? AND activo = 1").get(String(it.sku));
      const cant = parseInt(it.cantidad, 10);
      if (!p) throw new Error("Producto inexistente");
      if (!(cant > 0)) throw new Error("Cantidad inválida");
      if (cant > p.stock) throw new Error(`Sin existencia suficiente de ${p.nombre} (quedan ${p.stock})`);
      return { p, cant };
    });
    const total = r2(lineas.reduce((s, l) => s + l.p.precio * l.cant, 0));
    const sub = r2(total / (1 + IVA));
    const recibido = metodo === "efectivo" ? Number(b.recibido) : total;
    if (metodo === "efectivo" && !(recibido >= total)) throw new Error("El efectivo recibido no cubre el total");
    const v = db.prepare("INSERT INTO ventas (fecha, cliente_id, metodo, subtotal, iva, total, recibido, cajero) VALUES (?,?,?,?,?,?,?,?)")
      .run(ahora(), cliente.id, metodo, sub, r2(total - sub), total, recibido, req.usuario.nombre);
    const folio = Number(v.lastInsertRowid);
    for (const { p, cant } of lineas) {
      db.prepare("INSERT INTO venta_items (folio, sku, nombre, precio, cantidad) VALUES (?,?,?,?,?)").run(folio, p.sku, p.nombre, p.precio, cant);
      db.prepare("UPDATE productos SET stock = stock - ? WHERE sku = ?").run(cant, p.sku);
      db.prepare("INSERT INTO movimientos_inventario (fecha, sku, tipo, cantidad, referencia, usuario) VALUES (?,?,?,?,?,?)").run(ahora(), p.sku, "venta", -cant, "Venta #" + folio, req.usuario.nombre);
    }
    if (metodo === "credito") db.prepare("UPDATE clientes SET saldo = saldo + ? WHERE id = ?").run(total, cliente.id);
    db.exec("COMMIT");
    res.status(201).json({ ok: true, data: { folio, total, subtotal: sub, iva: r2(total - sub), recibido, cambio: r2(recibido - total),
      items: lineas.map((l) => ({ nombre: l.p.nombre, precio: l.p.precio, cantidad: l.cant })), cliente: cliente.nombre, cajero: req.usuario.nombre, fecha: ahora() } });
  } catch (e) {
    db.exec("ROLLBACK");
    err(res, 400, e.message);
  }
});
app.get("/api/ventas", (req, res) => {
  const rows = store.db.prepare(`SELECT v.*, c.nombre AS cliente FROM ventas v JOIN clientes c ON c.id = v.cliente_id ORDER BY v.folio DESC LIMIT 80`).all();
  res.json({ ok: true, data: rows });
});
app.post("/api/ventas/:folio/cancelar", soloGerente, (req, res) => {
  const db = store.db;
  const v = db.prepare("SELECT * FROM ventas WHERE folio = ?").get(parseInt(req.params.folio, 10));
  if (!v || v.cancelada) return err(res, 400, "Venta inexistente o ya cancelada");
  if (v.facturada) return err(res, 400, "Una venta facturada se cancela desde Facturación");
  db.exec("BEGIN");
  for (const i of db.prepare("SELECT * FROM venta_items WHERE folio = ?").all(v.folio)) {
    db.prepare("UPDATE productos SET stock = stock + ? WHERE sku = ?").run(i.cantidad, i.sku);
    db.prepare("INSERT INTO movimientos_inventario (fecha, sku, tipo, cantidad, referencia, usuario) VALUES (?,?,?,?,?,?)").run(ahora(), i.sku, "cancelacion", i.cantidad, "Cancelación #" + v.folio, req.usuario.nombre);
  }
  if (v.metodo === "credito") db.prepare("UPDATE clientes SET saldo = MAX(saldo - ?, 0) WHERE id = ?").run(v.total, v.cliente_id);
  db.prepare("UPDATE ventas SET cancelada = 1 WHERE folio = ?").run(v.folio);
  db.exec("COMMIT");
  res.json({ ok: true });
});

// ── Clientes y abonos ────────────────────────────────────
app.get("/api/clientes", (req, res) => res.json({ ok: true, data: store.db.prepare("SELECT * FROM clientes ORDER BY id").all() }));
app.post("/api/clientes/:id/abonos", (req, res) => {
  const c = store.db.prepare("SELECT * FROM clientes WHERE id = ?").get(parseInt(req.params.id, 10));
  const monto = r2(Number(req.body?.monto));
  if (!c) return err(res, 404, "Cliente inexistente");
  if (!(monto > 0) || monto > c.saldo) return err(res, 400, "Monto inválido");
  store.db.prepare("UPDATE clientes SET saldo = saldo - ? WHERE id = ?").run(monto, c.id);
  store.db.prepare("INSERT INTO abonos (fecha, cliente_id, monto, usuario) VALUES (?,?,?,?)").run(ahora(), c.id, monto, req.usuario.nombre);
  res.json({ ok: true });
});

// ── Tablero, caja y facturación ──────────────────────────
app.get("/api/tablero", (req, res) => {
  const db = store.db;
  const hoy = db.prepare("SELECT COUNT(*) AS tickets, COALESCE(SUM(total),0) AS total FROM ventas WHERE cancelada = 0 AND fecha >= ?").get(desde(1));
  const ayer = db.prepare("SELECT COALESCE(SUM(total),0) AS total FROM ventas WHERE cancelada = 0 AND fecha >= ? AND fecha < ?").get(desde(2), desde(1));
  const porDia = db.prepare("SELECT substr(fecha,1,10) AS dia, ROUND(SUM(total),2) AS total FROM ventas WHERE cancelada = 0 AND fecha >= ? GROUP BY dia ORDER BY dia").all(desde(14));
  const top = db.prepare(`SELECT i.nombre, SUM(i.cantidad) AS piezas FROM venta_items i JOIN ventas v ON v.folio = i.folio WHERE v.cancelada = 0 AND v.fecha >= ? GROUP BY i.sku ORDER BY piezas DESC LIMIT 5`).all(desde(7));
  const bajos = db.prepare("SELECT sku, nombre, emoji, stock, minimo FROM productos WHERE activo = 1 AND stock < minimo ORDER BY stock").all();
  const porCobrar = db.prepare("SELECT COALESCE(SUM(saldo),0) AS s FROM clientes").get().s;
  const utilidad = db.prepare(`SELECT COALESCE(SUM(i.cantidad * (i.precio - p.costo)),0) AS u FROM venta_items i JOIN ventas v ON v.folio = i.folio JOIN productos p ON p.sku = i.sku WHERE v.cancelada = 0 AND v.fecha >= ?`).get(desde(1)).u;
  res.json({ ok: true, data: { hoy: { ...hoy, total: r2(hoy.total) }, ayer: r2(ayer.total), utilidadHoy: r2(utilidad), porDia, top, bajos, porCobrar: r2(porCobrar) } });
});
app.get("/api/caja", (req, res) => {
  const filas = store.db.prepare("SELECT metodo, ROUND(SUM(total),2) AS total, COUNT(*) AS tickets FROM ventas WHERE cancelada = 0 AND fecha >= ? GROUP BY metodo").all(desde(1));
  res.json({ ok: true, data: { fondo: 500, porMetodo: filas, cortes: store.db.prepare("SELECT * FROM cortes ORDER BY id DESC LIMIT 5").all() } });
});
app.post("/api/caja/corte", (req, res) => {
  const contado = Number(req.body?.contado);
  if (!(contado >= 0)) return err(res, 400, "Captura el efectivo contado");
  const ef = store.db.prepare("SELECT COALESCE(SUM(total),0) AS t FROM ventas WHERE cancelada = 0 AND metodo = 'efectivo' AND fecha >= ?").get(desde(1)).t;
  const esperado = r2(500 + ef);
  store.db.prepare("INSERT INTO cortes (fecha, fondo, esperado, contado, diferencia, usuario) VALUES (?,?,?,?,?,?)").run(ahora(), 500, esperado, contado, r2(contado - esperado), req.usuario.nombre);
  res.json({ ok: true, data: { esperado, contado, diferencia: r2(contado - esperado) } });
});
app.post("/api/ventas/:folio/facturar", (req, res) => {
  const v = store.db.prepare("SELECT * FROM ventas WHERE folio = ?").get(parseInt(req.params.folio, 10));
  if (!v || v.cancelada) return err(res, 400, "Venta inexistente o cancelada");
  if (v.facturada) return err(res, 400, "La venta ya está facturada");
  const uuid = crypto.randomUUID().toUpperCase(); // simulado: no se timbra ante el SAT
  store.db.prepare("UPDATE ventas SET facturada = 1, uuid_factura = ? WHERE folio = ?").run(uuid, v.folio);
  res.json({ ok: true, data: { uuid } });
});

// ── Agente de IA ─────────────────────────────────────────
const enCurso = new Set();
const TOPE_DIA = Number(process.env.AGENTE_TOPE_DIA) || 30;
const tope = { dia: "", usadas: 0 };
app.post("/api/agente", async (req, res) => {
  const msgs = Array.isArray(req.body?.messages) ? req.body.messages.slice(-12) : [];
  if (!msgs.length || msgs.some((m) => !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || !m.content.trim() || m.content.length > 2000))
    return err(res, 400, "Mensaje inválido");
  const quien = req.usuario.nombre;
  if (enCurso.has(quien)) return err(res, 429, "Espera la respuesta anterior");
  // Tope diario de preguntas (controla el costo de la IA en demos públicas)
  const dia = new Date().toDateString();
  if (tope.dia !== dia) Object.assign(tope, { dia, usadas: 0 });
  if (tope.usadas >= TOPE_DIA) return err(res, 429, `El Copiloto alcanzó su límite de ${TOPE_DIA} preguntas de hoy en esta demo`);
  tope.usadas++;
  enCurso.add(quien);
  try {
    res.json({ ok: true, data: await agente.conversar(msgs, quien) });
  } catch (e) {
    console.error("[agente]", e.message);
    err(res, e.configuracion ? 503 : 502, e.configuracion ? "El agente no está configurado (falta la llave de IA)" : "El agente no está disponible en este momento");
  } finally {
    enCurso.delete(quien);
  }
});

app.post("/api/demo/reiniciar", soloGerente, (req, res) => { store.reiniciar(); res.json({ ok: true }); });

const PORT = Number(process.env.PORT) || 4100;
app.listen(PORT, () => console.log(`✅ Mostrador en http://localhost:${PORT}  · agente: ${agente.MODELO}`));
