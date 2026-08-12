// ═══════════════════════════════════════════════════════════════
// solicitudesDesarrollo.routes.js  v4.1
// ═══════════════════════════════════════════════════════════════
"use strict";

const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const sql = require("mssql");
const { getPool } = require("../db");
const svc = require("../services/solicitudesDesarrollo.service");

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

const JWT_SECRET = process.env.JWT_SECRET || "fabpsa_secret_2026_intranet";

function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer "))
    return res.status(401).json({ message: "Sin token" });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Token inválido" });
  }
}

function soloSistemas(req, res, next) {
  if (req.user?.area !== "SISTEMAS")
    return res.status(403).json({ message: "Acceso restringido a Sistemas" });
  next();
}

const UPLOAD_DIR =
  process.env.NODE_ENV === "production"
    ? "D:\\IntranetAPI\\uploads\\solicitudes"
    : path.join(__dirname, "..", "uploads", "solicitudes");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) =>
    cb(
      null,
      `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`,
    ),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const ok = (res, data) => res.json({ ok: true, ...data });
const err = (res, e, code = 500) =>
  res.status(code).json({ ok: false, message: e?.message || String(e) });

// ── Catálogos / KPIs / Lista ──────────────────────────────────
router.get("/catalogos", verifyToken, async (req, res) => {
  try {
    res.json(await svc.getCatalogos());
  } catch (e) {
    err(res, e);
  }
});
router.get("/kpis", verifyToken, soloSistemas, async (req, res) => {
  try {
    res.json(await svc.getKpis(req.user.login));
  } catch (e) {
    err(res, e);
  }
});
router.get("/", verifyToken, soloSistemas, async (req, res) => {
  try {
    res.json(await svc.getLista(req.query));
  } catch (e) {
    err(res, e);
  }
});

// ── Crear solicitud ───────────────────────────────────────────
router.post("/", verifyToken, upload.array("archivos", 5), async (req, res) => {
  try {
    ok(res, await svc.crearSolicitud(req.body, req.user, req.files || []));
  } catch (e) {
    err(res, e);
  }
});

// ── Mis solicitudes (usuario) — ANTES de /:id ────────────────
router.get("/mis-solicitudes", verifyToken, async (req, res) => {
  try {
    const { estatus, search, orden } = req.query;
    const data = await svc.getMisSolicitudes(req.user.login, {
      estatus,
      search,
      orden,
    });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.get("/mis-solicitudes/:id", verifyToken, async (req, res) => {
  try {
    const data = await svc.getMiSolicitudDetalle(req.params.id, req.user.login);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.get(
  "/mis-solicitudes/:id/actividades",
  verifyToken,
  async (req, res) => {
    try {
      const data = await svc.getMiSolicitudActividades(
        req.params.id,
        req.user.login,
      );
      res.json({ ok: true, data });
    } catch (e) {
      res.status(e.status || 500).json({ ok: false, message: e.message });
    }
  },
);

// ── Archivo estático — ANTES de /:id para evitar colisión ─────
router.get("/archivo", verifyToken, (req, res) => {
  const ruta = req.query.ruta;

  if (!ruta || !ruta.startsWith("/uploads/")) {
    return res.status(400).json({ ok: false, message: "Ruta inválida" });
  }

  const UPLOADS_ROOT = process.env.UPLOADS_DIR
    ? path.dirname(process.env.UPLOADS_DIR)
    : path.join(__dirname, "..", "..", "uploads");

  const rutaRelativa = ruta.replace(/^\/uploads\//, "");
  const rutaFisica = path.join(UPLOADS_ROOT, rutaRelativa);

  if (!fs.existsSync(rutaFisica)) {
    return res
      .status(404)
      .json({ ok: false, message: "Archivo no encontrado", ruta: rutaFisica });
  }

  res.sendFile(rutaFisica);
});

// ── Detalle ───────────────────────────────────────────────────
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const data = await svc.getDetalle(parseInt(req.params.id));
    if (!data)
      return res.status(404).json({ ok: false, message: "No encontrado" });
    res.json(data);
  } catch (e) {
    err(res, e);
  }
});

// ── Estatus / Concluir / Asignar / Detalle ────────────────────
router.put("/:id/estatus", verifyToken, soloSistemas, async (req, res) => {
  try {
    ok(
      res,
      await svc.cambiarEstatus(parseInt(req.params.id), req.body, req.user),
    );
  } catch (e) {
    err(res, e, 400);
  }
});
router.post("/:id/concluir", verifyToken, soloSistemas, async (req, res) => {
  try {
    ok(
      res,
      await svc.concluirDesarrollo(parseInt(req.params.id), req.body, req.user),
    );
  } catch (e) {
    err(res, e, 400);
  }
});
router.put("/:id/asignar", verifyToken, soloSistemas, async (req, res) => {
  try {
    ok(
      res,
      await svc.asignarResponsable(parseInt(req.params.id), req.body, req.user),
    );
  } catch (e) {
    err(res, e);
  }
});
router.put("/:id/detalle", verifyToken, soloSistemas, async (req, res) => {
  try {
    ok(
      res,
      await svc.actualizarDetalle(parseInt(req.params.id), req.body, req.user),
    );
  } catch (e) {
    err(res, e);
  }
});

// ── Tipo de desarrollo ────────────────────────────────────────
router.put("/:id/tipo-desarrollo", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { tipoDesarrollo } = req.body;

    const TIPOS_VALIDOS = [
      "SOLICITUD_USUARIO",
      "CORRECTIVO",
      "PREVENTIVO",
      "INICIATIVA_PROPIA",
    ];
    if (!tipoDesarrollo || !TIPOS_VALIDOS.includes(tipoDesarrollo)) {
      return res.json({ ok: false, message: "Tipo de desarrollo inválido" });
    }

    const pool = await getPool();
    await pool
      .request()
      .input("idSolicitud", sql.Int, parseInt(id))
      .input("tipoDesarrollo", sql.VarChar(30), tipoDesarrollo)
      .query(
        "UPDATE solicitudTI_desarrollo_detalle SET tipoDesarrollo=@tipoDesarrollo WHERE idSolicitud=@idSolicitud",
      );

    return res.json({ ok: true, message: "Tipo de desarrollo guardado" });
  } catch (e) {
    console.error(e);
    return res.json({
      ok: false,
      message: "Error al guardar tipo de desarrollo",
    });
  }
});

// ── Comentario / Actividad ────────────────────────────────────
router.post("/:id/comentario", verifyToken, async (req, res) => {
  try {
    ok(
      res,
      await svc.agregarComentario(parseInt(req.params.id), req.body, req.user),
    );
  } catch (e) {
    err(res, e);
  }
});
router.post("/:id/actividad", verifyToken, soloSistemas, async (req, res) => {
  try {
    ok(
      res,
      await svc.agregarActividad(parseInt(req.params.id), req.body, req.user),
    );
  } catch (e) {
    err(res, e, 400);
  }
});

// ── Horas trabajadas ──────────────────────────────────────────
router.post("/:id/horas", verifyToken, soloSistemas, async (req, res) => {
  try {
    ok(
      res,
      await svc.registrarHoras(parseInt(req.params.id), req.body, req.user),
    );
  } catch (e) {
    err(res, e, 400);
  }
});
router.delete(
  "/:id/horas/:idRegistro",
  verifyToken,
  soloSistemas,
  async (req, res) => {
    try {
      ok(
        res,
        await svc.eliminarHoras(
          parseInt(req.params.id),
          parseInt(req.params.idRegistro),
          req.user,
        ),
      );
    } catch (e) {
      err(res, e, 400);
    }
  },
);

// ── Subtareas ─────────────────────────────────────────────────
router.post("/:id/subtareas", verifyToken, soloSistemas, async (req, res) => {
  try {
    ok(
      res,
      await svc.crearSubtarea(parseInt(req.params.id), req.body, req.user),
    );
  } catch (e) {
    err(res, e, 400);
  }
});
router.put(
  "/:id/subtareas/:idSub",
  verifyToken,
  soloSistemas,
  async (req, res) => {
    try {
      ok(
        res,
        await svc.actualizarSubtarea(
          parseInt(req.params.id),
          parseInt(req.params.idSub),
          req.body,
          req.user,
        ),
      );
    } catch (e) {
      err(res, e, 400);
    }
  },
);

// ── Bloqueos ──────────────────────────────────────────────────
router.post("/:id/bloqueos", verifyToken, soloSistemas, async (req, res) => {
  try {
    ok(
      res,
      await svc.registrarBloqueo(parseInt(req.params.id), req.body, req.user),
    );
  } catch (e) {
    err(res, e, 400);
  }
});
router.put(
  "/:id/bloqueos/:idBloqueo/resolver",
  verifyToken,
  soloSistemas,
  async (req, res) => {
    try {
      ok(
        res,
        await svc.resolverBloqueo(
          parseInt(req.params.id),
          parseInt(req.params.idBloqueo),
          req.user,
        ),
      );
    } catch (e) {
      err(res, e, 400);
    }
  },
);

// ── Evaluación (solo solicitante, verificado en service) ──────
router.post("/:id/evaluacion", verifyToken, async (req, res) => {
  try {
    ok(
      res,
      await svc.registrarEvaluacion(
        parseInt(req.params.id),
        req.body,
        req.user,
      ),
    );
  } catch (e) {
    err(res, e, 400);
  }
});

// ── Impacto (legacy) / Adjuntos ───────────────────────────────
router.post("/:id/impacto", verifyToken, soloSistemas, async (req, res) => {
  try {
    ok(
      res,
      await svc.registrarImpacto(parseInt(req.params.id), req.body, req.user),
    );
  } catch (e) {
    err(res, e);
  }
});
router.post(
  "/:id/adjuntos",
  verifyToken,
  upload.array("archivos", 5),
  async (req, res) => {
    try {
      ok(res, {
        adjuntos: await svc.subirAdjuntos(
          parseInt(req.params.id),
          req.files || [],
          req.user,
        ),
      });
    } catch (e) {
      err(res, e);
    }
  },
);

module.exports = router;
