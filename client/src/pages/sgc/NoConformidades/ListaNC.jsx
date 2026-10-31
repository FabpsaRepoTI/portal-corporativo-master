// pages/sgc/NoConformidades/ListaNC.jsx
// Registro de No Conformidades: tarjetas por estatus (también filtran), barra de
// filtros y tabla compacta. Los filtros viven en la URL (enlaces desde el centro de control).
import { useCallback, useEffect, useState } from "react";
import PanelLateral, { PanelSplit, RUTA_COMPLETA } from "../../../components/sgc/PanelLateral";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { Dias, Encabezado, ErrorCarga, Paginador, Pastilla, Persona, SelectUsuario, Skel, TarjetasEstado, Vacio, exportarCSV, useMigas, useToast } from "../components/ui";
import { sgcApi, useSgc, catalogos, procesos as cargarProcesos, fechaCorta, NC_ESTATUS } from "../sgcApi";

const LIMITE = 20;
const FILTROS = ["estatus", "origen", "clasificacion", "responsable", "proceso", "fechaDesde", "fechaHasta", "q", "vencidas"];
const ICONOS = { 1: "ti-alert-circle", 2: "ti-search", 3: "ti-player-play", 4: "ti-eye-check", 5: "ti-circle-check", 6: "ti-ban" };

export default function ListaNC() {
  const navigate = useNavigate();
  const toast = useToast();
  const { rol } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const [cat, setCat] = useState(null);
  const [procs, setProcs] = useState([]);
  const [exportando, setExportando] = useState(false);
  const [sel, setSel] = useState(null); // { id, folio } en el panel lateral
  const cerrarPanel = useCallback(() => setSel(null), []);
  const f = Object.fromEntries(FILTROS.map((k) => [k, params.get(k) || ""]));
  const page = Math.max(1, parseInt(params.get("page"), 10) || 1);
  const [texto, setTexto] = useState(f.q);
  useMigas([{ label: "No conformidades" }]);

  useEffect(() => {
    catalogos().then(setCat).catch(() => {});
    cargarProcesos().then(setProcs).catch(() => {});
  }, []);

  const setFiltro = (cambios) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === "" || v === false || v == null) p.delete(k);
      else p.set(k, v === true ? "1" : String(v));
    }
    if (!("page" in cambios)) p.delete("page");
    setParams(p, { replace: true });
  };

  useEffect(() => {
    if (texto === f.q) return undefined;
    const t = setTimeout(() => setFiltro({ q: texto.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [texto]);
  useEffect(() => setTexto(f.q), [f.q]);

  const filtrosConsulta = () => {
    const c = new URLSearchParams();
    for (const k of FILTROS) if (f[k] && !(k === "responsable" && rol === 3)) c.set(k, f[k]);
    return c;
  };
  const consulta = filtrosConsulta();
  consulta.set("page", page);
  consulta.set("limit", LIMITE);
  const { data, error, cargando, recargar } = useSgc(() => sgcApi(`/nc?${consulta}`), [consulta.toString()]);

  const estatusSel = /^\d$/.test(f.estatus) ? Number(f.estatus) : f.estatus === "abiertas" ? [1, 2, 3, 4] : null;
  const tarjetas = (data?.porEstatus || [])
    .filter((e) => e.idEstatus !== 6 || e.total > 0)
    .map((e) => ({ id: e.idEstatus, label: e.label, total: e.total, vencidas: e.vencidas, tono: NC_ESTATUS[e.idEstatus].tono, icono: ICONOS[e.idEstatus] }));

  const chips = [
    f.vencidas === "1" && { k: "vencidas", label: "Solo vencidas" },
    f.estatus === "abiertas" && { k: "estatus", label: "Solo abiertas" },
    f.proceso && { k: "proceso", label: `Proceso: ${procs.find((p) => String(p.idProceso) === f.proceso)?.nombre || f.proceso}` },
    f.fechaHasta && { k: "fechaHasta", label: `Hasta ${fechaCorta(f.fechaHasta)}` },
  ].filter(Boolean);

  const hayFiltros = FILTROS.some((k) => f[k]);
  const puedeCrear = rol === 1 || rol === 3;

  const exportar = async () => {
    try {
      setExportando(true);
      const c = filtrosConsulta();
      c.set("page", 1);
      c.set("limit", 1000);
      const r = await sgcApi(`/nc?${c}`);
      exportarCSV(
        "no-conformidades",
        ["Folio", "No conformidad", "Origen", "Clasificación", "Responsable", "Estado", "Detectada", "Compromiso", "Días", "ACs"],
        r.items.map((n) => [n.folio, n.descripcion, n.origen, n.clasificacion, n.responsable || n.loginResponsable, NC_ESTATUS[n.idEstatus]?.label, String(n.fechaDeteccion || "").slice(0, 10), String(n.fechaCompromiso || "").slice(0, 10), n.diasRestantes ?? "", n.numAC || 0]),
      );
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="sg-page lst-page">
      <Encabezado
        kicker={<>No conformidades <i className="ti ti-chevron-right" /> Registro y seguimiento</>}
        titulo="No conformidades"
        cuenta={data ? data.total : null}
        desc={rol === 3 ? "Las no conformidades a tu cargo." : "Registro, análisis y seguimiento hasta el cierre eficaz."}
        acciones={
          <>
            <button className="btn" onClick={exportar} disabled={exportando || !data?.total}>
              <i className="ti ti-download" /> Exportar
            </button>
            {puedeCrear && (
              <button className="btn btn--primario" onClick={() => navigate("/sgc/no-conformidades/nueva")}>
                <i className="ti ti-plus" /> Nueva NC
              </button>
            )}
          </>
        }
      />

      {data && <TarjetasEstado items={tarjetas} sel={estatusSel} onSel={(id) => setFiltro({ estatus: id ?? "" })} />}

      <div className="lst-filtros" aria-label="Filtros">
        <div className="lst-buscar">
          <i className="ti ti-search" />
          <input className="inp" placeholder="Buscar por folio o descripción…" value={texto} maxLength={100} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar" />
        </div>
        <select className="inp" value={f.origen} onChange={(e) => setFiltro({ origen: e.target.value })} aria-label="Origen">
          <option value="">Todos los orígenes</option>
          {cat?.origenes.map((o) => <option key={o.idOrigen} value={o.idOrigen}>{o.nombre}</option>)}
        </select>
        <select className="inp" value={f.clasificacion} onChange={(e) => setFiltro({ clasificacion: e.target.value })} aria-label="Clasificación">
          <option value="">Todas las clasificaciones</option>
          {cat?.clasificaciones.map((c) => <option key={c.idClasificacion} value={c.idClasificacion}>{c.nombre}</option>)}
        </select>
        {rol !== 3 && <SelectUsuario value={f.responsable} onChange={(l) => setFiltro({ responsable: l })} placeholder="Cualquier responsable" />}
        <input type="date" className="inp" value={f.fechaDesde} onChange={(e) => setFiltro({ fechaDesde: e.target.value })} aria-label="Detectada desde" title="Detectada desde" />
      </div>

      {chips.length > 0 && (
        <div className="activos">
          Filtrando por
          {chips.map((c) => (
            <span key={c.k} className="chip">
              {c.label}
              <button type="button" aria-label={`Quitar ${c.label}`} onClick={() => setFiltro({ [c.k]: "" })}>
                <i className="ti ti-x" />
              </button>
            </span>
          ))}
          <button type="button" className="btn btn--fantasma btn--sm" onClick={() => { setTexto(""); setParams(new URLSearchParams(), { replace: true }); }}>
            Limpiar todo
          </button>
        </div>
      )}

      <PanelSplit
        abierto={!!sel}
        onClose={cerrarPanel}
        panel={sel && <PanelLateral registro={sel} modulo="nc" onClose={cerrarPanel} onAbrirCompleto={(m, id) => navigate(RUTA_COMPLETA[m](id))} />}
      >
      <section className="pnl lst-tabla">
        {error && !data ? (
          <ErrorCarga error={error} onReintentar={recargar} />
        ) : !data ? (
          <Skel filas={10} />
        ) : !data.items.length ? (
          <Vacio
            icono={hayFiltros ? "ti-filter-off" : "ti-mood-check"}
            titulo={hayFiltros ? "Ninguna coincide" : "Sin no conformidades"}
            texto={hayFiltros ? "Ajusta o limpia los filtros para ver más resultados." : "Aún no se ha registrado ninguna no conformidad."}
            accion={puedeCrear && !hayFiltros ? (
              <button className="btn btn--primario" onClick={() => navigate("/sgc/no-conformidades/nueva")}>
                <i className="ti ti-plus" /> Registrar la primera
              </button>
            ) : null}
          />
        ) : (
          <div className={cargando ? "recargando" : undefined}>
            <div className="tabla-wrap">
              <table className="tabla lst-t">
                <thead>
                  <tr>
                    <th className="fit">Folio</th>
                    <th>No conformidad</th>
                    <th>Responsable</th>
                    <th className="fit">Estado</th>
                    <th className="fit">Compromiso</th>
                    <th className="fit">Días</th>
                    <th className="fit der">ACs</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((n) => {
                    const cerrada = [5, 6].includes(n.idEstatus);
                    const e = NC_ESTATUS[n.idEstatus];
                    return (
                      <tr key={n.idNC} className={`link${sel?.id === n.idNC ? " is-sel" : ""}`} tabIndex={0} onClick={() => setSel({ id: n.idNC, folio: n.folio })} onKeyDown={(ev) => ev.key === "Enter" && setSel({ id: n.idNC, folio: n.folio })}>
                        <td className="fit lst-folio">{n.folio}</td>
                        <td>
                          <span className="celda-titulo">{n.descripcion}</span>
                          <span className="celda-sub">{n.origen} · {n.clasificacion}</span>
                        </td>
                        <td><Persona nombre={n.responsable} login={n.loginResponsable} /></td>
                        <td className="fit"><Pastilla tono={e.tono}>{e.label}</Pastilla></td>
                        <td className={`fit lst-fecha${!cerrada && n.esVencida ? " t-danger tinta" : ""}`}>{fechaCorta(n.fechaCompromiso, false)}</td>
                        <td className="fit"><Dias dias={n.diasRestantes} cerrada={cerrada} /></td>
                        <td className="fit der num">{n.numAC || <span className="muted">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Paginador page={data.page} limit={data.limit} total={data.total} onPage={(p) => setFiltro({ page: p })} />
          </div>
        )}
      </section>
      </PanelSplit>
    </div>
  );
}
