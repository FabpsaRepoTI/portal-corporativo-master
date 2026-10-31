// pages/sit/ArticulosPage.jsx
// Lista de artículos del SIT, leídos del ERP de IAFSA y FDNC, con
// búsqueda, filtro por empresa (idPlanta) y, desde el dashboard, por estado
// de sus documentos (?estadoDoc=VERDE|AMARILLO|ROJO|SIN_FECHA|SIN_VALIDAR).
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import EmpresaBadge from "./components/EmpresaBadge";
import SitHero from "./components/SitHero";
import SitPaginador, { usePaginacion } from "./components/SitPaginador";
import { sitApi, rutaArticulo } from "./sitApi";
import "./sit.css";
import "./SitNube.css";
import "./ArticulosPage.css";

const FILTROS = [
  { id: "", label: "Todas" },
  { id: "1", label: "IAFSA" },
  { id: "2", label: "FDNC" },
];

export const ESTADOS_DOC = {
  VERDE: "con documentos vigentes",
  AMARILLO: "con documentos por vencer",
  ROJO: "con documentos vencidos",
  SIN_FECHA: "con documentos sin fecha",
  SIN_VALIDAR: "con documentos sin validar por Calidad",
};

export default function ArticulosPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const estadoDoc = ESTADOS_DOC[searchParams.get("estadoDoc")] ? searchParams.get("estadoDoc") : "";
  const [busqueda, setBusqueda] = useState("");
  const [planta, setPlanta] = useState("");
  const [articulos, setArticulos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const pag = usePaginacion(articulos, `${busqueda}|${planta}|${estadoDoc}`);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (planta) params.set("idPlanta", planta);
      if (busqueda.trim()) params.set("busqueda", busqueda.trim());
      if (estadoDoc) params.set("estadoDoc", estadoDoc);
      sitApi(`/articulos?${params}`)
        .then((d) => vivo && setArticulos(d || []))
        .catch((e) => vivo && setError(e))
        .finally(() => vivo && setCargando(false));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [busqueda, planta, estadoDoc, recarga]);

  return (
    <main className="sit-root sit-nube">
      <SitHero
        eyebrow="Sistema de Información Técnica"
        titulo="Catálogo de"
        resalte="Artículos"
        sub="Catálogo del ERP · IAFSA y FDNC"
        volver={{ to: "/sit", label: "Volver al SIT" }}
      />

      {estadoDoc && (
        <p className="sit-art__estado">
          Mostrando artículos {ESTADOS_DOC[estadoDoc]}
          <button type="button" className="sit-dash__chip" onClick={() => setSearchParams({})} title="Quitar filtro">
            Quitar filtro <i className="ti ti-x" />
          </button>
        </p>
      )}

      <div className="sit-art__filtros">
        <div className="sit-art__buscar">
          <i className="ti ti-search" />
          <input className="sit-input" placeholder="Buscar por código o descripción…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar artículo" />
        </div>
        <div className="sit-art__tabs" role="tablist" aria-label="Planta">
          {FILTROS.map((f) => (
            <button key={f.id || "todas"} role="tab" aria-selected={planta === f.id} className={`sit-art__tab${planta === f.id ? " is-active" : ""}`} onClick={() => setPlanta(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="sit-state sit-state--error">
          <i className={`ti ${error.status === 403 ? "ti-lock" : "ti-alert-circle"}`} />
          <h3>{error.status === 403 ? "Sin acceso" : "No se pudieron cargar los artículos"}</h3>
          <p>{error.message}</p>
          {error.status !== 403 && (
            <button className="sit-btn" onClick={() => setRecarga((n) => n + 1)}>
              Reintentar
            </button>
          )}
        </div>
      ) : cargando && !articulos ? (
        <div className="sit-state">
          <i className="ti ti-loader-2 sit-spin" />
          <p>Cargando artículos…</p>
        </div>
      ) : !articulos?.length ? (
        <div className="sit-state">
          <i className="ti ti-package-off" />
          <h3>Sin artículos</h3>
          <p>{busqueda || planta ? "No hay resultados con esos filtros." : "El ERP no devolvió artículos activos."}</p>
        </div>
      ) : (
        <div className={`sit-table-wrap${cargando ? " sit-art__recargando" : ""}`}>
          <table className="sit-table">
            <thead>
              <tr>
                <th className="sit-col-fit">Código</th>
                <th className="sit-col-fit">Empresa</th>
                <th className="sit-art__col-desc">Descripción</th>
                <th className="sit-art__col-tipo">Tipo</th>
                <th className="sit-col-fit sit-col-acciones">Acciones</th>
              </tr>
            </thead>
            <tbody key={`${planta}-${pag.pagina}-${pag.porPagina}`} className="sit-fade">
              {pag.visibles.map((a) => (
                // El código se repite entre empresas: la llave combina ambos
                <tr key={`${a.empresa}-${a.codigoArticulo}`}>
                  <td className="sit-col-fit">
                    <strong>{a.codigoArticulo}</strong>
                  </td>
                  <td className="sit-col-fit">
                    <EmpresaBadge empresa={a.empresa} />
                  </td>
                  <td className="sit-col-texto sit-art__col-desc">
                    {a.descripcion}
                    {a.familia && <small>{a.familia}</small>}
                  </td>
                  <td className="sit-art__col-tipo">
                    {a.tipoMaterial || "—"}
                    {a.tipo && a.tipo !== "NULL" && <small>{a.tipo}</small>}
                  </td>
                  <td className="sit-col-fit sit-col-acciones">
                    <button className="sit-btn sit-btn--sm" onClick={() => navigate(rutaArticulo(a))}>
                      <i className="ti ti-eye" /> Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <SitPaginador {...pag} />
        </div>
      )}
    </main>
  );
}
