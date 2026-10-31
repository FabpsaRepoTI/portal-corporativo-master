// pages/sgc/AccionesCorrectivas/FormNuevaAC.jsx
// Alta de una Acción Correctiva con su plan. Puede ligarse a una NC abierta
// (?idNC=) o ser independiente. Folio AC-YYYY-NNNN propio.
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { BotonGuardar, Campo, Encabezado, Folio, SelectUsuario, Skel, Vacio, useMigas, useToast } from "../components/ui";
import { sgcApi, avisarCambio, catalogos, hoyISO } from "../sgcApi";

const lineaVacia = () => ({ clave: Math.random().toString(36).slice(2), actividad: "", loginResponsable: "", fechaCompromiso: "", recursos: "" });
const lineaVaciaSinDatos = (l) => !l.actividad.trim() && !l.loginResponsable && !l.fechaCompromiso && !l.recursos.trim();

function validar(f, rol, login) {
  const e = { plan: {} };
  if (!f.titulo.trim()) e.titulo = "Escribe el título de la acción.";
  if (!f.loginResponsable) e.loginResponsable = "Asigna un responsable.";
  if (!f.fechaCompromiso) e.fechaCompromiso = "Captura la fecha compromiso.";
  if (rol === 3 && !f.idNC && f.loginResponsable && f.loginResponsable.toUpperCase() !== String(login).toUpperCase()) {
    e.loginResponsable = "Una acción sin NC debe quedar a tu nombre.";
  }
  f.plan.forEach((l, i) => {
    if (lineaVaciaSinDatos(l)) return;
    if (!l.actividad.trim() || !l.loginResponsable || !l.fechaCompromiso) e.plan[i] = "Completa actividad, responsable y fecha.";
    else if (f.fechaCompromiso && l.fechaCompromiso > f.fechaCompromiso) e.plan[i] = "La actividad vence después que la acción.";
  });
  if (!Object.keys(e.plan).length) delete e.plan;
  return e;
}

function Seccion({ num, titulo, desc, completa, children, ancho = false }) {
  return (
    <div className={`form-sec${completa ? " is-completa" : ""}`} style={ancho ? { gridTemplateColumns: "1fr" } : undefined}>
      <div className="form-sec__titulo">
        <span className="form-sec__num">{completa ? <i className="ti ti-check" /> : num}</span>
        <div>
          <h3>{titulo}</h3>
          {desc && <p>{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function FormNuevaAC() {
  const navigate = useNavigate();
  const toast = useToast();
  const { rol, login } = useOutletContext();
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    idNC: params.get("idNC") || "",
    titulo: "",
    descripcion: "",
    causaRaiz: "",
    idHerramienta: "",
    loginResponsable: rol === 3 ? login : "",
    fechaCompromiso: "",
    plan: [lineaVacia()],
  });
  const [errores, setErrores] = useState({});
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [datos, setDatos] = useState(null);
  const [errorCarga, setErrorCarga] = useState(null);
  const [deFabi, setDeFabi] = useState(null); // aviso: campos prellenados por Fab-i
  const location = useLocation();
  useMigas([{ to: "/sgc/acciones-correctivas", label: "Acciones correctivas" }, { label: "Nueva" }]);

  useEffect(() => {
    Promise.all([catalogos(), sgcApi("/nc?estatus=abiertas&limit=500")])
      .then(([cat, ncs]) => setDatos({ cat, ncs: ncs.items }))
      .catch(setErrorCarga);
  }, []);

  // Borrador de Fab-i (location.state.borrador): se aplica una vez, con las NCs abiertas ya cargadas.
  // Los responsables quedan vacíos: Fab-i sugiere puestos, la persona la elige el usuario.
  useEffect(() => {
    const b = location.state?.borrador;
    if (!b || !datos) return;
    const nc = b.nc_origen_folio && datos.ncs.find((n) => n.folio === b.nc_origen_folio);
    const actividades = (b.actividades || []).filter((a) => a.descripcion);
    const plazoMax = Math.max(0, ...actividades.map((a) => a.plazo_dias || 0));
    setForm((f) => ({
      ...f,
      idNC: nc ? String(nc.idNC) : f.idNC,
      titulo: String(b.titulo || "").slice(0, 200),
      descripcion: b.descripcion_problema || "",
      causaRaiz: b.causa_raiz || "",
      fechaCompromiso: plazoMax ? hoyISO(plazoMax) : f.fechaCompromiso,
      plan: actividades.length
        ? actividades.map((a) => ({ ...lineaVacia(), actividad: String(a.descripcion).slice(0, 500), fechaCompromiso: hoyISO(a.plazo_dias || 30) }))
        : f.plan,
    }));
    setDeFabi({
      responsables: actividades.map((a, i) => a.responsable_sugerido && `${i + 1}. ${a.responsable_sugerido}`).filter(Boolean),
      sinNC: b.nc_origen_folio && !nc ? b.nc_origen_folio : null,
    });
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [datos, location.state, location.pathname, location.search, navigate]);

  const actualizar = (s) => {
    setForm(s);
    if (intentado) setErrores(validar(s, rol, login));
  };
  const set = (campo, valor) => actualizar({ ...form, [campo]: valor });
  const setLinea = (i, campo, valor) => actualizar({ ...form, plan: form.plan.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)) });

  const actividades = form.plan.filter((l) => l.actividad.trim() && l.loginResponsable && l.fechaCompromiso).length;
  const req = [
    ["Título", !!form.titulo.trim(), errores.titulo],
    ["Responsable", !!form.loginResponsable && !errores.loginResponsable, errores.loginResponsable],
    ["Fecha compromiso", !!form.fechaCompromiso, errores.fechaCompromiso],
    [`Plan de acción · ${actividades} ${actividades === 1 ? "actividad" : "actividades"}`, actividades > 0 && !errores.plan, errores.plan ? "Revisa el plan" : null],
  ];

  const guardar = async () => {
    setIntentado(true);
    const e = validar(form, rol, login);
    setErrores(e);
    if (Object.keys(e).length) return toast.aviso("Completa los campos marcados para registrar la acción.");
    const plan = form.plan.filter((l) => !lineaVaciaSinDatos(l)).map(({ clave, ...l }) => l);
    try {
      setGuardando(true);
      const r = await sgcApi("/ac", {
        method: "POST",
        body: { ...form, idNC: form.idNC ? Number(form.idNC) : null, idHerramienta: form.idHerramienta ? Number(form.idHerramienta) : null, plan },
      });
      toast.ok(`Acción correctiva ${r.folio} registrada`);
      avisarCambio();
      navigate(`/sgc/acciones-correctivas/${r.idAC}`, { replace: true });
    } catch (err) {
      toast.error(err.message);
      setGuardando(false);
    }
  };

  if (rol === 4) {
    return (
      <div className="sg-page">
        <Encabezado titulo="Nueva acción correctiva" />
        <div className="pnl">
          <Vacio icono="ti-lock" titulo="Sin permisos" texto="Dirección tiene acceso de solo lectura." />
        </div>
      </div>
    );
  }

  const ncElegida = datos?.ncs.find((n) => String(n.idNC) === String(form.idNC));

  return (
    <div className="sg-page">
      <Encabezado kicker="Registro" titulo="Nueva acción correctiva" desc="El folio AC se asigna al guardar y es independiente del folio de la NC." />

      {errorCarga ? (
        <div className="pnl">
          <Vacio tipo="error" icono="ti-cloud-off" titulo="No se pudieron cargar los datos" texto={errorCarga.message} />
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
              Fab-i prellenó el título, el problema, la causa raíz y el plan. Revísalos y asigna los responsables.
              {deFabi.responsables.length > 0 && <> Puestos sugeridos: <b>{deFabi.responsables.join(" · ")}</b>.</>}
              {deFabi.sinNC && <> La {deFabi.sinNC} no está abierta o no la puedes ver: elige la NC a mano.</>}
            </span>
            <button type="button" className="btn btn--fantasma btn--sm btn--icono" aria-label="Ocultar aviso" onClick={() => setDeFabi(null)}><i className="ti ti-x" /></button>
          </div>
        )}
        <div className="form-layout">
          <section className="pnl">
            <Seccion num={1} titulo="Origen" desc="NC que atiende, o déjala independiente (mejora)." completa={!!form.idNC}>
              <div className="rejilla">
                <Campo etq="No conformidad" opcional className="full" ayuda={ncElegida ? ncElegida.descripcion : "Independiente: una mejora sin NC asociada."}>
                  <select className="inp" value={form.idNC} onChange={(e) => set("idNC", e.target.value)}>
                    <option value="">Independiente (sin NC)</option>
                    {datos.ncs.map((n) => (
                      <option key={n.idNC} value={n.idNC}>
                        {n.folio} · {n.descripcion.slice(0, 80)}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
            </Seccion>

            <Seccion num={2} titulo="Definición" desc="Qué se hará y por qué." completa={!!form.titulo.trim()}>
              <div className="rejilla">
                <Campo etq="Título" error={errores.titulo} className="full">
                  <input className={`inp${errores.titulo ? " inp--error" : ""}`} maxLength={200} value={form.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Qué se va a hacer, en una línea" />
                </Campo>
                <Campo etq="Causa raíz" opcional className="full">
                  <textarea className="inp" rows={3} value={form.causaRaiz} onChange={(e) => set("causaRaiz", e.target.value)} placeholder="Resultado del análisis: por qué ocurrió" />
                </Campo>
                <Campo etq="Descripción" opcional>
                  <textarea className="inp" rows={3} value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
                </Campo>
                <Campo etq="Herramienta de análisis" opcional>
                  <select className="inp" value={form.idHerramienta} onChange={(e) => set("idHerramienta", e.target.value)}>
                    <option value="">Sin especificar</option>
                    {datos.cat.herramientas.map((h) => (
                      <option key={h.idHerramienta} value={h.idHerramienta}>
                        {h.nombre}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
            </Seccion>

            <Seccion num={3} titulo="Responsable y plazo" completa={!!form.loginResponsable && !!form.fechaCompromiso && !errores.loginResponsable}>
              <div className="rejilla">
                <Campo etq="Responsable" error={errores.loginResponsable}>
                  <SelectUsuario value={form.loginResponsable} onChange={(l) => set("loginResponsable", l)} invalido={!!errores.loginResponsable} />
                </Campo>
                <Campo etq="Fecha compromiso" error={errores.fechaCompromiso}>
                  <input type="date" className={`inp${errores.fechaCompromiso ? " inp--error" : ""}`} min={hoyISO()} value={form.fechaCompromiso} onChange={(e) => set("fechaCompromiso", e.target.value)} />
                </Campo>
              </div>
            </Seccion>

            <Seccion num={4} titulo="Plan de acción" desc="Cada actividad completada suma al avance." completa={actividades > 0 && !errores.plan} ancho>
              <div className="plan-lista">
                {form.plan.map((l, i) => (
                  <div key={l.clave}>
                    <div className="plan-linea">
                      <span className="plan-linea__num">{String(i + 1).padStart(2, "0")}</span>
                      <Campo etq="Actividad">
                        <input className="inp" maxLength={500} value={l.actividad} onChange={(e) => setLinea(i, "actividad", e.target.value)} placeholder="Qué se hará" />
                      </Campo>
                      <Campo etq="Responsable">
                        <SelectUsuario value={l.loginResponsable} onChange={(v) => setLinea(i, "loginResponsable", v)} />
                      </Campo>
                      <Campo etq="Fecha">
                        <input type="date" className="inp" min={hoyISO()} max={form.fechaCompromiso || undefined} value={l.fechaCompromiso} onChange={(e) => setLinea(i, "fechaCompromiso", e.target.value)} />
                      </Campo>
                      <Campo etq="Recursos" opcional>
                        <input className="inp" maxLength={500} value={l.recursos} onChange={(e) => setLinea(i, "recursos", e.target.value)} />
                      </Campo>
                      <button
                        type="button"
                        className="btn btn--fantasma btn--icono btn--peligro"
                        aria-label={`Quitar actividad ${i + 1}`}
                        disabled={form.plan.length === 1}
                        onClick={() => actualizar({ ...form, plan: form.plan.filter((_, j) => j !== i) })}
                      >
                        <i className="ti ti-trash" />
                      </button>
                    </div>
                    {errores.plan?.[i] && (
                      <span className="campo__error" style={{ marginTop: 6 }}>
                        <i className="ti ti-alert-circle" /> {errores.plan[i]}
                      </span>
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn--sm" style={{ justifySelf: "start" }} onClick={() => actualizar({ ...form, plan: [...form.plan, lineaVacia()] })}>
                  <i className="ti ti-plus" /> Agregar actividad
                </button>
              </div>
            </Seccion>
          </section>

          <aside className="pnl resumen" aria-label="Resumen del registro">
            <header className="pnl__head">
              <h2>Antes de registrar</h2>
            </header>
            {ncElegida && (
              <div style={{ padding: "12px 16px 0" }}>
                <Folio folio={ncElegida.folio} tono="danger" />
              </div>
            )}
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
                Registrar acción
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
