// pages/sgc/Auditorias/FormNuevaAuditoria.jsx
// Programación de una auditoría (Coordinador y Auditor). Folio AUD-YYYY-NNNN.
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { Avatar, BotonGuardar, Campo, Encabezado, SelectUsuario, Skel, Vacio, useMigas, useToast, useUsuarios } from "../components/ui";
import { sgcApi, avisarCambio, departamentos, hoyISO, plural, AUD_TIPO } from "../sgcApi";

const NORMAS = ["ISO 9001:2015", "ISO 22000:2018", "FSSC 22000 v6", "ISO 14001:2015", "ISO 45001:2018", "BRCGS", "SQF"];
const DESC_TIPO = { 1: "Equipo interno evalúa sus procesos", 2: "Cliente, proveedor u organismo externo", 3: "Organismo certificador" };

function validar(f) {
  const e = {};
  if (!f.titulo.trim()) e.titulo = "Escribe el título.";
  if (!f.fechaInicio) e.fechaInicio = "Captura la fecha de inicio.";
  if (f.fechaFin && f.fechaInicio && f.fechaFin < f.fechaInicio) e.fechaFin = "No puede ser anterior al inicio.";
  if (!f.alcance.trim()) e.alcance = "Describe el alcance.";
  if (!f.auditores.length) e.auditores = "Asigna al menos un auditor.";
  return e;
}

function Seccion({ num, titulo, desc, completa, children }) {
  return (
    <div className={`form-sec${completa ? " is-completa" : ""}`}>
      <div className="form-sec__titulo">
        <span className="form-sec__num">{completa ? <i className="ti ti-check" /> : num}</span>
        <div>
          <h3>{titulo}</h3>
          {desc && <p>{desc}</p>}
        </div>
      </div>
      <div className="rejilla">{children}</div>
    </div>
  );
}

export default function FormNuevaAuditoria() {
  const navigate = useNavigate();
  const toast = useToast();
  const { rol, login } = useOutletContext();
  const usuariosLista = useUsuarios();
  const [deps, setDeps] = useState(null);
  const [form, setForm] = useState({ titulo: "", tipo: "1", fechaInicio: hoyISO(7), fechaFin: "", alcance: "", normaAplicable: "ISO 9001:2015", auditores: rol === 2 ? [login] : [], areasAuditadas: [] });
  const [errores, setErrores] = useState({});
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  useMigas([{ to: "/sgc/auditorias", label: "Auditorías" }, { label: "Programar" }]);

  useEffect(() => {
    departamentos().then(setDeps).catch(() => setDeps([]));
  }, []);

  // Borrador de Fab-i (location.state.borrador): título, tipo, norma, fecha y alcance.
  // El equipo auditor no se asume: lo elige el usuario.
  const location = useLocation();
  const [deFabi, setDeFabi] = useState(false);
  useEffect(() => {
    const b = location.state?.borrador;
    if (!b) return;
    const tipo = Object.entries(AUD_TIPO).find(([, t]) => t === b.tipo)?.[0];
    const alcance = [b.alcance, b.proceso_sugerido && !String(b.alcance || "").includes(b.proceso_sugerido) ? `Proceso: ${b.proceso_sugerido}` : null].filter(Boolean).join(". ");
    setForm((f) => ({
      ...f,
      titulo: String(b.nombre || "").slice(0, 200),
      tipo: tipo || f.tipo,
      normaAplicable: b.norma || f.normaAplicable,
      fechaInicio: b.fecha_sugerida && b.fecha_sugerida >= hoyISO() ? b.fecha_sugerida : f.fechaInicio,
      alcance: alcance.slice(0, 500),
    }));
    setDeFabi(true);
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, navigate]);
  const depPorId = useMemo(() => Object.fromEntries((deps || []).map((d) => [d.idDepartamento, d])), [deps]);
  const usuario = (l) => usuariosLista.find((u) => u.login === l);

  const actualizar = (s) => {
    setForm(s);
    if (intentado) setErrores(validar(s));
  };
  const set = (campo, valor) => actualizar({ ...form, [campo]: valor });

  const req = [
    ["Título", !!form.titulo.trim(), errores.titulo],
    ["Fechas", !!form.fechaInicio && !errores.fechaFin, errores.fechaInicio || errores.fechaFin],
    ["Alcance", !!form.alcance.trim(), errores.alcance],
    [`Equipo auditor · ${form.auditores.length}`, form.auditores.length > 0, errores.auditores],
  ];

  const guardar = async () => {
    setIntentado(true);
    const e = validar(form);
    setErrores(e);
    if (Object.keys(e).length) return toast.aviso("Completa los campos marcados para programar la auditoría.");
    try {
      setGuardando(true);
      const r = await sgcApi("/auditorias", { method: "POST", body: { ...form, tipo: Number(form.tipo), fechaFin: form.fechaFin || form.fechaInicio } });
      toast.ok(`Auditoría ${r.folio} programada`);
      avisarCambio();
      navigate(`/sgc/auditorias/${r.idAuditoria}`, { replace: true });
    } catch (err) {
      toast.error(err.message);
      setGuardando(false);
    }
  };

  if (rol !== 1 && rol !== 2) {
    return (
      <div className="sg-page">
        <Encabezado titulo="Programar auditoría" />
        <div className="pnl">
          <Vacio icono="ti-lock" titulo="Sin permisos" texto="Solo el Coordinador y los Auditores SGI programan auditorías." />
        </div>
      </div>
    );
  }

  return (
    <div className="sg-page">
      <Encabezado kicker="Programa de auditorías" titulo="Programar auditoría" desc="Queda como «Planeada»; el folio AUD se asigna al guardar." />
      {!deps ? (
        <div className="pnl">
          <Skel filas={8} />
        </div>
      ) : (
        <>
        {deFabi && (
          <div className="fabi-prellenado" role="status">
            <i className="ti ti-sparkles" />
            <span>Fab-i prellenó el título, el tipo, la norma, la fecha y el alcance. Revísalos y asigna el equipo auditor.</span>
            <button type="button" className="btn btn--fantasma btn--sm btn--icono" aria-label="Ocultar aviso" onClick={() => setDeFabi(false)}><i className="ti ti-x" /></button>
          </div>
        )}
        <div className="form-layout">
          <section className="pnl">
            <Seccion num={1} titulo="Auditoría" desc="Qué se audita y bajo qué norma." completa={!!form.titulo.trim()}>
              <Campo etq="Título" error={errores.titulo} className="full">
                <input className={`inp${errores.titulo ? " inp--error" : ""}`} maxLength={200} value={form.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ej. Auditoría interna al proceso de Compras" />
              </Campo>
              <div className="full opciones" role="radiogroup" aria-label="Tipo de auditoría">
                {Object.entries(AUD_TIPO).map(([id, t]) => (
                  <button key={id} type="button" role="radio" aria-checked={form.tipo === id} className={`opcion${form.tipo === id ? " is-on" : ""}`} onClick={() => set("tipo", id)} title={DESC_TIPO[id]}>
                    <i className={`ti ${form.tipo === id ? "ti-circle-dot" : "ti-circle"}`} /> {t}
                  </button>
                ))}
              </div>
              <Campo etq="Norma aplicable" opcional className="full" ayuda={DESC_TIPO[form.tipo]}>
                <input className="inp" list="sgc-normas" maxLength={200} value={form.normaAplicable} onChange={(e) => set("normaAplicable", e.target.value)} />
                <datalist id="sgc-normas">
                  {NORMAS.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </Campo>
            </Seccion>

            <Seccion num={2} titulo="Fechas y alcance" completa={!!form.fechaInicio && !!form.alcance.trim() && !errores.fechaFin}>
              <Campo etq="Inicio" error={errores.fechaInicio}>
                <input type="date" className="inp" value={form.fechaInicio} onChange={(e) => set("fechaInicio", e.target.value)} />
              </Campo>
              <Campo etq="Fin" opcional error={errores.fechaFin} ayuda="Vacía = un solo día">
                <input type="date" className={`inp${errores.fechaFin ? " inp--error" : ""}`} min={form.fechaInicio || undefined} value={form.fechaFin} onChange={(e) => set("fechaFin", e.target.value)} />
              </Campo>
              <Campo etq="Alcance" error={errores.alcance} className="full">
                <textarea className={`inp${errores.alcance ? " inp--error" : ""}`} rows={3} maxLength={500} value={form.alcance} onChange={(e) => set("alcance", e.target.value)} placeholder="Procesos, áreas y cláusulas a evaluar" />
              </Campo>
            </Seccion>

            <Seccion num={3} titulo="Equipo auditor" desc="El primero es el auditor líder." completa={form.auditores.length > 0}>
              <Campo etq="Agregar auditor" error={errores.auditores} className="full">
                <SelectUsuario value="" onChange={(l) => l && !form.auditores.includes(l) && set("auditores", [...form.auditores, l])} excluir={form.auditores} placeholder="Buscar persona…" />
              </Campo>
              {form.auditores.length > 0 && (
                <div className="full" style={{ display: "grid", gap: 6 }}>
                  {form.auditores.map((l, i) => (
                    <div key={l} className="fila" style={{ gridTemplateColumns: "auto minmax(0,1fr) auto", border: "1px solid var(--line)", borderRadius: "var(--r)", padding: "8px 10px" }}>
                      <Avatar nombre={usuario(l)?.nombre || l} />
                      <span className="fila__txt">
                        <b>{usuario(l)?.nombre || l}</b>
                        <small>{i === 0 ? "Auditor líder" : usuario(l)?.area || "Auditor"}</small>
                      </span>
                      <button type="button" className="btn btn--fantasma btn--sm btn--icono" aria-label={`Quitar ${usuario(l)?.nombre || l}`} onClick={() => set("auditores", form.auditores.filter((x) => x !== l))}>
                        <i className="ti ti-x" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Seccion>

            <Seccion num={4} titulo="Áreas auditadas" desc="Opcional." completa={form.areasAuditadas.length > 0}>
              <Campo etq="Agregar área" opcional className="full">
                <select
                  className="inp"
                  value=""
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    if (id && !form.areasAuditadas.includes(id)) set("areasAuditadas", [...form.areasAuditadas, id]);
                  }}
                >
                  <option value="">Selecciona un departamento…</option>
                  {deps
                    .filter((d) => !form.areasAuditadas.includes(d.idDepartamento))
                    .map((d) => (
                      <option key={d.idDepartamento} value={d.idDepartamento}>
                        {d.departamento} · {d.sitio || d.codigoSitio}
                      </option>
                    ))}
                </select>
              </Campo>
              {form.areasAuditadas.length > 0 && (
                <div className="full opciones">
                  {form.areasAuditadas.map((id) => (
                    <span key={id} className="chip">
                      {depPorId[id]?.departamento} <span className="muted">· {depPorId[id]?.sitio}</span>
                      <button type="button" aria-label="Quitar área" onClick={() => set("areasAuditadas", form.areasAuditadas.filter((x) => x !== id))}>
                        <i className="ti ti-x" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </Seccion>
          </section>

          <aside className="pnl resumen" aria-label="Resumen">
            <header className="pnl__head">
              <h2>Antes de programar</h2>
            </header>
            <div className="resumen__lista">
              {req.map(([etq, ok, err]) => (
                <div key={etq} className={`resumen__item${ok ? " is-ok" : err ? " is-error" : ""}`}>
                  <i className={`ti ${ok ? "ti-circle-check-filled" : err ? "ti-alert-circle" : "ti-circle-dashed"}`} />
                  {etq}
                </div>
              ))}
              <div className="resumen__item">
                <i className="ti ti-building" />
                {plural(form.areasAuditadas.length, "área", "áreas")}
              </div>
            </div>
            <div className="resumen__pie">
              <BotonGuardar ocupado={guardando} icono="ti-calendar-plus" className="btn btn--primario btn--lg btn--bloque" onClick={guardar}>
                Programar auditoría
              </BotonGuardar>
              <button className="btn btn--fantasma btn--bloque" onClick={() => navigate(-1)} disabled={guardando}>
                Cancelar
              </button>
            </div>
          </aside>
        </div>
        </>
      )}
    </div>
  );
}
