// ─────────────────────────────────────────────
//  UsuariosPage.jsx
//  client/src/pages/admin/UsuariosPage.jsx
// ─────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import { useNavigate }  from "react-router-dom";
import { useAuth }      from "../../hooks/useAuth";   // AuthContext — sin useAuth hook si usas el patrón antiguo
import "./UsuariosPage.css";

/* ─── Constantes ──────────────────────────────── */
const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const SITIOS = [
  "SUR 121", "ALMACEN CENTRAL", "FDNC", "OCCIDENTE",
  "ORIENTE", "BAJIO", "NORTE", "TOLUCA", "PACIFICO", "SURESTE",
];

const FORM_VACIO = {
  login: "", pswd: "", name: "", email: "",
  sitio: "", area: "", phone: "", role: "",
};

/* ─── Helpers ─────────────────────────────────── */
function token() {
  return localStorage.getItem("fabpsa_token") ?? "";
}
function headers() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token()}` };
}

/* ─── Componente principal ────────────────────── */
export default function UsuariosPage() {
  const { user }   = useAuth();
  const navigate   = useNavigate();

  /* Guard frontend */
  useEffect(() => {
    const area = (user?.area ?? "").toUpperCase().trim();
    if (area !== "SISTEMAS") navigate("/", { replace: true });
  }, [user, navigate]);

  /* ── Estado tabla ── */
  const [usuarios,  setUsuarios]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [filtSitio, setFiltSitio] = useState("");
  const [filtArea,  setFiltArea]  = useState("");

  /* ── Estado modal ── */
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editando,   setEditando]   = useState(null);   // login string o null (crear)
  const [form,       setForm]       = useState(FORM_VACIO);
  const [formErr,    setFormErr]    = useState({});
  const [saving,     setSaving]     = useState(false);
  const [showPswd,   setShowPswd]   = useState(false);

  /* ── Toast ── */
  const [toast, setToast] = useState(null);   // { msg, type }
  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3800);
  }

  /* ── Cargar usuarios ── */
  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search)    params.set("search", search);
      if (filtSitio) params.set("sitio",  filtSitio);
      if (filtArea)  params.set("area",   filtArea);

      const res = await fetch(`${API}/api/usuarios?${params}`, { headers: headers() });
      if (!res.ok) throw new Error();
      setUsuarios(await res.json());
    } catch {
      showToast("Error al cargar usuarios.", "error");
    } finally {
      setLoading(false);
    }
  }, [search, filtSitio, filtArea]);

  useEffect(() => { cargar(); }, [cargar]);

  /* ── Abrir modal nuevo ── */
  function abrirNuevo() {
    setEditando(null);
    setForm(FORM_VACIO);
    setFormErr({});
    setShowPswd(false);
    setModalOpen(true);
  }

  /* ── Abrir modal editar ── */
  function abrirEditar(u) {
    setEditando(u.login);
    setForm({
      login: u.login,
      pswd:  "",
      name:  u.name  ?? "",
      email: u.email ?? "",
      sitio: u.sitio ?? "",
      area:  u.area  ?? "",
      phone: u.phone ?? "",
      role:  u.role  ?? "",
    });
    setFormErr({});
    setShowPswd(false);
    setModalOpen(true);
  }

  /* ── Validación ── */
  function validar() {
    const e = {};
    if (!form.login.trim())  e.login = "Requerido.";
    if (!editando && !form.pswd.trim()) e.pswd = "Requerido al crear usuario.";
    if (!form.name.trim())   e.name  = "Requerido.";
    if (!form.email.trim())  e.email = "Requerido.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Formato inválido.";
    if (!form.sitio)         e.sitio = "Selecciona un sitio.";
    if (!form.area.trim())   e.area  = "Requerido.";
    setFormErr(e);
    return Object.keys(e).length === 0;
  }

  /* ── Guardar (crear / editar) ── */
  async function guardar() {
    if (!validar()) return;
    setSaving(true);
    try {
      let res;
      if (editando) {
        // EDITAR
        res = await fetch(`${API}/api/usuarios/${editando}`, {
          method:  "PUT",
          headers: headers(),
          body:    JSON.stringify(form),
        });
      } else {
        // CREAR
        res = await fetch(`${API}/api/usuarios`, {
          method:  "POST",
          headers: headers(),
          body:    JSON.stringify({ ...form, login: form.login.toUpperCase().trim() }),
        });
      }

      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Error al guardar.", "error"); return; }

      showToast(editando ? "Usuario actualizado." : "Usuario creado correctamente.");
      setModalOpen(false);
      cargar();
    } catch {
      showToast("Error de conexión.", "error");
    } finally {
      setSaving(false);
    }
  }

  /* ── Toggle activo ── */
  async function toggleActivo(login, currentActive) {
    const nuevoEstado = currentActive !== "Y";
    try {
      const res = await fetch(`${API}/api/usuarios/${login}/activo`, {
        method:  "PATCH",
        headers: headers(),
        body:    JSON.stringify({ active: nuevoEstado }),
      });
      if (!res.ok) throw new Error();
      setUsuarios((prev) =>
        prev.map((u) => u.login === login ? { ...u, active: nuevoEstado ? "Y" : "N" } : u)
      );
      showToast(`Usuario ${nuevoEstado ? "activado" : "desactivado"}.`);
    } catch {
      showToast("Error al cambiar estado.", "error");
    }
  }

  /* ── Campo helper ── */
  function campo(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (formErr[key]) setFormErr((e) => ({ ...e, [key]: undefined }));
  }

  /* ── Áreas únicas para filtro ── */
  const areasUnicas = [...new Set(usuarios.map((u) => u.area).filter(Boolean))].sort();

  /* ─────────────────── RENDER ──────────────────── */
  return (
    <div className="usr-page">

      {/* Toast */}
      {toast && (
        <div className={`usr-toast usr-toast--${toast.type}`}>
          <i className={`ti ${toast.type === "success" ? "ti-circle-check" : "ti-alert-circle"}`} />
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="usr-header">
        <div className="usr-header-left">
          <div className="usr-eyebrow">
            <i className="ti ti-settings" aria-hidden="true" />
            Configuración · Usuarios
          </div>
          <h1 className="usr-title">Administración de usuarios</h1>
          <p className="usr-subtitle">Gestiona el acceso de los colaboradores al portal.</p>
        </div>
        <button className="usr-btn-primary" onClick={abrirNuevo}>
          <i className="ti ti-user-plus" aria-hidden="true" />
          Nuevo usuario
        </button>
      </div>

      {/* Toolbar */}
      <div className="usr-toolbar">
        <div className="usr-search">
          <i className="ti ti-search usr-search-icon" aria-hidden="true" />
          <input
            className="usr-input"
            placeholder="Buscar por nombre, login o correo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="usr-select"
          value={filtSitio}
          onChange={(e) => setFiltSitio(e.target.value)}
        >
          <option value="">Todos los sitios</option>
          {SITIOS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          className="usr-select"
          value={filtArea}
          onChange={(e) => setFiltArea(e.target.value)}
        >
          <option value="">Todas las áreas</option>
          {areasUnicas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>

        <button className="usr-btn-ghost" onClick={cargar} title="Refrescar">
          <i className="ti ti-refresh" aria-hidden="true" />
        </button>
      </div>

      {/* Tabla */}
      <div className="usr-table-wrap">
        {loading ? (
          <div className="usr-empty">
            <i className="ti ti-loader-2 usr-spin" />
            <span>Cargando usuarios…</span>
          </div>
        ) : usuarios.length === 0 ? (
          <div className="usr-empty">
            <i className="ti ti-users-group" style={{ fontSize: 36, opacity: .3 }} />
            <span>No se encontraron usuarios.</span>
          </div>
        ) : (
          <table className="usr-table">
            <thead>
              <tr>
                <th>Login</th>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Sitio</th>
                <th>Área</th>
                <th>Estado</th>
                <th style={{ width: 100 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.login} className={u.active !== "Y" ? "usr-row--inactive" : ""}>
                  <td><span className="usr-login-chip">{u.login}</span></td>
                  <td className="usr-name-cell">
                    <div className="usr-avatar">{u.name?.[0] ?? "?"}</div>
                    {u.name ?? "—"}
                  </td>
                  <td className="usr-muted">{u.email ?? "—"}</td>
                  <td>{u.sitio ?? "—"}</td>
                  <td><span className="usr-area-chip">{u.area ?? "—"}</span></td>
                  <td>
                    <button
                      className={`usr-status-toggle ${u.active === "Y" ? "usr-status-toggle--active" : "usr-status-toggle--inactive"}`}
                      onClick={() => toggleActivo(u.login, u.active)}
                      title={u.active === "Y" ? "Clic para desactivar" : "Clic para activar"}
                    >
                      <span className="usr-status-dot" />
                      {u.active === "Y" ? "Activo" : "Inactivo"}
                    </button>
                  </td>
                  <td>
                    <button className="usr-btn-edit" onClick={() => abrirEditar(u)} title="Editar usuario">
                      <i className="ti ti-edit" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="usr-footer-count">
        {!loading && `${usuarios.length} usuario${usuarios.length !== 1 ? "s" : ""} encontrado${usuarios.length !== 1 ? "s" : ""}.`}
      </div>

      {/* ─── MODAL ─────────────────────────────────── */}
      {modalOpen && (
        <div className="usr-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="usr-modal" role="dialog" aria-modal="true">

            {/* Modal header */}
            <div className="usr-modal-header">
              <div>
                <div className="usr-modal-eyebrow">
                  {editando ? "Editar usuario" : "Nuevo usuario"}
                </div>
                <h2 className="usr-modal-title">
                  {editando ? form.name || editando : "Crear cuenta de acceso"}
                </h2>
              </div>
              <button className="usr-modal-close" onClick={() => setModalOpen(false)} aria-label="Cerrar">
                <i className="ti ti-x" />
              </button>
            </div>

            {/* Modal body */}
            <div className="usr-modal-body">

              {/* LOGIN */}
              <div className="usr-field">
                <label className="usr-label">
                  Login <span className="usr-req">*</span>
                </label>
                <input
                  className={`usr-input ${formErr.login ? "usr-input--err" : ""}`}
                  value={form.login}
                  onChange={(e) => campo("login", e.target.value.toUpperCase())}
                  disabled={!!editando}
                  placeholder="Ej. EESPINOZA"
                  autoComplete="off"
                />
                {editando && <p className="usr-field-hint">El login no puede modificarse.</p>}
                {formErr.login && <p className="usr-field-err">{formErr.login}</p>}
              </div>

              {/* CONTRASEÑA */}
              <div className="usr-field">
                <label className="usr-label">
                  Contraseña {!editando && <span className="usr-req">*</span>}
                  {editando && <span className="usr-field-hint" style={{ marginLeft: 6 }}>Dejar vacío para no cambiar</span>}
                </label>
                <div className="usr-password-wrap">
                  <input
                    className={`usr-input usr-input--password ${formErr.pswd ? "usr-input--err" : ""}`}
                    type={showPswd ? "text" : "password"}
                    value={form.pswd}
                    onChange={(e) => campo("pswd", e.target.value)}
                    placeholder={editando ? "••••••••" : "Nueva contraseña"}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="usr-pswd-eye"
                    onClick={() => setShowPswd((v) => !v)}
                    tabIndex={-1}
                    title={showPswd ? "Ocultar" : "Mostrar"}
                  >
                    <i className={`ti ${showPswd ? "ti-eye-off" : "ti-eye"}`} />
                  </button>
                </div>
                {formErr.pswd && <p className="usr-field-err">{formErr.pswd}</p>}
              </div>

              {/* NOMBRE */}
              <div className="usr-field">
                <label className="usr-label">Nombre completo <span className="usr-req">*</span></label>
                <input
                  className={`usr-input ${formErr.name ? "usr-input--err" : ""}`}
                  value={form.name}
                  onChange={(e) => campo("name", e.target.value)}
                  placeholder="Ej. Eric Espinoza"
                />
                {formErr.name && <p className="usr-field-err">{formErr.name}</p>}
              </div>

              {/* EMAIL */}
              <div className="usr-field">
                <label className="usr-label">Correo electrónico <span className="usr-req">*</span></label>
                <input
                  className={`usr-input ${formErr.email ? "usr-input--err" : ""}`}
                  type="email"
                  value={form.email}
                  onChange={(e) => campo("email", e.target.value)}
                  placeholder="usuario@fabpsa.com.mx"
                />
                {formErr.email && <p className="usr-field-err">{formErr.email}</p>}
              </div>

              {/* SITIO + ÁREA en grid */}
              <div className="usr-field-row">
                <div className="usr-field">
                  <label className="usr-label">Sitio <span className="usr-req">*</span></label>
                  <select
                    className={`usr-select usr-select--full ${formErr.sitio ? "usr-input--err" : ""}`}
                    value={form.sitio}
                    onChange={(e) => campo("sitio", e.target.value)}
                  >
                    <option value="">Seleccionar…</option>
                    {SITIOS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {formErr.sitio && <p className="usr-field-err">{formErr.sitio}</p>}
                </div>

                <div className="usr-field">
                  <label className="usr-label">Área <span className="usr-req">*</span></label>
                  <input
                    className={`usr-input ${formErr.area ? "usr-input--err" : ""}`}
                    value={form.area}
                    onChange={(e) => campo("area", e.target.value.toUpperCase())}
                    placeholder="Ej. SISTEMAS"
                  />
                  {formErr.area && <p className="usr-field-err">{formErr.area}</p>}
                </div>
              </div>

              {/* TELÉFONO (opcional) */}
              <div className="usr-field">
                <label className="usr-label">Teléfono <span className="usr-opt">(opcional)</span></label>
                <input
                  className="usr-input"
                  value={form.phone}
                  onChange={(e) => campo("phone", e.target.value)}
                  placeholder="Ej. 55 1234 5678"
                />
              </div>

            </div>

            {/* Modal footer */}
            <div className="usr-modal-footer">
              <button className="usr-btn-ghost" onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button className="usr-btn-primary" onClick={guardar} disabled={saving}>
                {saving
                  ? <><i className="ti ti-loader-2 usr-spin" /> Guardando…</>
                  : <><i className="ti ti-device-floppy" /> {editando ? "Guardar cambios" : "Crear usuario"}</>
                }
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
