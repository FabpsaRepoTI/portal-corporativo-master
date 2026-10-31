// pages/sgc/components/PanelEstatus.jsx
// "Siguiente paso": la transición hacia adelante es la acción principal;
// regresar, cancelar y reasignar quedan como acciones secundarias. Solo se
// ofrecen las transiciones que manda el servidor (que vuelve a validar).
// Los cambios destructivos (cerrar, cancelar) piden confirmación.
import { useState } from "react";
import { Confirmar, Riel, SelectUsuario, useToast } from "./ui";
import { NC_ESTATUS, AC_ESTATUS } from "../sgcApi";

const MAPAS = { nc: NC_ESTATUS, ac: AC_ESTATUS };

/**
 * tipo: 'nc' | 'ac'; actual; transiciones: [ids]
 * reglas: { requiereMotivo(nuevo, actual), destructivo(nuevo), ayuda(nuevo), cancelar?: id }
 * bloqueo: texto si el avance está bloqueado (p. ej. plan incompleto)
 * reasignar / responsableActual: reasignación de responsable (NC)
 * onGuardar({ nuevoEstatus, motivo, loginNuevoResponsable }) → Promise
 */
export default function PanelEstatus({ tipo, actual, transiciones, reglas, bloqueo, reasignar = false, responsableActual, onGuardar }) {
  const toast = useToast();
  const mapa = MAPAS[tipo];
  const [accion, setAccion] = useState(null); // { destino, modo: 'avanzar'|'regresar'|'cancelar'|'reasignar' }
  const [motivo, setMotivo] = useState("");
  const [nuevoResp, setNuevoResp] = useState("");
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const cancelar = reglas.cancelar;
  const adelante = transiciones.filter((t) => t > actual && t !== cancelar).sort((a, b) => a - b)[0];
  const atras = transiciones.find((t) => t < actual);
  const puedeCancelar = cancelar != null && transiciones.includes(cancelar);
  const final = !transiciones.length && !reasignar;

  const abrir = (destino, modo) => {
    setAccion(accion?.modo === modo ? null : { destino, modo });
    setMotivo("");
    setNuevoResp("");
    setError(null);
  };
  const pideMotivo = accion && (accion.modo === "reasignar" || reglas.requiereMotivo(accion.destino, actual));

  const guardar = async () => {
    setConfirmando(false);
    try {
      setGuardando(true);
      await onGuardar({
        nuevoEstatus: accion.destino,
        motivo: motivo.trim() || undefined,
        loginNuevoResponsable: accion.modo === "reasignar" ? nuevoResp : undefined,
      });
      setAccion(null);
      setMotivo("");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGuardando(false);
    }
  };
  const intentar = () => {
    if (accion.modo === "reasignar" && (!nuevoResp || nuevoResp === responsableActual)) return setError("Elige al nuevo responsable.");
    if (pideMotivo && !motivo.trim()) return setError("El motivo es obligatorio para este cambio.");
    setError(null);
    if (reglas.destructivo(accion.destino) && accion.modo !== "reasignar") setConfirmando(true);
    else guardar();
  };

  const textoBoton = !accion
    ? ""
    : accion.modo === "reasignar"
      ? "Reasignar responsable"
      : accion.modo === "cancelar"
        ? `Cancelar ${tipo === "nc" ? "la NC" : "la acción"}`
        : `Confirmar: ${mapa[accion.destino].label}`;

  return (
    <section className="pnl" aria-label="Siguiente paso">
      <div className="paso__actual">
        <small>Estatus actual</small>
        <Riel tipo={tipo} id={actual} />
      </div>

      {final ? (
        <p className="paso__final">
          <i className="ti ti-lock" />
          {(tipo === "nc" ? [5, 6] : [5]).includes(actual)
            ? "Registro concluido. La bitácora conserva su trazabilidad."
            : "Tu rol no puede mover este registro."}
        </p>
      ) : (
        <div className="paso__cuerpo">
          {adelante != null && (
            <button
              type="button"
              className={`btn btn--lg btn--bloque${accion?.modo === "avanzar" ? "" : " btn--primario"}`}
              onClick={() => abrir(adelante, "avanzar")}
              aria-expanded={accion?.modo === "avanzar"}
            >
              <i className={`ti ${reglas.destructivo(adelante) ? "ti-lock-check" : "ti-arrow-right"}`} />
              {reglas.destructivo(adelante) ? `Cerrar ${tipo === "nc" ? "no conformidad" : "acción correctiva"}` : `Avanzar a «${mapa[adelante].label}»`}
            </button>
          )}
          {adelante == null && bloqueo && (
            <div className="paso__bloqueo">
              <i className="ti ti-hourglass" />
              {bloqueo}
            </div>
          )}
          {(atras != null || puedeCancelar || reasignar) && (
            <div className="paso__secundarias">
              {atras != null && (
                <button type="button" className="btn btn--fantasma btn--sm" onClick={() => abrir(atras, "regresar")}>
                  <i className="ti ti-arrow-back-up" /> Regresar a «{mapa[atras].label}»
                </button>
              )}
              {reasignar && (
                <button type="button" className="btn btn--fantasma btn--sm" onClick={() => abrir(actual, "reasignar")}>
                  <i className="ti ti-user-share" /> Reasignar
                </button>
              )}
              {puedeCancelar && (
                <button type="button" className="btn btn--fantasma btn--sm btn--peligro" onClick={() => abrir(cancelar, "cancelar")}>
                  <i className="ti ti-ban" /> Cancelar
                </button>
              )}
            </div>
          )}

          <div className={`paso__form${accion ? " is-abierto" : ""}`}>
            <div>
              {accion && (
                <div className="paso__form-in">
                  <b>
                    {accion.modo === "reasignar" ? "Nuevo responsable" : accion.modo === "regresar" ? `Regresar a «${mapa[accion.destino].label}»` : accion.modo === "cancelar" ? "Cancelar registro" : `Pasar a «${mapa[accion.destino].label}»`}
                  </b>
                  {accion.modo === "reasignar" && <SelectUsuario value={nuevoResp} onChange={setNuevoResp} excluir={responsableActual ? [responsableActual] : []} />}
                  {reglas.ayuda?.(accion.destino) && accion.modo !== "reasignar" && (
                    <p className="paso__nota t-brand">
                      <i className="ti ti-info-circle" />
                      {reglas.ayuda(accion.destino)}
                    </p>
                  )}
                  <textarea
                    className={`inp${error && !motivo.trim() ? " inp--error" : ""}`}
                    rows={3}
                    maxLength={2000}
                    value={motivo}
                    onChange={(e) => {
                      setMotivo(e.target.value);
                      setError(null);
                    }}
                    placeholder={pideMotivo ? "Motivo (obligatorio)" : "Comentario para la bitácora (opcional)"}
                    aria-label="Motivo"
                  />
                  {error && (
                    <span className="campo__error">
                      <i className="ti ti-alert-circle" /> {error}
                    </span>
                  )}
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button type="button" className="btn btn--sm" onClick={() => setAccion(null)} disabled={guardando}>
                      Descartar
                    </button>
                    <button
                      type="button"
                      className={`btn btn--sm ${accion.modo === "cancelar" ? "btn--peligro btn--solido" : "btn--primario"}`}
                      onClick={intentar}
                      disabled={guardando}
                    >
                      <i className={`ti ${guardando ? "ti-loader-2 giro" : "ti-check"}`} /> {textoBoton}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmando && (
        <Confirmar
          titulo={accion.modo === "cancelar" ? "¿Cancelar definitivamente?" : "¿Cerrar definitivamente?"}
          mensaje={`El registro pasará a «${mapa[accion.destino].label}» y ya no admitirá cambios de estatus. El movimiento queda en la bitácora y no se puede deshacer.`}
          textoConfirmar={accion.modo === "cancelar" ? "Sí, cancelar" : "Sí, cerrar"}
          onConfirmar={guardar}
          onCancelar={() => setConfirmando(false)}
          ocupado={guardando}
        />
      )}
    </section>
  );
}
