// ─────────────────────────────────────────────────────────
//  LoginPage.jsx — FABPSA Portal Corporativo v4
//  100% lógica original intacta + flujo de primer acceso.
// ─────────────────────────────────────────────────────────
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { loginService, saveSession } from "../services/authService";
import { useAuth } from "../hooks/useAuth";
import FirstAccessModal from "./FirstAccessModal";
import logo from "../logo-fabpsa.png";
import "../style/Loggin.css";

const BENEFICIOS = [
  { icon: "ti-shield-check", titulo: "Seguro", desc: "" },
  { icon: "ti-users-group", titulo: "Colaborativo", desc: "" },
  { icon: "ti-bulb", titulo: "Innovador", desc: "" },
];

// ─── Tipos de error que el backend devuelve ───────────────
const ERROR_CODE = {
  NOT_FOUND: "NOT_FOUND",
  WRONG_PASSWORD: "WRONG_PASSWORD",
  FIRST_ACCESS: "FIRST_ACCESS", // usuario activado: viene con token
};

export default function LoginPage() {
  /* ── Estado ─────────────────────────────────────────────── */
  const [loginInput, setLoginInput] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null); // { code, message }
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);

  // Datos del primer acceso: token + user pendientes de guardar
  const [firstAccess, setFirstAccess] = useState(null); // { token, user }

  const { login } = useAuth();
  const navigate = useNavigate();

  /* ── Completar sesión (normal o tras primer acceso) ─────── */
  const completeLogin = useCallback(
    (token, user) => {
      saveSession(token, user);
      login(token, user);
      navigate("/");
    },
    [login, navigate],
  );

  /* ── Callback cuando el modal termina su animación ──────── */
  const handleFirstAccessComplete = useCallback(() => {
    if (firstAccess) {
      completeLogin(firstAccess.token, firstAccess.user);
    }
  }, [firstAccess, completeLogin]);

  /* ── Submit principal ───────────────────────────────────── */
  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await loginService(loginInput, password);

      if (data.code === ERROR_CODE.FIRST_ACCESS) {
        // Guarda el token/user y abre el modal; la sesión se guarda al terminar
        setFirstAccess({ token: data.token, user: data.user });
      } else {
        // Acceso normal
        completeLogin(data.token, data.user);
      }
    } catch (err) {
      const code = err.response?.data?.code || "UNKNOWN";
      const message =
        err.response?.data?.error || "Error de conexión. Intenta de nuevo.";
      setError({ code, message });
    } finally {
      setLoading(false);
    }
  }

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <>
      {/* ══ Modal de primer acceso (bloquea toda la UI) ══ */}
      {firstAccess && (
        <FirstAccessModal onComplete={handleFirstAccessComplete} />
      )}

      <div className="lg-root">
        <div className="lg-bg-layer" aria-hidden="true" />

        <div className="lg-card">
          {/* ══════════════ PANEL IZQUIERDO ══════════════ */}
          <div className="lg-left" aria-hidden="true">
            <div className="lg-left-base" />
            <div className="lg-glow lg-glow--tl" />
            <div className="lg-glow lg-glow--br" />
            <div className="lg-glow lg-glow--center" />
            <div className="lg-sphere" />

            <svg className="lg-dotgrid" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern
                  id="dp2"
                  x="0"
                  y="0"
                  width="22"
                  height="22"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="1" cy="1" r=".75" fill="rgba(255,255,255,.1)" />
                </pattern>
                <radialGradient id="dm2" cx="60%" cy="35%" r="50%">
                  <stop offset="0%" stopColor="white" stopOpacity="1" />
                  <stop offset="100%" stopColor="white" stopOpacity="0" />
                </radialGradient>
                <mask id="dfm2">
                  <rect width="100%" height="100%" fill="url(#dm2)" />
                </mask>
              </defs>
              <rect
                width="100%"
                height="100%"
                fill="url(#dp2)"
                mask="url(#dfm2)"
              />
            </svg>

            <svg
              className="lg-network"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 440 640"
              preserveAspectRatio="xMidYMid slice"
            >
              <g stroke="rgba(76,201,166,.12)" strokeWidth=".8" fill="none">
                <line x1="80" y1="60" x2="280" y2="200" />
                <line x1="280" y1="200" x2="380" y2="140" />
                <line x1="280" y1="200" x2="220" y2="340" />
                <line x1="220" y1="340" x2="360" y2="400" />
                <line x1="220" y1="340" x2="80" y2="480" />
                <line x1="80" y1="480" x2="200" y2="560" />
                <line x1="360" y1="400" x2="420" y2="520" />
                <line x1="80" y1="60" x2="40" y2="200" />
                <line x1="40" y1="200" x2="80" y2="480" />
              </g>
              <g fill="rgba(76,201,166,.35)">
                <circle cx="80" cy="60" r="2.5" />
                <circle cx="280" cy="200" r="3.5" />
                <circle cx="380" cy="140" r="2" />
                <circle cx="220" cy="340" r="3" />
                <circle cx="360" cy="400" r="2" />
                <circle cx="80" cy="480" r="2.5" />
                <circle cx="200" cy="560" r="2" />
                <circle cx="420" cy="520" r="1.5" />
                <circle cx="40" cy="200" r="2" />
              </g>
            </svg>

            <svg
              className="lg-particles"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 440 640"
              preserveAspectRatio="xMidYMid slice"
            >
              <circle
                cx="320"
                cy="80"
                r="1.8"
                fill="rgba(76,201,166,.55)"
                className="lp-a"
              />
              <circle
                cx="400"
                cy="180"
                r="1.2"
                fill="rgba(124,140,248,.45)"
                className="lp-b"
              />
              <circle
                cx="50"
                cy="300"
                r="1.5"
                fill="rgba(76,201,166,.4)"
                className="lp-c"
              />
              <circle
                cx="380"
                cy="360"
                r="2"
                fill="rgba(124,140,248,.35)"
                className="lp-d"
              />
              <circle
                cx="140"
                cy="500"
                r="1.2"
                fill="rgba(76,201,166,.3)"
                className="lp-e"
              />
            </svg>

            <div className="lg-left-content">
              <div className="lg-left-logo" />
              <div className="lg-hero">
                <p className="lg-eyebrow">Bienvenido al</p>
                <h1 className="lg-htitle">
                  Portal <span className="lg-htitle-accent">Corporativo</span>
                </h1>
                <div className="lg-title-line" />
                <p className="lg-hero-sub">
                  Todo lo que necesitas para trabajar,
                  <br />
                  en un solo lugar.
                </p>
              </div>
              <div className="lg-benefits">
                {BENEFICIOS.map((b) => (
                  <div className="lg-benefit" key={b.titulo}>
                    <div className="lg-benefit-icon">
                      <i className={`ti ${b.icon}`} />
                    </div>
                    <div className="lg-benefit-body">
                      <p className="lg-benefit-title">{b.titulo}</p>
                      <p className="lg-benefit-desc">{b.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="lg-left-footer">
                <i
                  className="ti ti-lock"
                  style={{ fontSize: 11, marginRight: 5 }}
                />
                © 2026 FABPSA. Todos los derechos reservados.
              </p>
            </div>
          </div>

          {/* ══════════════ PANEL DERECHO ══════════════ */}
          <div className="lg-right">
            <div className="lg-form-inner">
              <div className="lg-form-logo-wrap">
                <img src={logo} alt="FABPSA" className="lg-form-logo" />
              </div>

              <div className="lg-form-heading">
                <h2 className="lg-form-title">Acceder al portal</h2>
                <p className="lg-form-sub">
                  Ingresa tus credenciales corporativas
                </p>
                <div className="lg-accent-line" aria-hidden="true" />
              </div>

              {/* ── Formulario ── */}
              <form className="lg-form" onSubmit={handleSubmit} noValidate>
                {/* Campo usuario */}
                <div className="lg-field">
                  <label className="lg-label" htmlFor="lg-login">
                    Usuario
                  </label>
                  <div className="lg-input-wrap">
                    <i className="ti ti-user lg-iico" aria-hidden="true" />
                    <input
                      id="lg-login"
                      className="lg-input"
                      type="text"
                      placeholder="Ej. PFV7315"
                      value={loginInput}
                      onChange={(e) =>
                        setLoginInput(e.target.value.toUpperCase())
                      }
                      autoComplete="username"
                      autoFocus
                      required
                    />
                  </div>
                </div>

                {/* Campo contraseña */}
                <div className="lg-field">
                  <div className="lg-label-row">
                    <label className="lg-label" htmlFor="lg-pass">
                      Contraseña
                    </label>
                    <button type="button" className="lg-forgot">
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <div className="lg-input-wrap">
                    <i className="ti ti-lock lg-iico" aria-hidden="true" />
                    <input
                      id="lg-pass"
                      className="lg-input lg-input--pass"
                      type={showPass ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="lg-eye"
                      onClick={() => setShowPass((v) => !v)}
                      tabIndex={-1}
                      aria-label={
                        showPass ? "Ocultar contraseña" : "Mostrar contraseña"
                      }
                    >
                      <i
                        className={`ti ${showPass ? "ti-eye-off" : "ti-eye"}`}
                      />
                    </button>
                  </div>
                </div>

                {/* Recordarme */}
                <label className="lg-remember">
                  <input
                    type="checkbox"
                    className="lg-chk-native"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span className="lg-chk-box" aria-hidden="true">
                    {remember && <i className="ti ti-check" />}
                  </span>
                  <span className="lg-chk-label">Recordarme</span>
                </label>

                {/* ── Mensajes de error diferenciados ── */}
                {error && error.code === "NOT_FOUND" && (
                  <div className="lg-error" role="alert">
                    <i className="ti ti-alert-circle" aria-hidden="true" />
                    <span>
                      Usuario no encontrado. Solicita tu acceso al área de
                      Sistemas.
                    </span>
                  </div>
                )}

                {error && error.code !== "NOT_FOUND" && (
                  <div className="lg-error" role="alert">
                    <i className="ti ti-alert-circle" aria-hidden="true" />
                    <span>{error.message}</span>
                  </div>
                )}

                {/* Botón principal */}
                <button type="submit" className="lg-btn" disabled={loading}>
                  <span className="lg-btn-shine" aria-hidden="true" />
                  {loading ? (
                    <>
                      <span className="lg-spinner" aria-hidden="true" />
                      Verificando…
                    </>
                  ) : (
                    <>
                      Iniciar sesión{" "}
                      <i className="ti ti-arrow-right" aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>

              {/* Bloque de ayuda */}
              <div className="lg-help-block">
                <div className="lg-help-icon-wrap">
                  <i className="ti ti-headset" />
                </div>
                <div className="lg-help-text">
                  <p className="lg-help-title">¿Necesitas ayuda?</p>
                  <p className="lg-help-desc">
                    Nuestro equipo de Sistemas está listo para ayudarte.
                  </p>
                </div>
                <i
                  className="ti ti-arrow-right lg-help-arrow"
                  aria-hidden="true"
                />
              </div>

              <p className="lg-secure-badge">
                <i className="ti ti-shield-check" aria-hidden="true" />
                Accede de forma segura utilizando tu cuenta corporativa.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
