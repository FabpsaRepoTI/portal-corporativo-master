// server/services/dev/sharepoint.service.js
// Integración con Microsoft Graph API para leer documentos de SharePoint FABPSA TI

const TENANT_ID = process.env.SP_TENANT_ID;
const CLIENT_ID = process.env.SP_CLIENT_ID;
const CLIENT_SECRET = process.env.SP_CLIENT_SECRET;
const SITE_ID = process.env.SP_SITE_ID; // 52e45fd5-2ea3-472e-a73b-9637c997ed12

// Mapeo de carpetas SharePoint → colecciones del portal
const CARPETAS_COLECCIONES = {
  Diagramas: "diagramas",
  Manuales: "manuales",
  "Notas de Liberación": "notas-liberacion",
  Otro: "otro",
  Pruebas: "pruebas",
};
const DESARROLLADORES = {
  AMORENO: "Abraham Moreno",
  IAFSA8404: "Alberto Manzo",
  DRODRIGUEZ: "Damian Rodríguez",
  JMRAMIREZ: "Juan Ramírez",
  OSANTIAGO: "Óscar Santiago",
};
const normal = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
const enc = encodeURIComponent;
const descriptionText = (v) =>
  String(v || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

// ─── Token cache en memoria ───────────────────────────────────────────────────
let _tokenCache = null;
let _tokenExpires = 0;

async function getAccessToken() {
  const ahora = Date.now();
  if (_tokenCache && ahora < _tokenExpires - 60000) {
    return _tokenCache;
  }

  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[sharepoint.service] Error obteniendo token: ${err}`);
  }

  const data = await res.json();
  _tokenCache = data.access_token;
  _tokenExpires = ahora + data.expires_in * 1000;
  return _tokenCache;
}

// lamada base a Graph API
async function graphGet(path) {
  const token = await getAccessToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw Object.assign(new Error(`Graph HTTP ${res.status}`), {
      status: res.status,
    });
  }

  return res.json();
}

//Obtener Drive ID del sitio
let _driveId = null;

async function getDriveId() {
  if (_driveId) return _driveId;
  const data = await graphGet(`/sites/${SITE_ID}/drives`);
  // Tomamos el primer drive (Documents)
  const drive =
    data.value.find((d) => d.name === "Documents" || d.name === "Documentos") ||
    data.value[0];
  if (!drive)
    throw new Error("[sharepoint.service] No se encontró el drive del sitio");
  _driveId = drive.id;
  return _driveId;
}

async function graphList(path) {
  const items = [];
  while (path) {
    const data = await graphGet(path);
    items.push(...(data.value || []));
    const next = data["@odata.nextLink"];
    if (next && !next.startsWith("https://graph.microsoft.com/v1.0/"))
      throw new Error("Invalid pagination");
    path = next ? next.slice("https://graph.microsoft.com/v1.0".length) : null;
  }
  return items;
}
async function engineers(drive) {
  const rows = await graphList(
    "/drives/" +
      enc(drive) +
      "/root:/Portal TI:/children?$select=id,name,folder",
  );
  return rows.filter(
    (r) =>
      r.folder &&
      Object.values(DESARROLLADORES).some(
        (name) => normal(name) === normal(r.name),
      ),
  );
}
async function collections(drive, owner) {
  return (
    await graphList(
      "/drives/" +
        enc(drive) +
        "/items/" +
        enc(owner.id) +
        "/children?$select=id,name,folder",
    )
  ).filter(
    (f) =>
      f.folder &&
      Object.keys(CARPETAS_COLECCIONES).some(
        (n) => normal(n) === normal(f.name),
      ),
  );
}
function collectionSlug(name) {
  return Object.entries(CARPETAS_COLECCIONES).find(
    ([n]) => normal(n) === normal(name),
  )?.[1];
}
function normalizarItem(item, coleccion, owner) {
  return {
    id: item.id,
    nombre: item.name,
    coleccion,
    tipo: item.file?.mimeType || "folder",
    extension: item.name.split(".").pop().toLowerCase(),
    tamano: item.size || 0,
    actualizado: item.lastModifiedDateTime,
    autor: item.lastModifiedBy?.user?.displayName || "Desconocido",
    desarrollador: owner?.name || "",
    descripcion: descriptionText(item.listItem?.fields?._ExtendedDescription),
    url: item.webUrl,
    esArchivo: !!item.file,
  };
}
async function library(drive, filter, developer) {
  const owners = (await engineers(drive)).filter(
    (o) => normal(o.name) === normal(developer),
  );
  if (owners.length !== 1)
    throw new Error("Developer folder missing or ambiguous");
  const groups = await Promise.all(
    owners.map(async (owner) => {
      const folders = await collections(drive, owner);
      let docs = [];
      for (const folder of folders) {
        const slug = collectionSlug(folder.name);
        if (filter && filter !== "todo" && slug !== filter) continue;
        const items = await graphList(
          "/drives/" +
            enc(drive) +
            "/items/" +
            enc(folder.id) +
            "/children?$select=id,name,size,lastModifiedDateTime,lastModifiedBy,webUrl,file&$expand=listItem($expand=fields($select=_ExtendedDescription))",
        );
        docs.push(
          ...items
            .filter((i) => i.file)
            .map((i) => normalizarItem(i, slug, owner)),
        );
      }
      return docs;
    }),
  );
  return groups.flat();
}
async function getDocumentos(req, res) {
  const developer =
    DESARROLLADORES[
      String(req.user?.login || "")
        .trim()
        .toUpperCase()
    ];
  if (!developer)
    return res.status(403).json({
      ok: false,
      error: "Tu usuario no tiene un repositorio de documentos configurado.",
    });
  try {
    const { coleccion, proyecto, q } = req.query;
    let todos = await library(await getDriveId(), coleccion, developer);
    if (q)
      todos = todos.filter((d) =>
        normal(d.nombre + " " + d.descripcion + " " + d.desarrollador).includes(
          normal(q),
        ),
      );
    if (proyecto)
      todos = todos.filter((d) =>
        d.nombre.toUpperCase().includes(proyecto.toUpperCase()),
      );
    const conteos = Object.fromEntries(
      Object.values(CARPETAS_COLECCIONES).map((c) => [
        c,
        todos.filter((d) => d.coleccion === c).length,
      ]),
    );
    conteos.todo = todos.length;
    res.json({ ok: true, data: todos, conteos });
  } catch {
    res.status(502).json({
      ok: false,
      error: "No se pudieron consultar los documentos de SharePoint.",
    });
  }
}
async function getColecciones(req, res) {
  const developer =
    DESARROLLADORES[
      String(req.user?.login || "")
        .trim()
        .toUpperCase()
    ];
  if (!developer)
    return res.status(403).json({
      ok: false,
      error: "Tu usuario no tiene un repositorio de documentos configurado.",
    });
  try {
    const docs = await library(await getDriveId(), null, developer);
    res.json({
      ok: true,
      data: Object.entries(CARPETAS_COLECCIONES).map(([nombre, slug]) => ({
        nombre,
        slug,
        total: docs.filter((d) => d.coleccion === slug).length,
      })),
    });
  } catch {
    res
      .status(502)
      .json({ ok: false, error: "No se pudieron consultar las colecciones." });
  }
}
async function getRecientes(req, res) {
  const developer =
    DESARROLLADORES[
      String(req.user?.login || "")
        .trim()
        .toUpperCase()
    ];
  if (!developer)
    return res.status(403).json({
      ok: false,
      error: "Tu usuario no tiene un repositorio de documentos configurado.",
    });
  try {
    const docs = await library(await getDriveId(), null, developer);
    docs.sort((a, b) => new Date(b.actualizado) - new Date(a.actualizado));
    res.json({ ok: true, data: docs.slice(0, 10) });
  } catch {
    res.status(502).json({
      ok: false,
      error: "No se pudieron consultar los documentos recientes.",
    });
  }
}

// Preview is restricted to the same collection folders exposed by the library.
async function getVistaPrevia(req, res) {
  const developer =
    DESARROLLADORES[
      String(req.user?.login || "")
        .trim()
        .toUpperCase()
    ];
  if (!developer)
    return res.status(403).json({
      ok: false,
      error: "Tu usuario no tiene un repositorio de documentos configurado.",
    });
  try {
    const id = String(req.params.id || "");
    if (!/^[a-zA-Z0-9!_-]+$/.test(id))
      return res.status(400).json({ ok: false, error: "Documento inválido." });
    const drive = await getDriveId();
    const item = await graphGet(
      "/drives/" +
        drive +
        "/items/" +
        encodeURIComponent(id) +
        "?$select=id,file,parentReference",
    );
    const parent = decodeURIComponent(item.parentReference?.path || "")
      .split("root:")
      .pop();
    const parts = parent.split("/").filter(Boolean);
    if (
      !item.file ||
      parts.length !== 3 ||
      parts[0] !== "Portal TI" ||
      normal(developer) !== normal(parts[1]) ||
      !collectionSlug(parts[2])
    )
      return res
        .status(404)
        .json({ ok: false, error: "Documento fuera de la biblioteca." });
    const token = await getAccessToken();
    const response = await fetch(
      "https://graph.microsoft.com/v1.0/drives/" +
        drive +
        "/items/" +
        encodeURIComponent(id) +
        "/preview",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok)
      return res.status(502).json({
        ok: false,
        error:
          "SharePoint no pudo generar la vista previa. Puedes abrir el archivo con el botón Abrir en SharePoint.",
      });
    const preview = await response.json();
    if (!preview.getUrl || !preview.getUrl.startsWith("https://"))
      return res.status(422).json({
        ok: false,
        error:
          "Este documento no ofrece vista previa integrada. Usa Abrir en SharePoint.",
      });
    return res.json({ ok: true, url: preview.getUrl });
  } catch {
    return res.status(502).json({
      ok: false,
      error: "No se pudo cargar la vista previa de SharePoint.",
    });
  }
}
const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const UPLOAD_EXTENSIONS = new Set(
  "pdf doc docx xls xlsx ppt pptx png jpg jpeg gif webp svg zip txt md csv json xml yaml yml sql js ts drawio vsdx".split(
    " ",
  ),
);
async function subirDocumento(req, res) {
  let uploadUrl;
  try {
    const developer =
      DESARROLLADORES[
        String(req.user?.login || "")
          .trim()
          .toUpperCase()
      ];
    if (!developer)
      return res.status(403).json({
        ok: false,
        error: "Tu usuario no tiene una carpeta de desarrollador configurada.",
      });
    const description = String(req.body?.descripcion || "").trim();
    if (description.length > 2000)
      return res.status(400).json({
        ok: false,
        error: "La descripción admite hasta 2,000 caracteres.",
      });
    const folder = Object.entries(CARPETAS_COLECCIONES).find(
      ([, slug]) => slug === req.body?.coleccion,
    );
    if (!folder)
      return res
        .status(400)
        .json({ ok: false, error: "Selecciona una colección válida." });
    const file = req.file;
    if (!file?.buffer?.length)
      return res
        .status(400)
        .json({ ok: false, error: "Selecciona un archivo que no esté vacío." });
    if (file.buffer.length > UPLOAD_MAX_BYTES)
      return res
        .status(413)
        .json({ ok: false, error: "El archivo supera el límite de 20 MB." });
    const name = decodeURIComponent(String(file.originalname || "")).normalize(
      "NFC",
    );
    if (
      !name ||
      name.length > 180 ||
      /[\\/:*?"<>|\x00-\x1f]/.test(name) ||
      /[. ]$/.test(name) ||
      name.startsWith("~$")
    )
      return res.status(400).json({
        ok: false,
        error: "El nombre del archivo no es válido para SharePoint.",
      });
    if (!UPLOAD_EXTENSIONS.has(name.split(".").pop().toLowerCase()))
      return res.status(400).json({
        ok: false,
        error:
          "Formato no admitido. Usa documentos, imágenes, archivos de texto o ZIP.",
      });
    const drive = await getDriveId(),
      token = await getAccessToken();
    const matches = (await engineers(drive)).filter(
      (o) => normal(o.name) === normal(developer),
    );
    if (matches.length !== 1)
      return res.status(409).json({
        ok: false,
        error:
          "No se encontró una carpeta única para tu usuario en Portal TI. Contacta al administrador.",
      });
    const owner = matches[0],
      destinations = (await collections(drive, owner)).filter(
        (f) => collectionSlug(f.name) === folder[1],
      );
    if (destinations.length !== 1)
      return res.status(409).json({
        ok: false,
        error:
          "La subcarpeta seleccionada no existe o está duplicada en tu carpeta de SharePoint.",
      });
    const parent = destinations[0];
    if (!parent.folder)
      return res.status(400).json({
        ok: false,
        error: "La colección no corresponde a una carpeta de SharePoint.",
      });
    const session = await fetch(
      "https://graph.microsoft.com/v1.0/drives/" +
        drive +
        "/items/" +
        encodeURIComponent(parent.id) +
        ":/" +
        encodeURIComponent(name) +
        ":/createUploadSession",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          item: { "@microsoft.graph.conflictBehavior": "fail", name },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!session.ok) return uploadError(res, session.status);
    const data = await session.json();
    uploadUrl = data.uploadUrl;
    if (!uploadUrl?.startsWith("https://"))
      throw new Error("Invalid upload session");
    // Session URL is preauthenticated; never forward the Graph access token to it.
    const result = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(file.buffer.length),
        "Content-Range":
          "bytes 0-" + (file.buffer.length - 1) + "/" + file.buffer.length,
      },
      body: file.buffer,
      signal: AbortSignal.timeout(120000),
    });
    if (!result.ok) {
      await cancelUpload(uploadUrl);
      uploadUrl = null;
      return uploadError(res, result.status);
    }
    if (![200, 201].includes(result.status))
      throw new Error("Upload not committed");
    const item = await result.json();
    if (!item.id || !item.file) throw new Error("Invalid uploaded item");
    uploadUrl = null;
    let warning = "";
    if (description) {
      try {
        const list = await graphGet(
          "/drives/" + enc(drive) + "/list?$select=id",
        );
        const linked = await graphGet(
          "/drives/" +
            enc(drive) +
            "/items/" +
            enc(item.id) +
            "/listItem?$select=id",
        );
        const safe = description
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        const saved = await fetch(
          "https://graph.microsoft.com/v1.0/sites/" +
            enc(SITE_ID) +
            "/lists/" +
            enc(list.id) +
            "/items/" +
            enc(linked.id) +
            "/fields",
          {
            method: "PATCH",
            headers: {
              Authorization: "Bearer " + token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ _ExtendedDescription: safe }),
            signal: AbortSignal.timeout(30000),
          },
        );
        if (!saved.ok) throw new Error("Description not saved");
        item.listItem = { fields: { _ExtendedDescription: safe } };
      } catch {
        warning =
          "El archivo se guardó, pero no se pudo guardar su descripción. Complétala desde SharePoint; no vuelvas a subir el archivo.";
      }
    }
    return res.status(201).json({
      ok: true,
      data: normalizarItem(item, folder[1], owner),
      destino: "Portal TI / " + owner.name + " / " + parent.name,
      warning,
    });
  } catch {
    if (uploadUrl) await cancelUpload(uploadUrl);
    return res.status(502).json({
      ok: false,
      error:
        "No se pudo confirmar la carga. Actualiza la biblioteca antes de reintentar para comprobar si el archivo llegó a SharePoint.",
    });
  }
}
async function cancelUpload(url) {
  try {
    await fetch(url, { method: "DELETE", signal: AbortSignal.timeout(5000) });
  } catch {}
}
function uploadError(res, status) {
  return res
    .status(status === 409 || status === 412 ? 409 : status === 403 ? 403 : 502)
    .json({
      ok: false,
      error:
        status === 409 || status === 412
          ? "Ya existe un archivo con ese nombre. Cámbiale el nombre antes de subirlo."
          : status === 403
            ? "SharePoint rechazó la carga. Verifica los permisos de escritura de la aplicación."
            : "SharePoint no pudo completar la carga. Intenta nuevamente.",
    });
}
module.exports = {
  getDocumentos,
  getColecciones,
  getRecientes,
  getVistaPrevia,
  subirDocumento,
  UPLOAD_MAX_BYTES,
  getAccessToken, // token de Graph compartido (lo usa también el módulo SIT)
};
