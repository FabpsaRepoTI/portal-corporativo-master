// ─────────────────────────────────────────────
//  UsuariosPage.jsx
//  client/src/pages/admin/UsuariosPage.jsx
// ─────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import "./UsuariosPage.css";

//const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const API = import.meta.env.VITE_API_URL ?? "";
const SITIOS = [
  "SUR 121",
  "ALMACEN CENTRAL",
  "FDNC",
  "OCCIDENTE",
  "ORIENTE",
  "BAJIO",
  "NORTE",
  "TOLUCA",
  "PACIFICO",
  "SURESTE",
];

const FORM_VACIO = {
  login: "",
  pswd: "",
  name: "",
  email: "",
  sitio: "",
  area: "",
  phone: "",
  role: "",
};

function token() {
  return localStorage.getItem("fabpsa_token") ?? "";
}
function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token()}`,
  };
}

export default function UsuariosPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if ((user?.area ?? "").toUpperCase().trim() !== "SISTEMAS")
      navigate("/", { replace: true });
  }, [user, navigate]);

  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtSitio, setFiltSitio] = useState("");
  const [filtArea, setFiltArea] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [formErr, setFormErr] = useState({});
  const [saving, setSaving] = useState(false);
  const [showPswd, setShowPswd] = useState(false);

  const [areaOpen, setAreaOpen] = useState(false);
  const [areaIdx, setAreaIdx] = useState(-1);
  const areaRef = useRef(null);
  const areaListRef = useRef(null);

  const [emailDup, setEmailDup] = useState(null);
  const [toast, setToast] = useState(null);

  // ── NUEVO: estado modal accesos ──────────────
  const [accesosModal, setAccesosModal] = useState(false);
  const [accesosLogin, setAccesosLogin] = useState(null);
  const [accesosNombre, setAccesosNombre] = useState("");
  const [catalogoMods, setCatalogoMods] = useState([]);
  const [modulosUser, setModulosUser] = useState([]);
  const [savingAccesos, setSavingAccesos] = useState(false);
  const [loadingAccesos, setLoadingAccesos] = useState(false);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3800);
  }

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filtSitio) params.set("sitio", filtSitio);
      if (filtArea) params.set("area", filtArea);
      const res = await fetch(`${API}/api/usuarios?${params}`, {
        headers: headers(),
      });
      if (!res.ok) throw new Error();
      setUsuarios(await res.json());
    } catch {
      showToast("Error al cargar usuarios.", "error");
    } finally {
      setLoading(false);
    }
  }, [search, filtSitio, filtArea]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const areasUnicas = [
    ...new Set(usuarios.map((u) => u.area).filter(Boolean)),
  ].sort();
  const areasSugg = form.area.trim()
    ? areasUnicas.filter(
        (a) =>
          a.toUpperCase().includes(form.area.toUpperCase()) &&
          a.toUpperCase() !== form.area.toUpperCase(),
      )
    : [];

  function checkEmail(email) {
    if (!email.trim()) {
      setEmailDup(null);
      return;
    }
    const found = usuarios.find(
      (u) =>
        u.email?.toLowerCase() === email.toLowerCase() && u.login !== editando,
    );
    setEmailDup(found ? { login: found.login, email: found.email } : null);
  }

  function abrirNuevo() {
    setEditando(null);
    setForm(FORM_VACIO);
    setFormErr({});
    setShowPswd(false);
    setEmailDup(null);
    setModalOpen(true);
  }
  function abrirEditar(u) {
    setEditando(u.login);
    setForm({
      login: u.login,
      pswd: "",
      name: u.name ?? "",
      email: u.email ?? "",
      sitio: u.sitio ?? "",
      area: u.area ?? "",
      phone: u.phone ?? "",
      role: u.role ?? "",
    });
    setFormErr({});
    setShowPswd(false);
    setEmailDup(null);
    setModalOpen(true);
  }

  // ── NUEVO: abrir modal accesos ───────────────
  async function abrirAccesos(u) {
    setAccesosLogin(u.login);
    setAccesosNombre(u.name ?? u.login);
    setAccesosModal(true);
    setLoadingAccesos(true);
    try {
      const [catRes, usrRes] = await Promise.all([
        fetch(`${API}/api/permisos/modulos`, { headers: headers() }),
        fetch(`${API}/api/permisos/usuarios/${u.login}/modulos`, {
          headers: headers(),
        }),
      ]);

      const catData = await catRes.json();
      const usrData = await usrRes.json();

      setCatalogoMods(Array.isArray(catData) ? catData : []);
      setModulosUser(Array.isArray(usrData) ? usrData : []);
    } catch {
      showToast("Error al cargar módulos.", "error");
      setAccesosModal(false);
    } finally {
      setLoadingAccesos(false);
    }
  }

  function toggleModulo(clave) {
    setModulosUser((prev) =>
      prev.includes(clave) ? prev.filter((m) => m !== clave) : [...prev, clave],
    );
  }

  async function guardarAccesos() {
    setSavingAccesos(true);
    try {
      const res = await fetch(
        `${API}/api/permisos/usuarios/${accesosLogin}/modulos`,
        {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({ modulos: modulosUser }),
        },
      );
      if (!res.ok) throw new Error();
      showToast("Accesos actualizados correctamente.");
      setAccesosModal(false);
    } catch {
      showToast("Error al guardar accesos.", "error");
    } finally {
      setSavingAccesos(false);
    }
  }

  function validar() {
    const e = {};
    if (!form.login.trim()) e.login = "Requerido.";
    if (!editando && !form.pswd.trim()) e.pswd = "Requerido al crear usuario.";
    if (!form.name.trim()) e.name = "Requerido.";
    if (!form.email.trim()) e.email = "Requerido.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "Formato inválido.";
    if (emailDup)
      e.email = `Este correo ya está registrado con ${emailDup.login}.`;
    if (!form.sitio) e.sitio = "Selecciona un sitio.";
    if (!form.area.trim()) e.area = "Requerido.";
    setFormErr(e);
    return Object.keys(e).length === 0;
  }

  async function guardar() {
    if (!validar()) return;
    setSaving(true);
    try {
      let res;
      if (editando) {
        res = await fetch(`${API}/api/usuarios/${editando}`, {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify(form),
        });
      } else {
        res = await fetch(`${API}/api/usuarios`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            ...form,
            login: form.login.toUpperCase().trim(),
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Error al guardar.", "error");
        return;
      }
      showToast(
        editando ? "Usuario actualizado." : "Usuario creado correctamente.",
      );
      setModalOpen(false);
      cargar();
    } catch {
      showToast("Error de conexión.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActivo(login, currentActive) {
    const nuevoEstado = currentActive !== "Y";
    try {
      const res = await fetch(`${API}/api/usuarios/${login}/activo`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ active: nuevoEstado }),
      });
      if (!res.ok) throw new Error();
      setUsuarios((prev) =>
        prev.map((u) =>
          u.login === login ? { ...u, active: nuevoEstado ? "Y" : "N" } : u,
        ),
      );
      showToast(`Usuario ${nuevoEstado ? "activado" : "desactivado"}.`);
    } catch {
      showToast("Error al cambiar estado.", "error");
    }
  }

  function campo(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (formErr[key]) setFormErr((e) => ({ ...e, [key]: undefined }));
  }

  function handleAreaKey(e) {
    if (!areaOpen || areasSugg.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAreaIdx((i) => Math.min(i + 1, areasSugg.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAreaIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && areaIdx >= 0) {
      e.preventDefault();
      selectArea(areasSugg[areaIdx]);
    } else if (e.key === "Escape") setAreaOpen(false);
  }
  function selectArea(val) {
    campo("area", val);
    setAreaOpen(false);
    setAreaIdx(-1);
  }

  useEffect(() => {
    function h(e) {
      if (areaRef.current && !areaRef.current.contains(e.target))
        setAreaOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="usr-page">
      {toast && (
        <div className={`usr-toast usr-toast--${toast.type}`}>
          <i
            className={`ti ${toast.type === "success" ? "ti-circle-check" : "ti-alert-circle"}`}
          />
          {toast.msg}
        </div>
      )}

      <div className="usr-header">
        <div className="usr-header-left">
          <div className="usr-eyebrow">
            <i className="ti ti-settings" /> Configuración · Usuarios
          </div>
          <h1 className="usr-title">Administración de usuarios</h1>
          <p className="usr-subtitle">
            Gestiona el acceso de los colaboradores al portal.
          </p>
        </div>
        <button className="usr-btn-primary" onClick={abrirNuevo}>
          <i className="ti ti-user-plus" /> Nuevo usuario
        </button>
      </div>

      <div className="usr-toolbar">
        <div className="usr-search">
          <i className="ti ti-search usr-search-icon" />
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
          {SITIOS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="usr-select"
          value={filtArea}
          onChange={(e) => setFiltArea(e.target.value)}
        >
          <option value="">Todas las áreas</option>
          {areasUnicas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <button className="usr-btn-ghost" onClick={cargar} title="Refrescar">
          <i className="ti ti-refresh" />
        </button>
      </div>

      <div className="usr-table-wrap">
        {loading ? (
          <div className="usr-empty">
            <i className="ti ti-loader-2 usr-spin" />
            <span>Cargando usuarios…</span>
          </div>
        ) : usuarios.length === 0 ? (
          <div className="usr-empty">
            <i
              className="ti ti-users-group"
              style={{ fontSize: 36, opacity: 0.3 }}
            />
            <span>No se encontraron usuarios.</span>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <table className="usr-table usr-desktop-only">
              <thead>
                <tr>
                  <th>Login</th>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Sitio</th>
                  <th>Área</th>
                  <th>Estado</th>
                  <th style={{ width: 120 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr
                    key={u.login}
                    className={u.active !== "Y" ? "usr-row--inactive" : ""}
                  >
                    <td>
                      <span className="usr-login-chip">{u.login}</span>
                    </td>
                    <td className="usr-name-cell">
                      <div className="usr-avatar">{u.name?.[0] ?? "?"}</div>
                      {u.name ?? "—"}
                    </td>
                    <td className="usr-muted">{u.email ?? "—"}</td>
                    <td>{u.sitio ?? "—"}</td>
                    <td>
                      <span className="usr-area-chip">{u.area ?? "—"}</span>
                    </td>
                    <td>
                      <button
                        className={`usr-status-toggle ${u.active === "Y" ? "usr-status-toggle--active" : "usr-status-toggle--inactive"}`}
                        onClick={() => toggleActivo(u.login, u.active)}
                      >
                        <span className="usr-status-dot" />
                        {u.active === "Y" ? "Activo" : "Inactivo"}
                      </button>
                    </td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <button
                        className="usr-btn-edit"
                        onClick={() => abrirEditar(u)}
                        title="Editar"
                      >
                        <i className="ti ti-edit" />
                      </button>
                      <button
                        className="usr-btn-edit"
                        onClick={() => abrirAccesos(u)}
                        title="Accesos"
                      >
                        <i className="ti ti-shield-lock" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile */}
            <div className="usr-cards usr-mobile-only">
              {usuarios.map((u) => (
                <div
                  key={u.login}
                  className={`usr-card ${u.active !== "Y" ? "usr-card--inactive" : ""}`}
                >
                  <div className="usr-card-top">
                    <div className="usr-avatar">{u.name?.[0] ?? "?"}</div>
                    <div className="usr-card-main">
                      <div className="usr-card-name">{u.name ?? "—"}</div>
                      <span className="usr-login-chip">{u.login}</span>
                    </div>
                    <button
                      className={`usr-status-toggle ${u.active === "Y" ? "usr-status-toggle--active" : "usr-status-toggle--inactive"}`}
                      onClick={() => toggleActivo(u.login, u.active)}
                    >
                      <span className="usr-status-dot" />
                      {u.active === "Y" ? "Activo" : "Inactivo"}
                    </button>
                  </div>
                  <div className="usr-card-details">
                    <div className="usr-card-row">
                      <i className="ti ti-mail" />
                      <span className="usr-muted">{u.email ?? "—"}</span>
                    </div>
                    <div className="usr-card-row">
                      <i className="ti ti-map-pin" />
                      <span>{u.sitio ?? "—"}</span>
                    </div>
                    <div className="usr-card-row">
                      <i className="ti ti-building" />
                      <span className="usr-area-chip">{u.area ?? "—"}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="usr-card-edit"
                      onClick={() => abrirEditar(u)}
                    >
                      <i className="ti ti-edit" /> Editar
                    </button>
                    {/* NUEVO */}
                    <button
                      className="usr-card-edit"
                      onClick={() => abrirAccesos(u)}
                    >
                      <i className="ti ti-shield-lock" /> Accesos
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="usr-footer-count">
        {!loading &&
          `${usuarios.length} usuario${usuarios.length !== 1 ? "s" : ""}`}
      </div>

      {/* ─── MODAL EDITAR/CREAR ─────────────────── */}
      {modalOpen && (
        <div
          className="usr-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="usr-modal" role="dialog" aria-modal="true">
            <div className="usr-modal-header">
              <div>
                <div className="usr-modal-eyebrow">
                  {editando ? "Editar usuario" : "Nuevo usuario"}
                </div>
                <h2 className="usr-modal-title">
                  {editando ? form.name || editando : "Crear cuenta de acceso"}
                </h2>
              </div>
              <button
                className="usr-modal-close"
                onClick={() => setModalOpen(false)}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            <div className="usr-modal-body">
              <div className="usr-field">
                <label className="usr-label">
                  Login <span className="usr-req">*</span>
                </label>
                <input
                  className={`usr-input ${formErr.login ? "usr-input--err" : ""}`}
                  value={form.login}
                  onChange={(e) =>
                    campo(
                      "login",
                      e.target.value.toUpperCase().replace(/\s/g, ""),
                    )
                  }
                  disabled={!!editando}
                  placeholder="Ej. EESPINOZA"
                  autoComplete="off"
                  style={{ textTransform: "uppercase" }}
                />
                {editando && (
                  <p className="usr-field-hint">
                    El login no puede modificarse.
                  </p>
                )}
                {formErr.login && (
                  <p className="usr-field-err">{formErr.login}</p>
                )}
              </div>

              <div className="usr-field">
                <label className="usr-label">
                  Contraseña {!editando && <span className="usr-req">*</span>}
                  {editando && (
                    <span className="usr-field-hint" style={{ marginLeft: 6 }}>
                      Dejar vacío para no cambiar
                    </span>
                  )}
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
                  >
                    <i className={`ti ${showPswd ? "ti-eye-off" : "ti-eye"}`} />
                  </button>
                </div>
                {formErr.pswd && (
                  <p className="usr-field-err">{formErr.pswd}</p>
                )}
              </div>

              <div className="usr-field">
                <label className="usr-label">
                  Nombre completo <span className="usr-req">*</span>
                </label>
                <input
                  className={`usr-input ${formErr.name ? "usr-input--err" : ""}`}
                  value={form.name}
                  onChange={(e) => campo("name", e.target.value)}
                  placeholder="Ej. Eric Espinoza"
                />
                {formErr.name && (
                  <p className="usr-field-err">{formErr.name}</p>
                )}
              </div>

              <div className="usr-field">
                <label className="usr-label">
                  Correo electrónico <span className="usr-req">*</span>
                </label>
                <input
                  className={`usr-input ${formErr.email || emailDup ? "usr-input--err" : ""}`}
                  type="email"
                  value={form.email}
                  onChange={(e) => {
                    campo("email", e.target.value);
                    checkEmail(e.target.value);
                  }}
                  onBlur={() => checkEmail(form.email)}
                  placeholder="usuario@fabpsa.com.mx"
                />
                {emailDup && (
                  <p className="usr-field-err">
                    Este correo ya está registrado con el usuario{" "}
                    <strong>{emailDup.login}</strong>.
                  </p>
                )}
                {formErr.email && !emailDup && (
                  <p className="usr-field-err">{formErr.email}</p>
                )}
              </div>

              <div className="usr-field-row">
                <div className="usr-field">
                  <label className="usr-label">
                    Sitio <span className="usr-req">*</span>
                  </label>
                  <select
                    className={`usr-select usr-select--full ${formErr.sitio ? "usr-input--err" : ""}`}
                    value={form.sitio}
                    onChange={(e) => campo("sitio", e.target.value)}
                  >
                    <option value="">Seleccionar…</option>
                    {SITIOS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {formErr.sitio && (
                    <p className="usr-field-err">{formErr.sitio}</p>
                  )}
                </div>

                <div className="usr-field" ref={areaRef}>
                  <label className="usr-label">
                    Área <span className="usr-req">*</span>
                  </label>
                  <div className="usr-area-wrap">
                    <input
                      className={`usr-input ${formErr.area ? "usr-input--err" : ""}`}
                      value={form.area}
                      onChange={(e) => {
                        campo("area", e.target.value.toUpperCase());
                        setAreaOpen(true);
                        setAreaIdx(-1);
                      }}
                      onFocus={() => {
                        if (form.area.trim()) setAreaOpen(true);
                      }}
                      onKeyDown={handleAreaKey}
                      placeholder="Ej. SISTEMAS"
                      style={{ textTransform: "uppercase" }}
                      autoComplete="off"
                    />
                    {areaOpen && areasSugg.length > 0 && (
                      <div className="usr-area-dropdown" ref={areaListRef}>
                        {areasSugg.map((a, i) => (
                          <div
                            key={a}
                            className={`usr-area-opt ${i === areaIdx ? "usr-area-opt--active" : ""}`}
                            onMouseDown={() => selectArea(a)}
                          >
                            {a}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {formErr.area && (
                    <p className="usr-field-err">{formErr.area}</p>
                  )}
                </div>
              </div>

              <div className="usr-field">
                <label className="usr-label">
                  Teléfono <span className="usr-opt">(opcional)</span>
                </label>
                <input
                  className="usr-input"
                  value={form.phone}
                  onChange={(e) => campo("phone", e.target.value)}
                  placeholder="Ej. 55 1234 5678"
                />
              </div>
            </div>

            <div className="usr-modal-footer">
              <button
                className="usr-btn-ghost"
                onClick={() => setModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="usr-btn-primary"
                onClick={guardar}
                disabled={saving || !!emailDup}
              >
                {saving ? (
                  <>
                    <i className="ti ti-loader-2 usr-spin" /> Guardando…
                  </>
                ) : (
                  <>
                    <i className="ti ti-device-floppy" />{" "}
                    {editando ? "Guardar cambios" : "Crear usuario"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL ACCESOS ──────────────────────── */}
      {accesosModal && (
        <div
          className="usr-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAccesosModal(false);
          }}
        >
          <div className="usr-modal" role="dialog" aria-modal="true">
            <div className="usr-modal-header">
              <div>
                <div className="usr-modal-eyebrow">Módulos y accesos</div>
                <h2 className="usr-modal-title">{accesosNombre}</h2>
              </div>
              <button
                className="usr-modal-close"
                onClick={() => setAccesosModal(false)}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            <div className="usr-modal-body">
              {loadingAccesos ? (
                <div className="usr-empty">
                  <i className="ti ti-loader-2 usr-spin" />
                  <span>Cargando módulos…</span>
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {catalogoMods.map((mod) => {
                    const tiene = modulosUser.includes(mod.clave);
                    return (
                      <div
                        key={mod.clave}
                        onClick={() => toggleModulo(mod.clave)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "12px 16px",
                          borderRadius: 10,
                          cursor: "pointer",
                          border: `1px solid ${tiene ? "var(--primary)" : "var(--border)"}`,
                          background: tiene
                            ? "color-mix(in srgb, var(--primary) 10%, transparent)"
                            : "var(--bg-elevated)",
                          transition: "all 0.15s",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <i
                            className={`ti ${mod.icono}`}
                            style={{
                              fontSize: 20,
                              color: tiene
                                ? "var(--primary)"
                                : "var(--text-muted)",
                            }}
                          />
                          <span
                            style={{ fontWeight: 500, color: "var(--text-h)" }}
                          >
                            {mod.nombre}
                          </span>
                        </div>
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 6,
                            border: `2px solid ${tiene ? "var(--primary)" : "var(--border)"}`,
                            background: tiene
                              ? "var(--primary)"
                              : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {tiene && (
                            <i
                              className="ti ti-check"
                              style={{ fontSize: 12, color: "#fff" }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="usr-modal-footer">
              <button
                className="usr-btn-ghost"
                onClick={() => setAccesosModal(false)}
              >
                Cancelar
              </button>
              <button
                className="usr-btn-primary"
                onClick={guardarAccesos}
                disabled={savingAccesos || loadingAccesos}
              >
                {savingAccesos ? (
                  <>
                    <i className="ti ti-loader-2 usr-spin" /> Guardando…
                  </>
                ) : (
                  <>
                    <i className="ti ti-shield-check" /> Guardar accesos
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
