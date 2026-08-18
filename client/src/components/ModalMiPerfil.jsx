import { useContext, useEffect, useRef, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import "../style/ModalMiPerfil.css";

function apiFetch(url, options = {}) {
  const token = localStorage.getItem("fabpsa_token");
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

export default function ModalMiPerfil({ onClose }) {
  const { updatePicture } = useContext(AuthContext);
  const [perfil, setPerfil] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    apiFetch("/api/perfil")
      .then((r) => r.json())
      .then((data) => {
        setPerfil(data);
        if (data.picture) setPreview(data.picture);
      })
      .catch(console.error);
  }, []);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setToast({ type: "error", msg: "La imagen no debe superar 2 MB" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleGuardar() {
    if (!preview || preview === perfil?.picture) return onClose();
    setSaving(true);
    try {
      const r = await apiFetch("/api/perfil/foto", {
        method: "PUT",
        body: JSON.stringify({ picture: preview }),
      });
      if (!r.ok) throw new Error();
      updatePicture(preview);
      setToast({ type: "ok", msg: "Foto actualizada correctamente" });
      setTimeout(onClose, 1500);
    } catch {
      setToast({ type: "error", msg: "Error al guardar la foto" });
    } finally {
      setSaving(false);
    }
  }

  const campos = [
    { label: "Nombre", value: perfil?.name, icon: "ti-user" },
    { label: "Login", value: perfil?.login, icon: "ti-id" },
    { label: "Correo", value: perfil?.email, icon: "ti-mail" },
    { label: "Área", value: perfil?.area, icon: "ti-building" },
    { label: "Sitio", value: perfil?.sitio, icon: "ti-map-pin" },
  ];

  return (
    <div className="mmp-overlay" onClick={onClose}>
      <div className="mmp-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="mmp-header">
          <span>Mi perfil</span>
          <button className="mmp-close" onClick={onClose}>
            <i className="ti ti-x" />
          </button>
        </div>

        {/* Body */}
        <div className="mmp-body">
          {/* Avatar */}
          <div className="mmp-avatar-wrap">
            <div className="mmp-avatar" onClick={() => fileRef.current.click()}>
              {preview ? (
                <img src={preview} alt="foto de perfil" />
              ) : (
                <i className="ti ti-user" />
              )}
              <div className="mmp-avatar-overlay">
                <i className="ti ti-camera" />
              </div>
            </div>
            <span className="mmp-avatar-hint">Click para cambiar foto</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFile}
            />
          </div>

          {/* Campos readonly */}
          <div className="mmp-fields">
            {campos.map((f) => (
              <div className="mmp-field" key={f.label}>
                <label>{f.label}</label>
                <div className="mmp-field-val">
                  <i className={`ti ${f.icon}`} />
                  <span>{f.value ?? "—"}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Toast */}
          {toast && (
            <div className={`mmp-toast mmp-toast--${toast.type}`}>
              <i
                className={`ti ${toast.type === "ok" ? "ti-check" : "ti-alert-circle"}`}
              />
              {toast.msg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mmp-footer">
          <button
            className="mmp-btn-cancel"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            className="mmp-btn-save"
            onClick={handleGuardar}
            disabled={saving}
          >
            {saving ? (
              <>
                <i className="ti ti-loader-2 spin" /> Guardando…
              </>
            ) : (
              <>
                <i className="ti ti-device-floppy" /> Guardar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
