// LoginPage.jsx — FABPSA Portal Corporativo v4 · 2026
import { useState, useCallback, useEffect, useRef, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { loginService, saveSession } from "../services/authService";
import { AuthContext } from "../context/AuthContext";
import logo from "../logo-fabpsa.png";
import mascota from "../assets/hero-aplicativos.svg"; // ilustración del portal
import "../style/Loggin.css";
import "../style/LoginNube.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://192.168.16.198:3001";

const PETALOS = [
  { left: "8%", size: 9, delay: "0s", dur: "15s", dx: "-30px" },
  { left: "22%", size: 7, delay: "3s", dur: "19s", dx: "24px" },
  { left: "38%", size: 11, delay: "6s", dur: "17s", dx: "-18px" },
  { left: "52%", size: 8, delay: "1.5s", dur: "21s", dx: "28px" },
  { left: "66%", size: 10, delay: "8s", dur: "16s", dx: "-26px" },
  { left: "80%", size: 7, delay: "4.5s", dur: "20s", dx: "18px" },
  { left: "92%", size: 9, delay: "10s", dur: "18s", dx: "-12px" },
];

const FRASES = [
  {
    pre: "Conectamos personas, procesos y tecnología para que ",
    accent: "todo fluya.",
    post: "",
  },
  {
    pre: "Un solo lugar para trabajar, colaborar y ",
    accent: "gestionar.",
    post: "",
  },
  {
    pre: "Tecnología que ",
    accent: "conecta",
    post: " a nuestra organización.",
  },
  {
    pre: "Información, servicios y personas en ",
    accent: "un solo lugar.",
    post: "",
  },
  { pre: "Una experiencia digital pensada para ", accent: "todos.", post: "" },
];

// ── Captcha ───────────────────────────────────────────────
function ClickCaptcha({ onVerify, onExpire }) {
  const [estado, setEstado] = useState("idle");
  const [token, setToken] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    fetchToken();
    return () => clearTimeout(timerRef.current);
  }, []);

  async function fetchToken() {
    try {
      const res = await fetch(`${API_BASE}/auth/captcha-token`);
      const data = await res.json();
      setToken(data.captchaToken);
      timerRef.current = setTimeout(
        () => {
          setEstado("idle");
          setToken(null);
          onExpire();
          fetchToken();
        },
        9 * 60 * 1000,
      );
    } catch {
      setEstado("error");
    }
  }

  function handleClick() {
    if (estado !== "idle" || !token) return;
    setEstado("loading");
    setTimeout(() => {
      setEstado("ok");
      onVerify(token);
    }, 700);
  }

  return (
    <div
      className={`lg-captcha lg-captcha--${estado}`}
      onClick={handleClick}
      role={estado === "idle" ? "button" : undefined}
      tabIndex={estado === "idle" ? 0 : undefined}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      aria-label="Verificación de seguridad"
    >
      <div className="lg-captcha-left">
        {estado === "loading" && <span className="lg-captcha-spinner" />}
        {estado === "ok" && (
          <i className="ti ti-shield-check lg-captcha-ok-icon" />
        )}
        {estado === "error" && (
          <i
            className="ti ti-alert-circle"
            style={{ fontSize: 20, color: "#ef4444" }}
          />
        )}
        {estado === "idle" && (
          <div className="lg-captcha-idle-icon">
            <i className="ti ti-shield" />
          </div>
        )}
        <div className="lg-captcha-text">
          <span className="lg-captcha-label">
            {estado === "ok"
              ? "Verificación completada"
              : estado === "loading"
                ? "Verificando…"
                : estado === "error"
                  ? "Error. Recarga la página."
                  : "Soy humano"}
          </span>
          {estado === "idle" && (
            <span className="lg-captcha-hint">Haz clic para verificar</span>
          )}
        </div>
      </div>
      <div className="lg-captcha-brand">
        <i
          className="ti ti-lock"
          style={{ fontSize: 13, color: "#9ca3af", opacity: 0.6 }}
        />
        <span>VERIFICADO</span>
      </div>
    </div>
  );
}

// ── Frase dinámica ────────────────────────────────────────
function FraseDinamica() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % FRASES.length);
        setVisible(true);
      }, 450);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const f = FRASES[idx];

  return (
    <p
      className="lg2-frase"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 0.45s ease" }}
    >
      {f.pre}
      <span className="lg2-frase-accent">{f.accent}</span>
      {f.post}
    </p>
  );
}

// ── Loading ───────────────────────────────────────────────
function LoadingScreen({ progress, userName }) {
  if (progress >= 100) {
    return (
      <div className="lg2-loading">
        <div className="lg2-loading-inner">
          <img src={logo} alt="" className="lg2-loading-logo" />
          <h2 className="lg2-loading-title">Bienvenido</h2>
          {userName && (
            <p className="lg2-loading-name">
              {userName}
            </p>
          )}
          <p className="lg2-loading-sub">Tu espacio de trabajo está listo.</p>
        </div>
      </div>
    );
  }
  const pct = progress < 40 ? 0 : progress < 80 ? 50 : 100;
  const label =
    progress < 40
      ? "Preparando tu experiencia"
      : progress < 80
        ? "Cargando componentes"
        : "Todo listo";
  const sub =
    progress < 40
      ? "Estamos preparando tu espacio de trabajo."
      : progress < 80
        ? "Configurando tu entorno."
        : "Tu espacio está preparado.";
  return (
    <div className="lg2-loading">
      <div className="lg2-loading-inner">
        <div className="lg2-loading-pct">
          {pct}
          <span>%</span>
        </div>
        <div className="lg2-loading-label">{label}</div>
        <div className="lg2-loading-sub">{sub}</div>
        <div className="lg2-loading-bar">
          <div className="lg2-loading-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────
export default function LoginPage() {
  const [loginInput, setLoginInput] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [phase, setPhase] = useState("login");
  const [progress, setProgress] = useState(0);
  const [userName, setUserName] = useState("");
  const [campoActivo, setCampoActivo] = useState(false);
  const [ctaActivo, setCtaActivo] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.querySelector(".lg2-root");
    if (!root) return;
    const onMove = (e) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      root.style.setProperty("--px", x.toFixed(3));
      root.style.setProperty("--py", y.toFixed(3));
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
  const [modalTipo, setModalTipo] = useState(null);
  const passRef = useRef(null);

  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const runLoadingSequence = useCallback(
    (name) => {
      setUserName(name);
      setPhase("loading");
      setProgress(0);
      const t1 = setTimeout(() => setProgress(40), 100);
      const t2 = setTimeout(() => setProgress(80), 1600);
      const t3 = setTimeout(() => setProgress(100), 3200);
      const t4 = setTimeout(() => setPhase("welcome"), 3400);
      const t5 = setTimeout(() => {
        setPhase("done");
        navigate("/");
      }, 5000);
      return () => [t1, t2, t3, t4, t5].forEach(clearTimeout);
    },
    [navigate],
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (!captchaToken) {
      setError({
        code: "CAPTCHA",
        message: "Completa la verificación de seguridad.",
      });
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await loginService(loginInput, password, captchaToken);
      saveSession(data.token, data.user);
      login(data.token, data.user);
      runLoadingSequence(data.user?.name || loginInput);
    } catch (err) {
      const code = err.response?.data?.code || "UNKNOWN";
      const message =
        err.response?.data?.error || "Error de conexión. Intenta de nuevo.";
      if (code === "NOT_FOUND" || code === "WRONG_PASSWORD") {
        setModalTipo(code === "NOT_FOUND" ? "noExiste" : "credenciales");
      } else {
        setError({ code, message });
      }
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  }

  const isLoading = phase === "loading" || phase === "welcome";

  const SERVICES = [
    {
      icon: "ti-headset",
      name: "Mesa de Servicio",
      desc: "Soporte y atención en un solo lugar.",
      color: "#ea6a12",
    },
    {
      icon: "ti-device-imac",
      name: "Servicios TI",
      desc: "Accede a servicios tecnológicos.",
      color: "#1f7a3a",
    },
    {
      icon: "ti-users",
      name: "Cultura Digital",
      desc: "Conectamos y crecemos juntos.",
      color: "#b8125c",
    },
    {
      icon: "ti-address-book",
      name: "Directorio",
      desc: "Encuentra a las personas que necesitas.",
      color: "#1565c0",
    },
  ];

  return (
    <div className="lg2-root">
      {modalTipo && (
        <div className="lg2-modal-overlay" onClick={() => setModalTipo(null)}>
          <div className="lg2-modal" role="alertdialog" aria-labelledby="lg2-modal-titulo" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="lg2-modal-close" aria-label="Cerrar" onClick={() => setModalTipo(null)}>
              <i className="ti ti-x" />
            </button>
            <div className="lg2-modal-ilustracion" aria-hidden="true"><i className="ti ti-lock-exclamation" /></div>
            {modalTipo === "credenciales" ? (
              <>
                <h2 id="lg2-modal-titulo" className="lg2-modal-titulo">No pudimos iniciar sesión</h2>
                <div className="lg2-modal-divisor" aria-hidden="true"><span /></div>
                <p className="lg2-modal-texto">
                  El usuario o la contraseña no son correctos. Verifica tus datos e inténtalo nuevamente.
                </p>
              </>
            ) : (
              <>
                <h2 id="lg2-modal-titulo" className="lg2-modal-titulo">Esta cuenta no está registrada</h2>
                <div className="lg2-modal-divisor" aria-hidden="true"><span /></div>
                <p className="lg2-modal-texto">
                  No encontramos esas credenciales.<br />
                  Verifica tus datos o solicita tu acceso a Sistemas.
                </p>
              </>
            )}
            <button
              type="button"
              className="lg2-modal-btn"
              onClick={() => {
                setModalTipo(null);
                setPassword("");
                passRef.current?.focus();
              }}
            >
              Intentar de nuevo
            </button>
          </div>
        </div>
      )}
      {/* Fondo — imagen PNG */}
      <div
        className="lg2-bg-image"
        aria-hidden="true"
      />

      {isLoading && <LoadingScreen progress={progress} userName={userName} />}

      {!isLoading && (
        <div className="lg2-layout">
          {/* ══ IZQUIERDO ══ */}
          <div className="lg2-left">
            <div className="lg2-dm" aria-hidden="true">
              <div className="lg2-dm-figure" data-focus={campoActivo ? "true" : undefined} data-cta={ctaActivo ? "true" : undefined}>
                <img src={mascota} alt="" className="lg2-dm-mascot" />
              </div>
            </div>

            {/* Marca */}
            <div className="lg2-brand">
              <div className="lg2-brand-lockup">
                <img src={logo} alt="FABPSA" className="lg2-brand-logo" />
                <div className="lg2-brand-title">
                  <span className="lg2-brand-title--main">Portal</span>
                  <span className="lg2-brand-title--accent">Corporativo</span>
                </div>
              </div>
            </div>

            <FraseDinamica />

            {/* Servicios — cards individuales con chevron */}
            <div className="lg2-services">
              {SERVICES.map((s, i) => (
                <div key={i} className="lg2-service">
                  <div className="lg2-service-ico" style={{ "--c": s.color }}>
                    <i className={`ti ${s.icon}`} />
                  </div>
                  <div className="lg2-service-text">
                    <span
                      className="lg2-service-name"
                      style={{ "--c": s.color }}
                    >
                      {s.name}
                    </span>
                    <span className="lg2-service-desc">{s.desc}</span>
                  </div>
                  <i className="ti ti-chevron-right lg2-service-chevron" />
                </div>
              ))}
            </div>

            {/* Seguridad */}
            <div className="lg2-security">
              {[
                { icon: "ti-message-circle", label: "Conexión cifrada" },
                { icon: "ti-lock", label: "Sesión verificada" },
                { icon: "ti-key", label: "Acceso seguro" },
              ].map((s, i) => (
                <span key={i} className="lg2-security-item">
                  <i className={`ti ${s.icon}`} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {/* ══ PANEL ══ */}
          <div className="lg2-panel">
            <div className="lg2-panel-head">
              <div className="lg2-panel-eyebrow">
                <div className="lg2-panel-dot" />
                <span>ACCESO AL SISTEMA</span>
              </div>
              <h1 className="lg2-panel-title">Bienvenido</h1>
              <p className="lg2-panel-sub">
                Ingresa tus credenciales para continuar
              </p>
            </div>


            <form className="lg2-form" onSubmit={handleSubmit} noValidate>
              <div className="lg2-field">
                <label className="lg2-label" htmlFor="lg-login">
                  Usuario
                </label>
                <div className="lg2-input-wrap">
                  <i className="ti ti-user lg2-iico" />
                  <input
                    id="lg-login"
                    className="lg2-input"
                    type="text"
                    placeholder="Ej. PFV7315"
                    value={loginInput}
                    onChange={(e) =>
                      setLoginInput(e.target.value.toUpperCase())
                    }
                    autoComplete="username"
                    autoFocus
                    required
                    onFocus={() => setCampoActivo(true)}
                    onBlur={() => setCampoActivo(false)}
                  />
                </div>
              </div>

              <div className="lg2-field">
                <label className="lg2-label" htmlFor="lg-pass">
                  Contraseña
                </label>
                <div className="lg2-input-wrap">
                  <i className="ti ti-lock lg2-iico" />
                  <input
                    ref={passRef}
                    id="lg-pass"
                    className="lg2-input lg2-input--pass"
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    onFocus={() => setCampoActivo(true)}
                    onBlur={() => setCampoActivo(false)}
                  />
                  <button
                    type="button"
                    className="lg2-eye"
                    onClick={() => setShowPass((v) => !v)}
                    tabIndex={-1}
                  >
                    <i className={`ti ${showPass ? "ti-eye-off" : "ti-eye"}`} />
                  </button>
                </div>
              </div>

              <ClickCaptcha
                key={captchaKey}
                onVerify={(t) => {
                  setCaptchaToken(t);
                  setError(null);
                }}
                onExpire={() => setCaptchaToken(null)}
              />

              {error && (
                <div className="lg2-error" role="alert">
                  <i className="ti ti-alert-circle" />
                  <span>
                    {error.code === "NOT_FOUND"
                      ? "Usuario no encontrado. Solicita acceso al área de Sistemas."
                      : error.message}
                  </span>
                </div>
              )}

              <button
                type="submit"
                className="lg2-btn"
                disabled={loading || !captchaToken}
                onMouseEnter={() => setCtaActivo(true)}
                onMouseLeave={() => setCtaActivo(false)}
              >
                {loading ? (
                  <>
                    <span className="lg2-spinner" />
                    Verificando…
                  </>
                ) : (
                  <>
                    Iniciar sesión <i className="ti ti-arrow-right" />
                  </>
                )}
              </button>

              <div className="lg2-sec-line">
                <i className="ti ti-shield-lock" />
                <span>Conexión segura y confiable</span>
              </div>
            </form>

            <p className="lg2-footer">© 2026 · FABPSA TI</p>
          </div>
        </div>
      )}
    </div>
  );
}
