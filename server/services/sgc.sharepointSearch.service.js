// server/services/sgc.sharepointSearch.service.js
// Búsqueda en la biblioteca documental del SGC (SharePoint /sites/SGC).
// Usa la búsqueda del drive (funciona con permisos de aplicación, a diferencia
// de /search/query que exige región). Nunca devuelve URLs de SharePoint: el
// frontend abre y descarga los archivos por el proxy /api/sgc/documentos/sp/:id.
const axios = require("axios");
const SP = require("./sgc.sharepoint.service");

const MAX_RESULTADOS = 8;
const DRIVE = () => process.env.SGC_SP_DRIVE_ID || process.env.SP_DRIVE_ID;
const GRAPH = "https://graph.microsoft.com/v1.0";

const _normal = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// "/drives/b!.../root:/Recursos Humanos/TI" → "Recursos Humanos/TI"
function _carpeta(parentPath) {
  const i = String(parentPath || "").indexOf("root:");
  return i < 0 ? "" : decodeURIComponent(parentPath.slice(i + 5)).replace(/^\/+/, "");
}

/**
 * searchDocuments(query, folder?) → [{ driveItemId, nombre, carpeta, extension, tamano, fechaModificacion, driveId }]
 * Solo archivos (no carpetas). `folder` filtra por ruta, sin distinguir acentos ni mayúsculas.
 */
async function searchDocuments(query, folder = null) {
  const q = String(query || "").trim().slice(0, 120);
  if (!q) return [];
  const token = await SP.getAccessToken();
  const headers = { Authorization: `Bearer ${token}` };
  const { data } = await axios.get(`${GRAPH}/drives/${DRIVE()}/root/search(q='${encodeURIComponent(q.replace(/'/g, "''"))}')`, {
    headers,
    params: { $select: "id,name,file,size,lastModifiedDateTime", $top: 40 },
  });
  const archivos = (data.value || []).filter((i) => i.file);

  // La búsqueda no trae la ruta: se pide por archivo (en paralelo, pocos)
  const conRuta = await Promise.all(
    archivos.slice(0, folder ? 40 : MAX_RESULTADOS * 2).map(async (i) => {
      const r = await axios
        .get(`${GRAPH}/drives/${DRIVE()}/items/${i.id}`, { headers, params: { $select: "id,parentReference" } })
        .catch(() => null);
      return { ...i, carpeta: _carpeta(r?.data?.parentReference?.path) };
    }),
  );

  const filtro = folder ? _normal(folder) : null;
  return conRuta
    .filter((i) => !filtro || _normal(i.carpeta).includes(filtro))
    .slice(0, MAX_RESULTADOS)
    .map((i) => ({
      driveItemId: i.id,
      nombre: i.name,
      carpeta: i.carpeta,
      extension: (i.name.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase(),
      tamano: i.size ?? null,
      fechaModificacion: i.lastModifiedDateTime || null,
      driveId: DRIVE(),
    }));
}

/** Stream del archivo para hacer pipe al response (no se descarga completo en memoria). */
async function getFileDownloadStream(driveItemId) {
  return SP.descargarArchivo(driveItemId);
}

/** URL temporal incrustable de SharePoint (solo para el visor de Gestión documental). */
async function getFilePreviewUrl(driveItemId) {
  return SP.vistaPrevia(driveItemId);
}

module.exports = { searchDocuments, getFileDownloadStream, getFilePreviewUrl, MAX_RESULTADOS };
