require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const hardwareRoutes = require("./routes/hardware.routes");
const authRoutes = require("./routes/auth.routes");
const { getPool, sql } = require("./db");
const app = express();
const PORT = process.env.PORT || 3001;

// ── SSE CORS fix — debe ir ANTES del middleware cors general ──
app.options("/api/notificaciones/stream", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.sendStatus(200);
});
app.use("/api/notificaciones/stream", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir requests sin origin (Postman, mobile, etc.)
      if (!origin) return callback(null, true);

      const allowed = [
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:3550",
        "http://192.168.16.198",
        "http://192.168.16.198:3000",
        "http://192.168.16.198:3550",
        "http://201.151.218.138",
        "http://201.151.218.138:3550",
      ];

      // También permitir cualquier puerto de las IPs conocidas
      const allowedHosts = ["localhost", "192.168.16.198", "201.151.218.138"];

      try {
        const { hostname } = new URL(origin);
        if (allowedHosts.includes(hostname)) {
          return callback(null, true);
        }
      } catch {}

      if (allowed.includes(origin)) {
        return callback(null, true);
      }

      callback(new Error(`CORS bloqueado: ${origin}`));
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.static(path.join(__dirname, "../client/public")));

app.use(
  "/uploads",
  express.static(
    process.env.UPLOADS_DIR
      ? process.env.UPLOADS_DIR
      : path.join(__dirname, "../uploads"),
  ),
);

app.use(
  "/uploads",
  express.static(
    process.env.UPLOADS_DIR
      ? process.env.UPLOADS_DIR
      : path.join(__dirname, "../uploads"),
  ),
);

// AGREGAR ESTA LÍNEA — sirve también desde server/uploads/
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);

app.use("/api/hardware", hardwareRoutes);

const sistemasAdminRoutes = require("./routes/sistemasAdmin.routes");
app.use("/api/admin", sistemasAdminRoutes);

const serviciosRoutes = require("./routes/servicios.routes");
app.use("/api/servicios", serviciosRoutes);

const solicitudesAdminRoutes = require("./routes/solicitudesAdmin.routes");
app.use("/api/mesa-admin", solicitudesAdminRoutes);

const solicitudesTIRoutes = require("./routes/solicitudes.routes");
app.use("/api/solicitudes", solicitudesTIRoutes);

const solicitudesUsuarioRoutes = require("./routes/solicitudesUsuario.routes");
app.use("/api/solicitudes-usuario", solicitudesUsuarioRoutes);

const hwUsuarioRoutes = require("./routes/hardwareUsuario.routes");
app.use("/api/solicitudes-usuario/hardware", hwUsuarioRoutes);

const notificacionesRoutes = require("./routes/notificaciones.routes");
app.use("/api/notificaciones", notificacionesRoutes);

// D:\IntranetAPI\src\index.js
const usuariosRouter = require("./routes/usuarios.routes");
app.use("/api/usuarios", usuariosRouter);

const solicitudesDesarrollo = require("./routes/solicitudesDesarrollo.routes");
app.use("/api/solicitudes-desarrollo", solicitudesDesarrollo);

app.get("/", (req, res) => {
  res.send("API FABPSA funcionando en intranet");
});

app.get("/api/listo", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/birthdays", async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request().query(`
      SELECT
        LTRIM(RTRIM(A.Nombre)) AS nombre,
        LTRIM(RTRIM(A.apellidoPaterno)) AS apellidoPaterno,
        FORMAT(A.fechaNacimiento, 'd MMMM', 'es-ES') AS fechaNacimiento,
        DAY(A.fechaNacimiento) AS diaNacimiento,
        LTRIM(RTRIM(C.codigoSitio)) AS codigoSitio,
        LTRIM(RTRIM(C.nombreCorto)) AS sitio,
        LTRIM(RTRIM(B.departamento)) AS departamento
      FROM usuariosRH A
      JOIN DEPARTAMENTOS B ON A.departamento = B.codigoDepartamento
      JOIN SITIOS C ON B.codigoSitio = C.codigoSitio
      WHERE MONTH(A.fechaNacimiento) = MONTH(GETDATE())
        AND A.validaExistencia = 1
      ORDER BY DAY(A.fechaNacimiento)
    `);
    const rows = result.recordset.map((r) => ({
      ...r,
      initials: (
        (r.nombre?.[0] || "") + (r.apellidoPaterno?.[0] || "")
      ).toUpperCase(),
    }));
    res.json(rows);
  } catch (err) {
    console.error("DB Error:", err.message);
    res.status(500).json({ error: "Error consultando base de datos." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ FABPSA corriendo en http://localhost:${PORT}`);
});
