// pages/sgc/AccionesCorrectivas/ListaAC.jsx
// Acciones correctivas: tarjetas por estatus (también filtran), barra de filtros
// y tabla con avance real del plan (actividades completadas / total).
import { useCallback, useEffect, useState } from "react";
import PanelLateral, { PanelSplit, RUTA_COMPLETA } from "../../../components/sgc/PanelLateral";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { Avance, Dias, Encabezado, ErrorCarga, Paginador, Pastilla, Persona, SelectUsuario, Skel, TarjetasEstado, Vacio, exportarCSV, useMigas, useToast } from "../components/ui";
import { sgcApi, useSgc, fechaCorta, AC_ESTATUS } from "../sgcApi";

const LIMITE = 20;
const FILTROS = ["estatus", "responsable", "ncOrigen", "q", "vencidas"];
const ICONOS = { 1: "ti-alert-circle", 2: "ti-player-play", 3: "ti-eye-check", 4: "ti-rosette-discount-check", 5: "ti-circle-check" };

export default function ListaAC() {
  const navigate = useNavigate();
  const toast = useToast();
  const { rol } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const [exportando, setExportando] = useState(false);
  const [sel, setSel] = useState(null); // { id, folio } en el panel lateral
  const cerrarPanel = useCallback(() => setSel(null), []);
  const f = Object.fromEntries(FILTROS.map((k) => [k, params.get(k) || ""]));
  const page = Math.max(1, parseInt(params.get("page"), 10) || 1);
  const [texto, setTexto] = useState(f.q);
  const [folioNC, setFolioNC] = useState(f.ncOrigen === "ninguna" ? "" : f.ncOrigen);
  useMigas([{ label: "Acciones correctivas" }]);

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
    const nc = f.ncOrigen === "ninguna" ? "" : f.ncOrigen;
    if (texto === f.q && folioNC === nc) return undefined;
    const t = setTimeout(() => setFiltro({ q: texto.trim(), ...(f.ncOrigen === "ninguna" && !folioNC ? {} : { ncOrigen: folioNC.trim() }) }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [texto, folioNC]);
  useEffect(() => {
    setTexto(f.q);
    setFolioNC(f.ncOrigen === "ninguna" ? "" : f.ncOrigen);
  }, [f.q, f.ncOrigen]);

  const filtrosConsulta = () => {
    const c = new URLSearchParams();
    for (const k of FILTROS) if (f[k]) c.set(k, f[k]);
    return c;
  };
  const consulta = filtrosConsulta();
  consulta.set("page", page);
  consulta.set("limit", LIMITE);
  const { data, error, cargando, recargar } = useSgc(() => sgcApi(`/ac?${consulta}`), [consulta.toString()]);

  const estatusSel = /^\d$/.test(f.estatus) ? Number(f.estatus) : f.estatus === "abiertas" ? [1, 2, 3] : null;
  const tarjetas = (data?.porEstatus || []).map((e) => ({ id: e.idEstatus, label: e.label, total: e.total, vencidas: e.vencidas, tono: AC_ESTATUS[e.idEstatus].tono, icono: ICONOS[e.idEstatus] }));
  const chips = [f.estatus === "abiertas" && { k: "estatus", label: "Solo en curso" }].filter(Boolean);
  const hayFiltros = FILTROS.some((k) => f[k]);
  const puedeCrear = rol !== 4;

  const exportar = async () => {
    try {
      setExportando(true);
      const c = filtrosConsulta();
      c.set("page", 1);
      c.set("limit", 1000);
      const r = await sgcApi(`/ac?${c}`);
      exportarCSV(
        "acciones-correctivas",
        ["Folio", "Acción correctiva", "NC origen", "Responsable", "Avance %", "Estado", "Compromiso", "Días"],
        r.items.map((a) => [a.folio, a.titulo, a.folioNC || "Independiente", a.responsable || a.loginResponsable, Math.round(a.avance || 0), AC_ESTATUS[a.idEstatus]?.label, String(a.fechaCompromiso || "").slice(0, 10), a.diasRestantes ?? ""]),
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
        kicker={<>Acciones correctivas <i className="ti ti-chevron-right" /> Seguimiento</>}
        titulo="Acciones correctivas"
        cuenta={data ? data.total : null}
        desc="Planes de acción, responsables, avances y evidencias."
        acciones={
          <>
            <button className="btn" onClick={exportar} disabled={exportando || !data?.total}>
              <i className="ti ti-download" /> Exportar
            </button>
            {puedeCrear && (
              <button className="btn btn--primario" onClick={() => navigate("/sgc/acciones-correctivas/nueva")}>
                <i className="ti ti-plus" /> Nueva AC
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
        <select
          className="inp"
          value={f.ncOrigen === "ninguna" ? "ninguna" : ""}
          onChange={(e) => { setFolioNC(""); setFiltro({ ncOrigen: e.target.value }); }}
          aria-label="Relación con NC"
        >
          <option value="">Todas las NC</option>
          <option value="ninguna">Sin NC de origen</option>
        </select>
        <input className="inp mono" placeholder="Folio NC: NC-2026-…" value={folioNC} maxLength={30} onChange={(e) => setFolioNC(e.target.value)} aria-label="Folio de NC origen" />
        <SelectUsuario value={f.responsable} onChange={(l) => setFiltro({ responsable: l })} placeholder="Cualquier responsable" />
        <select className="inp" value={f.vencidas} onChange={(e) => setFiltro({ vencidas: e.target.value })} aria-label="Vencimiento">
          <option value="">Cualquier vencimiento</option>
          <option value="1">Solo atrasadas</option>
        </select>
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
        </div>
      )}

      <PanelSplit
        abierto={!!sel}
        onClose={cerrarPanel}
        panel={sel && <PanelLateral registro={sel} modulo="ac" onClose={cerrarPanel} onAbrirCompleto={(m, id) => navigate(RUTA_COMPLETA[m](id))} />}
      >
      <section className="pnl lst-tabla">
        {error && !data ? (
          <ErrorCarga error={error} onReintentar={recargar} />
        ) : !data ? (
          <Skel filas={10} />
        ) : !data.items.length ? (
          <Vacio
            icono={hayFiltros ? "ti-filter-off" : "ti-checklist"}
            titulo={hayFiltros ? "Ninguna coincide" : "Sin acciones correctivas"}
            texto={hayFiltros ? "Ajusta o limpia los filtros para ver más resultados." : "Las acciones que se definan para las no conformidades aparecerán aquí."}
          />
        ) : (
          <div className={cargando ? "recargando" : undefined}>
            <div className="tabla-wrap">
              <table className="tabla lst-t">
                <thead>
                  <tr>
                    <th className="fit">Folio</th>
                    <th>Acción correctiva</th>
                    <th className="fit">NC origen</th>
                    <th>Responsable</th>
                    <th style={{ width: 150 }}>Avance</th>
                    <th className="fit">Estado</th>
                    <th className="fit">Compromiso</th>
                    <th className="fit">Días</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((a) => {
                    const cerrada = a.idEstatus >= 4;
                    const e = AC_ESTATUS[a.idEstatus];
                    return (
                      <tr key={a.idAC} className={`link${sel?.id === a.idAC ? " is-sel" : ""}`} tabIndex={0} onClick={() => setSel({ id: a.idAC, folio: a.folio })} onKeyDown={(ev) => ev.key === "Enter" && setSel({ id: a.idAC, folio: a.folio })}>
                        <td className="fit lst-folio">{a.folio}</td>
                        <td>
                          <span className="celda-titulo">{a.titulo || "—"}</span>
                          <span className="celda-sub">{a.lineasCompletadas}/{a.totalLineas} actividades</span>
                        </td>
                        <td className="fit mono lst-sec">{a.folioNC || <span className="muted">Independiente</span>}</td>
                        <td><Persona nombre={a.responsable} login={a.loginResponsable} /></td>
                        <td><Avance valor={a.avance} /></td>
                        <td className="fit"><Pastilla tono={e.tono}>{e.label}</Pastilla></td>
                        <td className={`fit lst-fecha${!cerrada && a.esVencida ? " t-danger tinta" : ""}`}>{fechaCorta(a.fechaCompromiso, false)}</td>
                        <td className="fit"><Dias dias={a.diasRestantes} cerrada={cerrada} /></td>
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
