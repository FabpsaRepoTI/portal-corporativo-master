import PageHero from "../../components/PageHero";
import arteHero from "../../assets/hero-aplicativos.svg";
import useUsuariosAccess from '../../hooks/useUsuariosAccess';
import {formatearNombreCorto, esNombreCorto} from '../../utils/nombreCorto';
// ─────────────────────────────────────────────
//  UsuariosPage.jsx
//  client/src/pages/admin/UsuariosPage.jsx
// ─────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./UsuariosPage.css";

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
  "PLANTA",
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
  picture: null,
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

// ── Avatar reutilizable ──────────────────────────────────────
function UserAvatar({ user: u, size = 30, radius = 8 }) {
  if (u?.picture) {
    return (
      <img
        src={u.picture}
        alt={u.name ?? u.login}
        style={{
          width: size,
          height: size,
          minWidth: size,
          borderRadius: radius,
          objectFit: "cover",
          objectPosition: "center",
          flexShrink: 0,
          display: "block",
          overflow: "hidden",
        }}
      />
    );
  }
  const parts = (u?.name ?? "?").trim().split(" ").filter(Boolean);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : (parts[0]?.[0] ?? "?").toUpperCase();

  return (
    <div
      className="usr-avatar"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: size * 0.4,
      }}
    >
      {initials}
    </div>
  );
}

export default function UsuariosPage() {
  const navigate = useNavigate();
  const capacidades = useUsuariosAccess();
  useEffect(() => {
    if (!capacidades.loading && !capacidades.puedeVerUsuarios) navigate('/', {replace:true});
  }, [capacidades.loading, capacidades.puedeVerUsuarios, navigate]);

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
  const [currentPswd, setCurrentPswd] = useState(null);
  const [loadingPswd, setLoadingPswd] = useState(false);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [fotoFile, setFotoFile] = useState(null);
  const fotoInputRef = useRef(null);

  const [areaOpen, setAreaOpen] = useState(false);
  const [areaIdx, setAreaIdx] = useState(-1);
  const areaRef = useRef(null);
  const areaListRef = useRef(null);

  const [emailDup, setEmailDup] = useState(null);
  const [toast, setToast] = useState(null);
  const [justCreated, setJustCreated] = useState(null);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3800);
  }

  const cargar = useCallback(async () => {
    if (!capacidades.puedeVerUsuarios) {setUsuarios([]);setLoading(false);return;}
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
  }, [search, filtSitio, filtArea, capacidades.puedeVerUsuarios]);

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
    if (!capacidades.puedeCrear) return;
    setEditando(null);
    setForm(FORM_VACIO);
    setFormErr({});
    setEmailDup(null);
    setFotoPreview(null);
    setFotoFile(null);
    setJustCreated(null);
    setCurrentPswd(null);
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
      picture: null,
    });
    setFormErr({});
    setEmailDup(null);
    setFotoPreview(u.picture ?? null);
    setFotoFile(null);
    setJustCreated(null);
    setCurrentPswd(null);
    setModalOpen(true);
  }

  async function verContrasenaActual() {
    if (currentPswd !== null) {
      setCurrentPswd(null);
      return;
    }
    setLoadingPswd(true);
    try {
      const res = await fetch(`${API}/api/usuarios/${editando}/password`, {
        headers: headers(),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCurrentPswd(data.pswd ?? "");
    } catch {
      showToast("No se pudo consultar la contraseña actual.", "error");
    } finally {
      setLoadingPswd(false);
    }
  }

  async function copiarAccesos(login, pswd) {
    const texto = `Usuario: ${login}\nContraseña: ${pswd}`;
    try {
      await navigator.clipboard.writeText(texto);
      showToast("Accesos copiados al portapapeles.");
    } catch {
      showToast("No se pudo copiar al portapapeles.", "error");
    }
  }

  function handleFotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast("La imagen no debe superar 2 MB.", "error");
      return;
    }
    setFotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setFotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  function quitarFoto() {
    setFotoPreview(null);
    setFotoFile(null);
    setForm((f) => ({ ...f, picture: "" }));
    if (fotoInputRef.current) fotoInputRef.current.value = "";
  }

  // ── Abrir modal de accesos ───────────────────────────────
  function abrirAccesosFixed(u) {
    if (capacidades.puedeAsignarPermisos) navigate('/configuracion/accesos?usuario='+encodeURIComponent(u.login));
  }

  function validar() {
    const e = {};
    if (!form.login.trim()) e.login = "Requerido.";
    if (!editando && !form.pswd.trim()) e.pswd = "Requerido al crear usuario.";
    if (!esNombreCorto(form.name)) e.name = "Escribe un solo nombre y un apellido. Ejemplo: Juan Ramírez.";
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
    if (!editando && !capacidades.puedeCrear) return;
    if (!validar()) return;
    setSaving(true);
    try {
      let res;

      if (editando) {
        res = await fetch(`${API}/api/usuarios/${editando}`, {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({ ...form, name: formatearNombreCorto(form.name), picture: undefined }),
        });
      } else {
        res = await fetch(`${API}/api/usuarios`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            ...form,
            name: formatearNombreCorto(form.name),
            login: form.login.toUpperCase().trim(),
            picture: undefined,
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Error al guardar.", "error");
        return;
      }

      const loginGuardado = editando ?? data.login;

      if (fotoFile && loginGuardado) {
        const fd = new FormData();
        fd.append("picture", fotoFile);
        fd.append("login", loginGuardado);
        await fetch(`${API}/api/usuarios/${loginGuardado}/foto`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token()}` },
          body: fd,
        });
      }

      if (form.picture === "" && !fotoFile && editando) {
        await fetch(`${API}/api/usuarios/${editando}`, {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({ ...form, picture: null }),
        });
      }

      showToast(
        editando ? "Usuario actualizado." : "Usuario creado correctamente.",
      );
      if (editando) {
        setModalOpen(false);
      } else {
        setJustCreated(loginGuardado);
      }
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

  if (!capacidades.puedeVerUsuarios) return null;
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

      <PageHero arte={arteHero} eyebrow="Administración · FABPSA" titulo="Administración de" resalte="usuarios" sub="Alta, edición y estado de las cuentas del portal." volver={{ to: "/", label: "Volver al inicio" }} />
      <div className="usr-header usr-header--acciones">
        {capacidades.puedeCrear && <button className="usr-btn-primary" onClick={abrirNuevo}>
          <i className="ti ti-user-plus" /> Nuevo usuario
        </button>}
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
            {/* ── Desktop ── */}
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
                      <UserAvatar user={u} size={30} radius={8} />
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
                      {capacidades.puedeAsignarPermisos && <button
                        className="usr-btn-edit"
                        onClick={() => abrirAccesosFixed(u)}
                        title="Accesos"
                      >
                        <i className="ti ti-shield-lock" />
                      </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── Mobile cards ── */}
            <div className="usr-cards usr-mobile-only">
              {usuarios.map((u) => (
                <div
                  key={u.login}
                  className={`usr-card ${u.active !== "Y" ? "usr-card--inactive" : ""}`}
                >
                  <div className="usr-card-top">
                    <UserAvatar user={u} size={36} radius={10} />
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
                    {capacidades.puedeAsignarPermisos && <button
                      className="usr-card-edit"
                      onClick={() => abrirAccesosFixed(u)}
                    >
                      <i className="ti ti-shield-lock" /> Accesos
                    </button>}
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
                  {justCreated ? "Usuario creado" : editando ? "Editar usuario" : "Nuevo usuario"}
                </div>
                <h2 className="usr-modal-title">
                  {justCreated ? justCreated : editando ? form.name || editando : "Crear cuenta de acceso"}
                </h2>
              </div>
              <button
                className="usr-modal-close"
                onClick={() => setModalOpen(false)}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            {justCreated ? (
              <>
                <div className="usr-modal-body">
                  <p className="usr-field-hint">
                    El usuario <strong>{justCreated}</strong> quedó creado sin módulos asignados. Puedes darle acceso ahora o hacerlo después desde la lista.
                  </p>
                </div>
                <div className="usr-modal-footer">
                  <button className="usr-btn-ghost" onClick={() => setModalOpen(false)}>
                    Asignar después
                  </button>
                  <button
                    className="usr-btn-primary"
                    onClick={() => {
                      setModalOpen(false);
                      navigate('/configuracion/accesos?usuario=' + encodeURIComponent(justCreated));
                    }}
                  >
                    <i className="ti ti-shield-lock" /> Asignar permisos ahora
                  </button>
                </div>
              </>
            ) : (
            <>
            <div className="usr-modal-body">
              {/* ── FOTO DE PERFIL ── */}
              <div className="usr-field">
                <label className="usr-label">
                  Foto de perfil <span className="usr-opt">(opcional)</span>
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 12,
                      flexShrink: 0,
                      overflow: "hidden",
                      border: "2px solid var(--border)",
                      background: "var(--bg-elevated)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {fotoPreview ? (
                      <img
                        src={fotoPreview}
                        alt="preview"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <i
                        className="ti ti-user"
                        style={{ fontSize: 28, color: "var(--text-muted)" }}
                      />
                    )}
                  </div>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    <input
                      ref={fotoInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={handleFotoChange}
                    />
                    <button
                      type="button"
                      className="usr-btn-ghost"
                      style={{ height: 32, fontSize: 12, padding: "0 12px" }}
                      onClick={() => fotoInputRef.current?.click()}
                    >
                      <i className="ti ti-upload" />{" "}
                      {fotoPreview ? "Cambiar foto" : "Subir foto"}
                    </button>
                    {fotoPreview && (
                      <button
                        type="button"
                        className="usr-btn-ghost"
                        style={{
                          height: 32,
                          fontSize: 12,
                          padding: "0 12px",
                          color: "#ef4444",
                          borderColor: "#ef444440",
                        }}
                        onClick={quitarFoto}
                      >
                        <i className="ti ti-trash" /> Quitar foto
                      </button>
                    )}
                  </div>
                </div>
                <p className="usr-field-hint">JPG, PNG o WebP · máx. 2 MB</p>
              </div>

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
                    type="password"
                    value={form.pswd}
                    onChange={(e) => campo("pswd", e.target.value)}
                    placeholder={editando ? "••••••••" : "Nueva contraseña"}
                    autoComplete="new-password"
                  />
                </div>
                {formErr.pswd && (
                  <p className="usr-field-err">{formErr.pswd}</p>
                )}
                {editando && (
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="usr-btn-ghost"
                      style={{ height: 32, fontSize: 12, padding: "0 12px" }}
                      disabled={loadingPswd}
                      onClick={verContrasenaActual}
                    >
                      <i className={`ti ${currentPswd !== null ? "ti-eye-off" : "ti-eye"}`} />{" "}
                      {loadingPswd
                        ? "Consultando…"
                        : currentPswd !== null
                          ? "Ocultar contraseña actual"
                          : "Mostrar contraseña actual"}
                    </button>
                    {currentPswd !== null && (
                      <p
                        className="usr-field-hint usr-pswd-copy"
                        style={{ marginTop: 6, cursor: "pointer" }}
                        title="Clic para copiar usuario y contraseña"
                        onClick={() => copiarAccesos(editando, currentPswd)}
                      >
                        <i className="ti ti-copy" /> Contraseña actual:{" "}
                        <strong>{currentPswd || "(vacía)"}</strong>
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="usr-field">
                <label className="usr-label">
                  Nombre <span className="usr-req">*</span>
                </label>
                <input
                  className={`usr-input ${formErr.name ? "usr-input--err" : ""}`}
                  value={form.name}
                  maxLength={80}
                  onBlur={() => campo("name", formatearNombreCorto(form.name))}
                  onChange={(e) => campo("name", e.target.value)}
                  placeholder="Ej. Juan Ramírez"
                  aria-label="Nombre"
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
            </>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL ACCESOS ──────────────────────── */}
    </div>
  );
}
