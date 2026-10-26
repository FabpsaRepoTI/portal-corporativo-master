// client/src/pages/gestionDesarrollo/components/NuevoProyectoModal.jsx
import { useState, useEffect } from "react";
import { crearProyecto, getCatalogos } from "../../../services/gestionDesarrollo";
import "./RegistrarAvanceModal.css"; // Reutiliza los mismos estilos base

export default function NuevoProyectoModal({ onClose, onCreado }) {
  const [form, setForm] = useState({
    nombre: "", objetivo: "", descripcion: "",
    areaSolicitante: "", loginResponsable: "",
    prioridad: "2", fechaCompromiso: "", fechaEstimadaLib: "",
  });
  const [tecnicos, setTecnicos] = useState([]);
  const [saving, setSaving]     = useState(false);
  const [error,  setError]      = useState("");

  useEffect(() => {
    getCatalogos().then((c) => setTecnicos(c.tecnicos ?? [])).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function handleCrear() {
    setError("");
    if (!form.nombre.trim())   return setError("El nombre del proyecto es obligatorio.");
    if (!form.objetivo.trim()) return setError("El objetivo del proyecto es obligatorio.");
    setSaving(true);
    try {
      await crearProyecto(form);
      onCreado();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ram-overlay" onClick={onClose}>
      <div className="ram-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ram-head">
          <div>
            <div className="ram-folio">Nuevo proyecto</div>
            <div className="ram-sub">Los campos marcados con * son obligatorios</div>
          </div>
          <button className="ram-close" onClick={onClose}>✕</button>
        </div>

        <div className="ram-body">
          <div className="ram-field">
            <label className="ram-label">Nombre del proyecto *</label>
            <input className="ram-input" value={form.nombre} onChange={set("nombre")} placeholder="Ej. Migración del módulo de Mantenimiento" />
          </div>
          <div className="ram-field">
            <label className="ram-label">Objetivo *</label>
            <textarea className="ram-textarea" rows={2} value={form.objetivo} onChange={set("objetivo")} placeholder="¿Para qué sirve este proyecto?" />
          </div>
          <div className="ram-field">
            <label className="ram-label">Descripción (opcional)</label>
            <textarea className="ram-textarea" rows={2} value={form.descripcion} onChange={set("descripcion")} placeholder="Contexto adicional" />
          </div>
          <div className="ram-row-2">
            <div className="ram-field">
              <label className="ram-label">Área solicitante</label>
              <input className="ram-input" value={form.areaSolicitante} onChange={set("areaSolicitante")} placeholder="Ej. Operaciones" />
            </div>
            <div className="ram-field">
              <label className="ram-label">Prioridad</label>
              <select className="ram-select" value={form.prioridad} onChange={set("prioridad")}>
                <option value="1">Alta</option>
                <option value="2">Media</option>
                <option value="3">Baja</option>
              </select>
            </div>
          </div>
          <div className="ram-field">
            <label className="ram-label">Responsable</label>
            <select className="ram-select" value={form.loginResponsable} onChange={set("loginResponsable")}>
              <option value="">— Sin asignar —</option>
              {tecnicos.map((t) => (
                <option key={t.login} value={t.login}>{t.nombre}</option>
              ))}
            </select>
          </div>
          <div className="ram-row-2">
            <div className="ram-field">
              <label className="ram-label">Fecha compromiso</label>
              <input className="ram-input" type="date" value={form.fechaCompromiso} onChange={set("fechaCompromiso")} />
            </div>
            <div className="ram-field">
              <label className="ram-label">Fecha est. liberación</label>
              <input className="ram-input" type="date" value={form.fechaEstimadaLib} onChange={set("fechaEstimadaLib")} />
            </div>
          </div>
          {error && <div className="ram-error">{error}</div>}
        </div>

        <div className="ram-foot">
          <button className="ram-btn ram-btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="ram-btn ram-btn--primary" onClick={handleCrear} disabled={saving}>
            {saving ? "Creando..." : "Crear proyecto"}
          </button>
        </div>
      </div>
    </div>
  );
}
