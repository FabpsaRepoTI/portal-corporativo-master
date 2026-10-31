// pages/sgc/NoConformidades/FormNuevaNC.jsx
// Alta de una No Conformidad (Coordinador y Responsable de área).
// Secciones numeradas que se marcan al completarse y un resumen lateral con
// los requisitos pendientes. El folio NC-YYYY-NNNN lo asigna el servidor.
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { BotonGuardar, Campo, Encabezado, Panel, SelectUsuario, Skel, Vacio, useMigas, useToast } from "../components/ui";
import { sgcApi, avisarCambio, catalogos, departamentos, procesos, sitios, hoyISO, plural, PROCESO_TIPO } from "../sgcApi";

const VACIO = {
  idOrigen: "",
  idClasificacion: "",
  idAfectacion: "",
  descripcion: "",
  descripcionDetallada: "",
  loginResponsable: "",
  fechaDeteccion: hoyISO(),
  fechaCompromiso: "",
  idDepartamento: "",
  idSitio: "",
  idProceso: "",
  herramientasAnalisis: [],
};
const PLAZOS = [7, 15, 30, 60];
// Comparación de nombres de catálogo sin mayúsculas ni acentos
const _norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

function validar(f) {
  const e = {};
  if (!f.idOrigen) e.idOrigen = "Selecciona el origen.";
  if (!f.idClasificacion) e.idClasificacion = "Selecciona la clasificación.";
  if (!f.descripcion.trim()) e.descripcion = "Describe brevemente la no conformidad.";
  if (!f.loginResponsable) e.loginResponsable = "Asigna un responsable.";
  if (!f.fechaDeteccion) e.fechaDeteccion = "Captura la fecha de detección.";
  if (!f.fechaCompromiso) e.fechaCompromiso = "Captura la fecha compromiso.";
  else if (f.fechaDeteccion && f.fechaCompromiso < f.fechaDeteccion) e.fechaCompromiso = "No puede ser anterior a la detección.";
  return e;
}

function dias(desde, hasta) {
  if (!desde || !hasta) return null;
  return Math.round((new Date(hasta + "T00:00:00") - new Date(desde + "T00:00:00")) / 86400000);
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

export default function FormNuevaNC() {
  const navigate = useNavigate();
  const toast = useToast();
  const { rol, login } = useOutletContext();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ ...VACIO, loginResponsable: rol === 3 ? login : "", idProceso: params.get("proceso") || "" });
  const [errores, setErrores] = useState({});
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [datos, setDatos] = useState(null);
  const [errorCarga, setErrorCarga] = useState(null);
  const [deFabi, setDeFabi] = useState(null); // aviso: campos prellenados por Fab-i
  const location = useLocation();
  useMigas([{ to: "/sgc/no-conformidades", label: "No conformidades" }, { label: "Nueva" }]);

  useEffect(() => {
    // El mapa de procesos es opcional: si falla, el formulario sigue sin ese campo
    Promise.all([catalogos(), departamentos(), sitios(), procesos().catch(() => [])])
      .then(([cat, deps, sit, pro]) => setDatos({ cat, deps, sit, pro }))
      .catch(setErrorCarga);
  }, []);

  // Borrador de Fab-i (location.state.borrador): se aplica una vez, con los catálogos ya cargados
  useEffect(() => {
    const b = location.state?.borrador;
    if (!b || !datos) return;
    const id = (lista, campo, nombre) => (nombre ? String(lista.find((x) => _norm(x.nombre) === _norm(nombre))?.[campo] ?? "") : "");
    setForm((f) => ({
      ...f,
      descripcion: String(b.descripcion || "").slice(0, 300),
      descripcionDetallada: b.descripcion_detallada || f.descripcionDetallada,
      idClasificacion: id(datos.cat.clasificaciones, "idClasificacion", b.clasificacion) || f.idClasificacion,
      idAfectacion: id(datos.cat.afectaciones, "idAfectacion", b.afectacion) || f.idAfectacion,
      idProceso: id(datos.pro, "idProceso", b.proceso_sugerido) || f.idProceso,
    }));
    setDeFabi(b.area_sugerida ? { area: b.area_sugerida } : {});
    // Sin el state, recargar la página ya no vuelve a sobrescribir lo capturado
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [datos, location.state, location.pathname, location.search, navigate]);

  const dptosPorSitio = useMemo(() => {
    const grupos = new Map();
    const sitio = datos?.sit.find((s) => String(s.idSitio) === String(form.idSitio));
    for (const d of datos?.deps || []) {
      if (sitio && d.codigoSitio !== sitio.codigoSitio) continue;
      const k = d.sitio || d.codigoSitio || "Otros";
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(d);
    }
    return [...grupos];
  }, [datos, form.idSitio]);

  const actualizar = (s) => {
    setForm(s);
    if (intentado) setErrores(validar(s));
  };
  const set = (campo, valor) => actualizar({ ...form, [campo]: valor });
  const toggleHerramienta = (id) =>
    set("herramientasAnalisis", form.herramientasAnalisis.includes(id) ? form.herramientasAnalisis.filter((h) => h !== id) : [...form.herramientasAnalisis, id]);

  const plazo = dias(form.fechaDeteccion, form.fechaCompromiso);
  const req = [
    ["Origen", !!form.idOrigen, errores.idOrigen],
    ["Clasificación", !!form.idClasificacion, errores.idClasificacion],
    ["Descripción", !!form.descripcion.trim(), errores.descripcion],
    ["Responsable", !!form.loginResponsable, errores.loginResponsable],
    ["Fecha compromiso", !!form.fechaCompromiso && plazo >= 0, errores.fechaCompromiso],
  ];
  const listos = req.filter((r) => r[1]).length;

  const guardar = async () => {
    setIntentado(true);
    const e = validar(form);
    setErrores(e);
    if (Object.keys(e).length) return toast.aviso("Completa los campos marcados para registrar la NC.");
    try {
      setGuardando(true);
      const r = await sgcApi("/nc", {
        method: "POST",
        body: {
          ...form,
          idOrigen: Number(form.idOrigen),
          idClasificacion: Number(form.idClasificacion),
          idAfectacion: form.idAfectacion ? Number(form.idAfectacion) : null,
          idDepartamento: form.idDepartamento ? Number(form.idDepartamento) : null,
          idSitio: form.idSitio ? Number(form.idSitio) : null,
          idProceso: form.idProceso ? Number(form.idProceso) : null,
        },
      });
      toast.ok(`No conformidad ${r.folio} registrada`);
      avisarCambio();
      navigate(`/sgc/no-conformidades/${r.idNC}`, { replace: true });
    } catch (err) {
      toast.error(err.message);
      setGuardando(false);
    }
  };

  if (rol !== 1 && rol !== 3) {
    return (
      <div className="sg-page">
        <Encabezado titulo="Nueva no conformidad" />
        <div className="pnl">
          <Vacio icono="ti-lock" titulo="Sin permisos" texto="Solo el Coordinador SGI y los Responsables de área registran no conformidades." />
        </div>
      </div>
    );
  }

  return (
    <div className="sg-page">
      <Encabezado kicker="Registro" titulo="Nueva no conformidad" desc="El folio se asigna al guardar. Se registra como «Abierta» y queda en la bitácora." />

      {errorCarga ? (
        <div className="pnl">
          <Vacio tipo="error" icono="ti-cloud-off" titulo="No se pudieron cargar los catálogos" texto={errorCarga.message} />
        </div>
      ) : !datos ? (
        <div className="pnl">
          <Skel filas={10} />
        </div>
      ) : (
        <>
        {deFabi && (
          <div className="fabi-prellenado" role="status">
            <i className="ti ti-sparkles" />
            <span>
              Fab-i prellenó la descripción, la clasificación, la afectación y el proceso. Revísalos y completa origen, responsable y fechas.
              {deFabi.area && <> Área sugerida: <b>{deFabi.area}</b>.</>}
            </span>
            <button type="button" className="btn btn--fantasma btn--sm btn--icono" aria-label="Ocultar aviso" onClick={() => setDeFabi(null)}><i className="ti ti-x" /></button>
          </div>
        )}
        <div className="form-layout">
          <section className="pnl">
            <Seccion num={1} titulo="Clasificación" desc="Cómo se detectó y su severidad." completa={!!form.idOrigen && !!form.idClasificacion}>
              <Campo etq="Origen" error={errores.idOrigen}>
                <select className={`inp${errores.idOrigen ? " inp--error" : ""}`} value={form.idOrigen} onChange={(e) => set("idOrigen", e.target.value)}>
                  <option value="">Selecciona…</option>
                  {datos.cat.origenes.map((o) => (
                    <option key={o.idOrigen} value={o.idOrigen}>
                      {o.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etq="Clasificación" error={errores.idClasificacion}>
                <select className={`inp${errores.idClasificacion ? " inp--error" : ""}`} value={form.idClasificacion} onChange={(e) => set("idClasificacion", e.target.value)}>
                  <option value="">Selecciona…</option>
                  {datos.cat.clasificaciones.map((c) => (
                    <option key={c.idClasificacion} value={c.idClasificacion}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etq="Afectación" opcional>
                <select className="inp" value={form.idAfectacion} onChange={(e) => set("idAfectacion", e.target.value)}>
                  <option value="">Sin especificar</option>
                  {datos.cat.afectaciones.map((a) => (
                    <option key={a.idAfectacion} value={a.idAfectacion}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
            </Seccion>

            <Seccion num={2} titulo="Hallazgo" desc="Qué se detectó, con evidencia objetiva." completa={!!form.descripcion.trim()}>
              <Campo etq="Descripción corta" error={errores.descripcion} ayuda={`${form.descripcion.length}/300 · aparece en listas y reportes`} className="full">
                <input
                  className={`inp${errores.descripcion ? " inp--error" : ""}`}
                  maxLength={300}
                  value={form.descripcion}
                  onChange={(e) => set("descripcion", e.target.value)}
                  placeholder="Ej. Etiquetas de alérgenos sin fecha de revisión en la línea 2"
                />
              </Campo>
              <Campo etq="Descripción detallada" opcional className="full">
                <textarea
                  className="inp"
                  rows={5}
                  value={form.descripcionDetallada}
                  onChange={(e) => set("descripcionDetallada", e.target.value)}
                  placeholder="Contexto, requisito incumplido, alcance, lotes o equipos involucrados…"
                />
              </Campo>
            </Seccion>

            <Seccion num={3} titulo="Responsable y plazo" desc="Quién atiende y para cuándo." completa={!!form.loginResponsable && !!form.fechaCompromiso && plazo >= 0}>
              <Campo etq="Responsable" error={errores.loginResponsable} className="full">
                <SelectUsuario value={form.loginResponsable} onChange={(l) => set("loginResponsable", l)} invalido={!!errores.loginResponsable} />
              </Campo>
              <Campo etq="Fecha de detección" error={errores.fechaDeteccion}>
                <input type="date" className="inp" max={hoyISO()} value={form.fechaDeteccion} onChange={(e) => set("fechaDeteccion", e.target.value)} />
              </Campo>
              <Campo etq="Fecha compromiso" error={errores.fechaCompromiso} ayuda={plazo != null && plazo >= 0 ? `Plazo de ${plural(plazo, "día", "días")}` : null}>
                <input
                  type="date"
                  className={`inp${errores.fechaCompromiso ? " inp--error" : ""}`}
                  min={form.fechaDeteccion || undefined}
                  value={form.fechaCompromiso}
                  onChange={(e) => set("fechaCompromiso", e.target.value)}
                />
              </Campo>
              <div className="full opciones" role="group" aria-label="Plazos sugeridos">
                {PLAZOS.map((d) => {
                  const destino = (() => {
                    const x = new Date((form.fechaDeteccion || hoyISO()) + "T00:00:00");
                    x.setDate(x.getDate() + d);
                    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
                  })();
                  return (
                    <button type="button" key={d} className={`opcion${form.fechaCompromiso === destino ? " is-on" : ""}`} onClick={() => set("fechaCompromiso", destino)}>
                      +{d} días
                    </button>
                  );
                })}
              </div>
            </Seccion>

            <Seccion num={4} titulo="Ubicación y proceso" desc="Opcional · dónde ocurrió y qué proceso afecta." completa={!!form.idDepartamento || !!form.idProceso}>
              <Campo etq="Proceso" opcional ayuda="Del mapa de procesos; la NC aparecerá en su ficha." className="full">
                <select className="inp" value={form.idProceso} onChange={(e) => set("idProceso", e.target.value)}>
                  <option value="">Sin vincular</option>
                  {Object.entries(PROCESO_TIPO).map(([tipo, t]) => {
                    const lista = datos.pro.filter((p) => p.tipo === Number(tipo));
                    return lista.length ? (
                      <optgroup key={tipo} label={`Procesos ${t.label.toLowerCase()}s`}>
                        {lista.map((p) => (
                          <option key={p.idProceso} value={p.idProceso}>
                            {p.nombre}
                          </option>
                        ))}
                      </optgroup>
                    ) : null;
                  })}
                </select>
              </Campo>
              <Campo etq="Sitio" opcional>
                <select className="inp" value={form.idSitio} onChange={(e) => actualizar({ ...form, idSitio: e.target.value, idDepartamento: "" })}>
                  <option value="">Sin especificar</option>
                  {datos.sit.map((s) => (
                    <option key={s.idSitio} value={s.idSitio}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etq="Departamento" opcional ayuda={form.idSitio ? "Filtrado por el sitio elegido" : null}>
                <select className="inp" value={form.idDepartamento} onChange={(e) => set("idDepartamento", e.target.value)}>
                  <option value="">Sin especificar</option>
                  {dptosPorSitio.map(([sitio, lista]) => (
                    <optgroup key={sitio} label={sitio}>
                      {lista.map((d) => (
                        <option key={d.idDepartamento} value={d.idDepartamento}>
                          {d.departamento}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Campo>
            </Seccion>

            <Seccion num={5} titulo="Análisis previsto" desc="Opcional · herramientas para la causa raíz." completa={form.herramientasAnalisis.length > 0}>
              <div className="full opciones" role="group" aria-label="Herramientas de análisis">
                {datos.cat.herramientas.map((h) => {
                  const on = form.herramientasAnalisis.includes(h.idHerramienta);
                  return (
                    <button type="button" key={h.idHerramienta} className={`opcion${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => toggleHerramienta(h.idHerramienta)}>
                      <i className={`ti ${on ? "ti-square-check-filled" : "ti-square"}`} />
                      {h.nombre}
                    </button>
                  );
                })}
              </div>
            </Seccion>
          </section>

          <aside className="pnl resumen" aria-label="Resumen del registro">
            <header className="pnl__head">
              <h2>Antes de registrar</h2>
              <span className="cuenta-pill">
                {listos}/{req.length}
              </span>
            </header>
            <div className="resumen__lista">
              {req.map(([etq, ok, err]) => (
                <div key={etq} className={`resumen__item${ok ? " is-ok" : err ? " is-error" : ""}`}>
                  <i className={`ti ${ok ? "ti-circle-check-filled" : err ? "ti-alert-circle" : "ti-circle-dashed"}`} />
                  {etq}
                </div>
              ))}
            </div>
            <div className="resumen__pie">
              <BotonGuardar ocupado={guardando} icono="ti-device-floppy" className="btn btn--primario btn--lg btn--bloque" onClick={guardar}>
                Registrar no conformidad
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
