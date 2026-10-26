// db.js — base de datos SQLite (node:sqlite, incluido en Node 22+): un solo
// archivo en ./data/mostrador.db. Al crearse por primera vez se llena con
// datos ficticios de una tiendita/cafetería.
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DIR = path.join(__dirname, "data");
fs.mkdirSync(DIR, { recursive: true });
const ARCHIVO = path.join(DIR, "mostrador.db");

function abrir() {
  const db = new DatabaseSync(ARCHIVO);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS productos (
      sku TEXT PRIMARY KEY, codigo_barras TEXT UNIQUE, nombre TEXT NOT NULL, categoria TEXT NOT NULL,
      precio REAL NOT NULL CHECK (precio >= 0), costo REAL NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0,
      minimo INTEGER NOT NULL DEFAULT 10, emoji TEXT DEFAULT '📦', activo INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, rfc TEXT, telefono TEXT, saldo REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS ventas (
      folio INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, cliente_id INTEGER NOT NULL REFERENCES clientes(id),
      metodo TEXT NOT NULL CHECK (metodo IN ('efectivo','tarjeta','transferencia','credito')),
      subtotal REAL NOT NULL, iva REAL NOT NULL, total REAL NOT NULL, recibido REAL, cajero TEXT NOT NULL,
      facturada INTEGER NOT NULL DEFAULT 0, uuid_factura TEXT, cancelada INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS venta_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, folio INTEGER NOT NULL REFERENCES ventas(folio), sku TEXT NOT NULL REFERENCES productos(sku),
      nombre TEXT NOT NULL, precio REAL NOT NULL, cantidad INTEGER NOT NULL CHECK (cantidad > 0)
    );
    CREATE TABLE IF NOT EXISTS movimientos_inventario (
      id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, sku TEXT NOT NULL REFERENCES productos(sku),
      tipo TEXT NOT NULL CHECK (tipo IN ('venta','entrada','ajuste','cancelacion')), cantidad INTEGER NOT NULL, referencia TEXT, usuario TEXT
    );
    CREATE TABLE IF NOT EXISTS abonos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, cliente_id INTEGER NOT NULL REFERENCES clientes(id), monto REAL NOT NULL, usuario TEXT
    );
    CREATE TABLE IF NOT EXISTS cortes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, fondo REAL NOT NULL, esperado REAL NOT NULL, contado REAL NOT NULL, diferencia REAL NOT NULL, usuario TEXT
    );
    CREATE TABLE IF NOT EXISTS usuarios (
      pin TEXT PRIMARY KEY, nombre TEXT NOT NULL, rol TEXT NOT NULL CHECK (rol IN ('cajero','gerente'))
    );
    CREATE TABLE IF NOT EXISTS agente_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, usuario TEXT, herramienta TEXT, parametros TEXT
    );
  `);
  const hay = db.prepare("SELECT COUNT(*) AS n FROM productos").get().n;
  if (!hay) sembrar(db);
  return db;
}

function sembrar(db) {
  const productos = [
    ["CAF-001", "7501000000011", "Café americano 12 oz", "Bebidas", 38, 9, 120, "☕"],
    ["CAF-002", "7501000000028", "Capuchino 12 oz", "Bebidas", 52, 14, 80, "☕"],
    ["BEB-010", "7501000000103", "Agua natural 600 ml", "Bebidas", 15, 6, 200, "💧"],
    ["BEB-011", "7501000000110", "Refresco lata 355 ml", "Bebidas", 22, 11, 6, "🥤"],
    ["BEB-012", "7501000000127", "Jugo de naranja 500 ml", "Bebidas", 34, 15, 24, "🧃"],
    ["PAN-020", "7501000000202", "Croissant de mantequilla", "Panadería", 35, 12, 40, "🥐"],
    ["PAN-021", "7501000000219", "Concha de vainilla", "Panadería", 18, 5, 0, "🍞"],
    ["PAN-022", "7501000000226", "Muffin de arándano", "Panadería", 42, 14, 25, "🧁"],
    ["SNK-030", "7501000000301", "Galletas de avena", "Snacks", 28, 10, 60, "🍪"],
    ["SNK-031", "7501000000318", "Papas sal de mar", "Snacks", 24, 11, 4, "🥔"],
    ["SNK-032", "7501000000325", "Barra de granola", "Snacks", 19, 8, 70, "🥜"],
    ["ABR-040", "7501000000400", "Leche entera 1 L", "Abarrotes", 29, 21, 48, "🥛"],
    ["ABR-041", "7501000000417", "Huevo 12 piezas", "Abarrotes", 54, 38, 30, "🥚"],
    ["ABR-042", "7501000000424", "Arroz 1 kg", "Abarrotes", 32, 22, 55, "🍚"],
    ["ABR-043", "7501000000431", "Frijol negro 1 kg", "Abarrotes", 44, 31, 8, "🫘"],
    ["LIM-050", "7501000000509", "Jabón de manos 500 ml", "Limpieza", 48, 27, 22, "🧴"],
  ];
  const insP = db.prepare("INSERT INTO productos (sku, codigo_barras, nombre, categoria, precio, costo, stock, emoji) VALUES (?,?,?,?,?,?,?,?)");
  for (const p of productos) insP.run(...p);

  const insC = db.prepare("INSERT INTO clientes (nombre, rfc, telefono, saldo) VALUES (?,?,?,?)");
  insC.run("Público en general", "XAXX010101000", "", 0);
  insC.run("Cafetería La Esquina", "CLE190305AB1", "55 1234 5678", 1250);
  insC.run("María Fernanda López", "LOFM900101XX1", "55 8765 4321", 0);
  insC.run("Oficinas Delta SA de CV", "ODE150720QW3", "55 2468 1357", 3480);

  const insU = db.prepare("INSERT INTO usuarios (pin, nombre, rol) VALUES (?,?,?)");
  insU.run("1234", "Cajero Demo", "cajero");
  insU.run("9999", "Gerente Demo", "gerente");

  // 14 días de ventas ficticias
  const insV = db.prepare("INSERT INTO ventas (fecha, cliente_id, metodo, subtotal, iva, total, recibido, cajero, facturada) VALUES (?,?,?,?,?,?,?,?,?)");
  const insI = db.prepare("INSERT INTO venta_items (folio, sku, nombre, precio, cantidad) VALUES (?,?,?,?,?)");
  const metodos = ["efectivo", "efectivo", "tarjeta", "tarjeta", "transferencia"];
  db.exec("BEGIN");
  for (let d = 13; d >= 0; d--) {
    const n = 8 + Math.floor(Math.random() * 14);
    for (let i = 0; i < n; i++) {
      const f = new Date();
      f.setDate(f.getDate() - d);
      f.setHours(7 + Math.floor(Math.random() * 13), Math.floor(Math.random() * 60), 0, 0);
      const lineas = [...Array(1 + Math.floor(Math.random() * 3))].map(() => {
        const p = productos[Math.floor(Math.random() * productos.length)];
        return { sku: p[0], nombre: p[2], precio: p[4], cantidad: 1 + Math.floor(Math.random() * 2) };
      });
      const total = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
      const sub = +(total / 1.16).toFixed(2);
      const r = insV.run(f.toISOString(), 1, metodos[i % metodos.length], sub, +(total - sub).toFixed(2), total, total, "Cajero Demo", Math.random() < 0.15 ? 1 : 0);
      for (const l of lineas) insI.run(r.lastInsertRowid, l.sku, l.nombre, l.precio, l.cantidad);
    }
  }
  db.exec("COMMIT");
}

let _db = abrir();
module.exports = {
  get db() { return _db; },
  reiniciar() {
    _db.close();
    for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { force: true });
    _db = abrir();
  },
};
