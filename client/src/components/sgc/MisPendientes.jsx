// components/sgc/MisPendientes.jsx
// Bandeja "Mis pendientes" del centro de control: NCs, actividades de AC y
// hallazgos a cargo del usuario (GET /api/sgc/mis-pendientes).
// Pestañas: Urgente (vencido o ≤ 2 días) · Esta semana (3–7 días) · Después · Completados.
// Acciones: Ver (abre el registro) · Posponer 1 día (solo oculta de la bandeja) · Delegar.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { sgcApi, useSgc, avisarCambio } from "../../pages/sgc/sgcApi";
import { ErrorCarga, SelectUsuario, Skel, Vence, useToast } from "../../pages/sgc/components/ui";

const RUTA = {
  nc: (p) => `/sgc/no-conformidades/${p.idRegistro}`,
  ac: (p) => `/sgc/acciones-correctivas/${p.idRegistro}`,
  aud: (p) => `/sgc/auditorias/${p.idRegistro}`,
};
const CORTO = { nc: "NC", ac: "AC", aud: "auditoría" };
const ICONO = { nc: "ti-alert-circle", ac: "ti-circle-check", aud: "ti-clipboard-check" };

const TABS = [
  { id: "urgente", label: "Urgente", filtro: (p) => !p.completado && p.urgente },
  { id: "semana", label: "Esta semana", filtro: (p) => !p.completado && !p.urgente && p.dias_restantes != null && p.dias_restantes <= 7 },
  { id: "despues", label: "Después", filtro: (p) => !p.completado && !p.urgente && (p.dias_restantes == null || p.dias_restantes > 7) },
  { id: "hechos", label: "Completados", filtro: (p) => p.completado },
];

const MODULO_PANEL = { nc: "nc", ac: "ac", aud: "auditoria" };

function Item({ p, onHecho, onVer }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [delegando, setDelegando] = useState(false);
  const [destino, setDestino] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const accion = async (body, aviso) => {
    try {
      setOcupado(true);
      await sgcApi("/mis-pendientes/accion", { method: "POST", body: { entidad: p.entidad, id: p.id, ...body } });
      toast.ok(aviso);
      setDelegando(false);
      onHecho();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <li className={`mp-item${p.urgente ? " is-urgente" : ""}`}>
      <span className="mp-item__icono" aria-hidden="true"><i className={`ti ${ICONO[p.tipo]}`} /></span>
      <div className="mp-item__cuerpo">
        <div className="mp-item__linea">
          <span className="mp-folio">{p.folio}</span>
          <span className="mp-modulo">{p.modulo}</span>
        </div>
        <p className="mp-item__titulo" title={p.titulo}>{p.titulo}</p>
        {delegando && (
          <div className="mp-delegar">
            <SelectUsuario value={destino} onChange={setDestino} placeholder="¿A quién se lo delegas?" />
            <button type="button" className="btn btn--primario btn--sm" disabled={!destino || ocupado} onClick={() => accion({ accion: "delegar", login: destino }, "Pendiente delegado: le llegará una notificación.")}>
              <i className="ti ti-send" /> Enviar
            </button>
            <button type="button" className="btn btn--fantasma btn--sm" onClick={() => setDelegando(false)}>Cancelar</button>
          </div>
        )}
      </div>
      <div className="mp-item__lado">
        {p.completado ? <span className="mp-hecho"><i className="ti ti-check" /> Cerrada</span> : <Vence fecha={p.fecha_limite} dias={p.dias_restantes} />}
        <div className="mp-acciones">
          <button type="button" className="btn btn--sm" onClick={() => (onVer ? onVer(MODULO_PANEL[p.tipo], p.idRegistro) : navigate(RUTA[p.tipo](p)))}>
            <i className="ti ti-eye" /> Ver {CORTO[p.tipo]}
          </button>
          {!p.completado && (
            <>
              <button type="button" className="btn btn--fantasma btn--sm btn--icono" title="Posponer 1 día (solo en tu bandeja)" aria-label="Posponer 1 día" disabled={ocupado}
                onClick={() => accion({ accion: "posponer", dias: 1 }, "Lo verás de nuevo mañana.")}>
                <i className="ti ti-clock-pause" />
              </button>
              <button type="button" className="btn btn--fantasma btn--sm btn--icono" title="Delegar" aria-label="Delegar" aria-expanded={delegando} onClick={() => setDelegando((v) => !v)}>
                <i className="ti ti-share-3" />
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

// onVer(modulo, id): opcional; si se da, "Ver" abre el registro en el panel lateral en lugar de navegar
export default function MisPendientes({ onVer }) {
  const { data, error, cargando, recargar } = useSgc(() => sgcApi("/mis-pendientes"));
  const lista = data || [];
  const cuentas = Object.fromEntries(TABS.map((t) => [t.id, lista.filter(t.filtro).length]));
  const [tab, setTab] = useState(null);
  // Sin elección del usuario, abre la primera pestaña con algo
  const activa = tab || TABS.find((t) => cuentas[t.id] > 0)?.id || "urgente";
  const visibles = lista.filter(TABS.find((t) => t.id === activa).filtro);

  const hecho = () => {
    recargar();
    avisarCambio();
  };

  return (
    <section className="pnl mp" aria-label="Mis pendientes">
      <header className="mp__head">
        <div>
          <h2 className="mp__titulo"><i className="ti ti-checklist" /> Mis pendientes</h2>
          <span className="mp__sub">Lo que está a tu cargo, ordenado por fecha límite.</span>
        </div>
        <button type="button" className="btn btn--fantasma btn--icono btn--sm" onClick={recargar} aria-label="Actualizar pendientes">
          <i className={`ti ti-refresh${cargando ? " giro" : ""}`} />
        </button>
      </header>
      <div className="mp__tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={activa === t.id} className={`mp__tab${activa === t.id ? " is-on" : ""}${t.id === "urgente" && cuentas.urgente ? " is-alerta" : ""}`} onClick={() => setTab(t.id)}>
            {t.label} <span className="num">{cuentas[t.id]}</span>
          </button>
        ))}
      </div>
      {error && !data ? (
        <ErrorCarga error={error} onReintentar={recargar} />
      ) : !data ? (
        <Skel filas={4} />
      ) : !visibles.length ? (
        <div className="mp__vacio">
          <i className="ti ti-mood-check" />
          {activa === "hechos" ? "Nada cerrado en los últimos 30 días." : "Nada pendiente aquí."}
        </div>
      ) : (
        <ul className="mp__lista">
          {visibles.map((p) => <Item key={`${p.entidad}${p.id}${p.completado ? "c" : ""}`} p={p} onHecho={hecho} onVer={onVer} />)}
        </ul>
      )}
    </section>
  );
}
