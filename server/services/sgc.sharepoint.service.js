// server/services/sgc.sharepoint.service.js
// Toda la comunicación con SharePoint vive aquí.
// Usa OAuth2 client_credentials → Microsoft Graph API v1.0 via axios.
// El token se cachea en memoria y se renueva automáticamente antes de expirar.
// El usuario NUNCA ve URLs de SharePoint; este servicio actúa como proxy.
const axios = require("axios");
const path = require("path");

const {
  SP_TENANT_ID,
  SP_CLIENT_ID,
  SP_CLIENT_SECRET,
} = process.env;
// La biblioteca del SGC vive en su propio sitio (/sites/SGC → "Documentos compartidos"),
// no en el sitio de TI que usa el resto del portal (SP_SITE_ID / SP_DRIVE_ID).
const SP_SITE_ID = process.env.SGC_SP_SITE_ID || process.env.SP_SITE_ID;
const SP_DRIVE_ID = process.env.SGC_SP_DRIVE_ID || process.env.SP_DRIVE_ID;
const ruta = (p) => String(p).split("/").map(encodeURIComponent).join("/");

// ── Token cache ──────────────────────────────────────────────────────
let _tokenCache = null; // { access_token, expiresAt }

async function getAccessToken() {
  const ahora = Date.now();
  if (_tokenCache && _tokenCache.expiresAt - ahora > 60_000) {
    return _tokenCache.access_token;
  }
  const params = new URLSearchParams({
    client_id: SP_CLIENT_ID,
    client_secret: SP_CLIENT_SECRET,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  const { data } = await axios.post(
    `https://login.microsoftonline.com/${SP_TENANT_ID}/oauth2/v2.0/token`,
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );
  _tokenCache = {
    access_token: data.access_token,
    expiresAt: ahora + data.expires_in * 1000,
  };
  return _tokenCache.access_token;
}

function _headers(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const BASE = `https://graph.microsoft.com/v1.0/sites/${SP_SITE_ID}/drives/${SP_DRIVE_ID}`;

// ── Listar archivos de una carpeta (o raíz) ──────────────────────────
async function listarArchivos(carpeta = null) {
  const token = await getAccessToken();
  const url = carpeta
    ? `${BASE}/root:/${ruta(carpeta)}:/children`
    : `${BASE}/root/children`;
  const { data } = await axios.get(url, {
    headers: _headers(token),
    params: { $select: "id,name,webUrl,lastModifiedDateTime,size,folder,parentReference" },
  });
  return (data.value || []).map((i) => ({
    id: i.id,
    nombre: i.name,
    webUrl: i.webUrl,
    modificado: i.lastModifiedDateTime,
    tamano: i.size || 0,
    esCarpeta: !!i.folder,
    carpetaPath: carpeta || "",
  }));
}

// ── Árbol de carpetas del drive ──────────────────────────────────────
async function listarCarpetas(carpeta = null, profundidad = 0) {
  if (profundidad > 4) return [];
  const items = await listarArchivos(carpeta);
  const carpetas = [];
  for (const item of items) {
    if (!item.esCarpeta) continue;
    const rutaHija = carpeta ? `${carpeta}/${item.nombre}` : item.nombre;
    const hijas = await listarCarpetas(rutaHija, profundidad + 1);
    carpetas.push({ id: item.id, nombre: item.nombre, ruta: rutaHija, hijas });
  }
  return carpetas;
}

// ── Descargar archivo (stream) ───────────────────────────────────────
async function descargarArchivo(spItemId) {
  const token = await getAccessToken();
  const response = await axios.get(
    `${BASE}/items/${spItemId}/content`,
    { headers: { Authorization: `Bearer ${token}` }, responseType: "stream" },
  );
  return response; // .data es el stream; .headers["content-type"] y content-disposition
}

// ── Vista previa incrustable (URL temporal de SharePoint) ────────────
async function vistaPrevia(spItemId) {
  const token = await getAccessToken();
  const { data } = await axios.post(`${BASE}/items/${encodeURIComponent(spItemId)}/preview`, {}, { headers: _headers(token) });
  return data.getUrl || null;
}

async function nombreItem(spItemId) {
  const token = await getAccessToken();
  const { data } = await axios.get(`${BASE}/items/${encodeURIComponent(spItemId)}`, { headers: _headers(token), params: { $select: "name,file" } });
  return data.file ? data.name : null;
}

// ── Subir nueva versión a un item existente ──────────────────────────
async function subirArchivo(spItemId, fileBuffer, filename) {
  const token = await getAccessToken();
  const ct = _contentType(filename);
  const { data } = await axios.put(
    `${BASE}/items/${spItemId}/content`,
    fileBuffer,
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": ct } },
  );
  return data; // item actualizado de SP
}

// ── Subir archivo nuevo a una carpeta ───────────────────────────────
async function subirArchivoNuevo(carpeta, filename, fileBuffer) {
  const token = await getAccessToken();
  const ct = _contentType(filename);
  const destino = carpeta ? `${carpeta}/${filename}` : filename;
  const { data } = await axios.put(
    `${BASE}/root:/${ruta(destino)}:/content`,
    fileBuffer,
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": ct } },
  );
  return data; // { id, name, webUrl, ... }
}

// ── Obtener versiones de un item ─────────────────────────────────────
async function obtenerVersiones(spItemId) {
  const token = await getAccessToken();
  const { data } = await axios.get(
    `${BASE}/items/${spItemId}/versions`,
    { headers: _headers(token), params: { $select: "id,lastModifiedDateTime,size" } },
  );
  return data.value || [];
}

// ── Obtener metadatos de un item ─────────────────────────────────────
async function obtenerMetadatosItem(spItemId) {
  const token = await getAccessToken();
  const { data } = await axios.get(
    `${BASE}/items/${spItemId}`,
    {
      headers: _headers(token),
      params: { $select: "id,name,webUrl,lastModifiedDateTime,size,parentReference,file" },
    },
  );
  return {
    id: data.id,
    nombre: data.name,
    webUrl: data.webUrl,
    modificado: data.lastModifiedDateTime,
    tamano: data.size,
    driveId: data.parentReference?.driveId || SP_DRIVE_ID,
    carpetaPath: data.parentReference?.path || null,
  };
}

function _contentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mapa = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  };
  return mapa[ext] || "application/octet-stream";
}

module.exports = {
  vistaPrevia,
  nombreItem,
  getAccessToken,
  listarArchivos,
  listarCarpetas,
  descargarArchivo,
  subirArchivo,
  subirArchivoNuevo,
  obtenerVersiones,
  obtenerMetadatosItem,
};
