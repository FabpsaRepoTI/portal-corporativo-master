// pages/sit/components/VincularProveedorModal.jsx
// Busca un proveedor (o lo da de alta) y lo vincula al artículo.
// Props: codigoArticulo, empresa ('IAFSA' | 'FDNC'), onSuccess, onClose, showToast
import { useEffect, useState } from "react";
import SitModal from "./SitModal";
import { sitApi } from "../sitApi";
import "./VincularProveedorModal.css";

const TIPOS = { 1: "Principal", 2: "Alterno" };

export default function VincularProveedorModal({ codigoArticulo, empresa, onSuccess, onClose, showToast }) {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);
  const [modoNuevo, setModoNuevo] = useState(false);
  const [nuevo, setNuevo] = useState({ razonSocial: "", rfc: "", tipo: "1", esFabricante: false });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Búsqueda con retardo para no consultar en cada tecla
  useEffect(() => {
    if (modoNuevo) return;
    let vivo = true;
    setBuscando(true);
    const t = setTimeout(() => {
      sitApi(`/proveedores?busqueda=${encodeURIComponent(busqueda.trim())}`)
        .then((d) => vivo && setResultados(d || []))
        .catch((e) => vivo && setError(e.message))
        .finally(() => vivo && setBuscando(false));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [busqueda, modoNuevo]);

  const vincular = async (idProveedor) => {
    await sitApi(`/articulos/${encodeURIComponent(codigoArticulo)}/proveedores`, {
      method: "POST",
      body: { idProveedor, empresa },
    });
    showToast?.("Proveedor vinculado");
    onSuccess();
  };

  const confirmar = async () => {
    setError("");
    try {
      setGuardando(true);
      if (modoNuevo) {
        if (!nuevo.razonSocial.trim()) {
          setError("Captura la razón social.");
          return;
        }
        const prov = await sitApi("/proveedores", {
          method: "POST",
          body: {
            razonSocial: nuevo.razonSocial.trim(),
            rfc: nuevo.rfc.trim() || null,
            tipo: Number(nuevo.tipo),
            esFabricante: nuevo.esFabricante,
          },
        });
        await vincular(prov.idProveedor);
      } else {
        if (!seleccionado) {
          setError("Selecciona un proveedor de la lista.");
          return;
        }
        await vincular(seleccionado.idProveedor);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <SitModal
      titulo="Vincular proveedor"
      icono="ti-link"
      ancho={600}
      bloqueado={guardando}
      onClose={onClose}
      pie={
        <>
          <button className="sit-btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button className="sit-btn sit-btn--primary" onClick={confirmar} disabled={guardando || (!modoNuevo && !seleccionado)}>
            {guardando ? <i className="ti ti-loader-2 sit-spin" /> : <i className="ti ti-link" />}
            {modoNuevo ? " Crear y vincular" : " Vincular"}
          </button>
        </>
      }
    >
      {error && (
        <div className="sit-form-error" role="alert">
          <i className="ti ti-alert-circle" /> {error}
        </div>
      )}

      <div className="sit-vinc__modo">
        <button className={`sit-vinc__tab${!modoNuevo ? " is-active" : ""}`} onClick={() => setModoNuevo(false)} disabled={guardando}>
          <i className="ti ti-search" /> Buscar existente
        </button>
        <button className={`sit-vinc__tab${modoNuevo ? " is-active" : ""}`} onClick={() => setModoNuevo(true)} disabled={guardando}>
          <i className="ti ti-plus" /> Nuevo proveedor
        </button>
      </div>

      {!modoNuevo ? (
        <>
          <div className="sit-field">
            <input
              className="sit-input"
              placeholder="Razón social o RFC…"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setSeleccionado(null);
              }}
              autoFocus
            />
          </div>
          <div className="sit-vinc__lista" role="listbox">
            {buscando && !resultados ? (
              <div className="sit-state">
                <i className="ti ti-loader-2 sit-spin" />
              </div>
            ) : !resultados?.length ? (
              <div className="sit-state">
                <i className="ti ti-building-off" />
                <p>Sin proveedores. Puedes darlo de alta en “Nuevo proveedor”.</p>
              </div>
            ) : (
              resultados.map((p) => (
                <button
                  key={p.idProveedor}
                  role="option"
                  aria-selected={seleccionado?.idProveedor === p.idProveedor}
                  className={`sit-vinc__item${seleccionado?.idProveedor === p.idProveedor ? " is-sel" : ""}`}
                  onClick={() => setSeleccionado(p)}
                >
                  <i className="ti ti-building-factory-2" />
                  <span>
                    <strong>{p.razonSocial}</strong>
                    <small>
                      {p.rfc || "Sin RFC"} · {TIPOS[p.tipo]}
                      {p.esFabricante ? " · Fabricante" : ""}
                    </small>
                  </span>
                  {seleccionado?.idProveedor === p.idProveedor && <i className="ti ti-check sit-vinc__check" />}
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <div>
          <div className="sit-field">
            <label htmlFor="sit-razon">
              Razón social <span className="req">*</span>
            </label>
            <input id="sit-razon" className="sit-input" maxLength={300} value={nuevo.razonSocial} onChange={(e) => setNuevo({ ...nuevo, razonSocial: e.target.value })} disabled={guardando} autoFocus />
          </div>
          <div className="sit-field-row">
            <div className="sit-field">
              <label htmlFor="sit-rfc">RFC</label>
              <input id="sit-rfc" className="sit-input" maxLength={13} value={nuevo.rfc} onChange={(e) => setNuevo({ ...nuevo, rfc: e.target.value.toUpperCase() })} disabled={guardando} placeholder="Opcional" />
            </div>
            <div className="sit-field">
              <label htmlFor="sit-tipo">Tipo</label>
              <select id="sit-tipo" className="sit-input" value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value })} disabled={guardando}>
                <option value="1">Principal</option>
                <option value="2">Alterno</option>
              </select>
            </div>
          </div>
          <label className="sit-vinc__check-row">
            <input type="checkbox" checked={nuevo.esFabricante} onChange={(e) => setNuevo({ ...nuevo, esFabricante: e.target.checked })} disabled={guardando} />
            El proveedor también fabrica el artículo
          </label>
        </div>
      )}
    </SitModal>
  );
}
