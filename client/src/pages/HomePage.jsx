// src/pages/HomePage.jsx
import { useContext, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { QUICK_APPS } from "../data/staticData";
import "../style/HomePage.css";
import "../style/HomeNube.css";
import { esTemporadaDiaMuertos } from "../utils/temporada";
import FabpsiFlotante from "./mesaServicio/paginaPrincipal/FabpsiFlotante";
import robotFabi from "../assets/fabi.png";

const getToken = () => localStorage.getItem("fabpsa_token");
const birthdaysUrl = (month) => {
  const base = process.env.REACT_APP_API_URL
    ? `${process.env.REACT_APP_API_URL}/birthdays`
    : "/api/birthdays";
  return `${base}?month=${month}`;
};
const apiFetch = async (path, opts = {}) => {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...opts.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) data.__httpError = true;
  return data;
};

const MENSAJES = {
  1: {
    a: "Comenzamos una nueva semana.",
    b: "Nuevas oportunidades para avanzar y construir.",
  },
  2: {
    a: "Ya estamos avanzando en la semana.",
    b: "Concéntrate en lo importante y deja que nosotros te ayudemos.",
  },
  3: {
    a: "Estamos a mitad de semana.",
    b: "Un buen momento para resolver pendientes y seguir construyendo.",
  },
  4: {
    a: "Cada día es una oportunidad para hacer las cosas mejor.",
    b: "Estamos aquí para apoyarte.",
  },
  5: {
    a: "Cerremos la semana con buenos resultados.",
    b: "Gracias por hacer que las cosas sucedan.",
  },
  6: {
    a: "Gracias por estar aquí.",
    b: "Hagamos que este día también cuente.",
  },
  0: { a: "Buen descanso.", b: "Mañana seguimos construyendo juntos." },
};

const saludo = () => {
  const h = new Date().getHours();
  return h >= 5 && h < 12
    ? "Buenos días"
    : h < 19
      ? "Buenas tardes"
      : "Buenas noches";
};
const fmtHoy = () =>
  new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const fmtFecha = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";

const AVS = [
  { bg: "#ede9fe", c: "#5b21b6" },
  { bg: "#d1fae5", c: "#065f46" },
  { bg: "#fce7f3", c: "#9d174d" },
  { bg: "#dbeafe", c: "#1e3a8a" },
  { bg: "#fef3c7", c: "#78350f" },
  { bg: "#fee2e2", c: "#7f1d1d" },
  { bg: "#f0fdf4", c: "#14532d" },
  { bg: "#fdf4ff", c: "#581c87" },
];
const initials = (b) =>
  ((b.nombre?.[0] || "") + (b.apellidoPaterno?.[0] || "")).toUpperCase();

const CAT_COLORS = {
  tecnologia: "#3b82f6",
  ciberseguridad: "#ef4444",
  nom35: "#10b981",
  vidasana: "#06b6d4",
  industria: "#f59e0b",
  ia: "#8b5cf6",
};
const CAT_LABELS = {
  tecnologia: "Tecnología",
  ciberseguridad: "Ciberseguridad",
  nom35: "NOM-035",
  vidasana: "Vida Sana",
  industria: "Industria",
  ia: "IA",
};
const CAT_EMOJIS = {
  tecnologia: "💻",
  ciberseguridad: "🔐",
  nom35: "📋",
  vidasana: "🌿",
  industria: "🏭",
  ia: "🤖",
};
const SVC_ICONS = {
  "Correo / Microsoft 365": "ti-mail",
  "ERP Multivisión": "ti-database",
  "Internet y red": "ti-wifi",
  "Office 365": "ti-brand-office",
  "Telefonía y comunicaciones": "ti-phone",
};
const EST = {
  operando: { label: "Operando", color: "#10b981" },
  intermitencia: { label: "Intermitencia", color: "#f59e0b" },
  incidente: { label: "Incidente", color: "#ef4444" },
};

const ACCESOS = [
  {
    icon: "ti-ticket",
    label: "Solicitudes de TI",
    desc: "Solicita un servicio de TI o soporte.",
    color: "#7c8cf8",
    bg: "#ede9fe",
    path: "/mesa-de-servicio",
  },
  {
    icon: "ti-alert-circle",
    label: "Reportar incidencia",
    desc: "Informa rápidamente una falla.",
    color: "#ef4444",
    bg: "#fee2e2",
    path: "/mesa-de-servicio",
  },
  {
    icon: "ti-book",
    label: "Base de conocimiento",
    desc: "Encuentra guías y soluciones.",
    color: "#4cc9a6",
    bg: "#d1fae5",
    path: "/cultura-digital",
  },
  {
    icon: "ti-users",
    label: "Directorio de personal",
    color: "#7c8cf8",
    bg: "#ede9fe",
    path: null,
    url: "http://201.151.218.138:3550/fabp/Directorio",
  },
  {
    icon: "ti-file-text",
    label: "Manuales y guías",
    color: "#f59e0b",
    bg: "#fef3c7",
    path: "/",
  },
  {
    icon: "ti-shield-check",
    label: "Normativas y políticas",
    color: "#f59e0b",
    bg: "#fef3c7",
    path: "/",
  },
];

/* ── Confetti ────────────────────────────────────────────────────── */
function launchConfetti() {
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99999";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const COLORS = [
    "#4cc9a6",
    "#7c8cf8",
    "#f59e0b",
    "#ef4444",
    "#3b82f6",
    "#a855f7",
    "#ec4899",
    "#10b981",
  ];
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 200,
    w: 6 + Math.random() * 8,
    h: 10 + Math.random() * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rot: Math.random() * Math.PI * 2,
    vx: (Math.random() - 0.5) * 3,
    vy: 2 + Math.random() * 4,
    vrot: (Math.random() - 0.5) * 0.18,
    opacity: 1,
  }));

  let frame;
  let start = null;
  const DURATION = 3200;

  function draw(ts) {
    if (!start) start = ts;
    const elapsed = ts - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    pieces.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      p.vy += 0.06; // gravedad suave
      if (elapsed > DURATION * 0.6) p.opacity = Math.max(0, p.opacity - 0.012);

      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    if (elapsed < DURATION) {
      frame = requestAnimationFrame(draw);
    } else {
      canvas.remove();
    }
  }
  frame = requestAnimationFrame(draw);
  // limpieza de seguridad
  setTimeout(() => {
    cancelAnimationFrame(frame);
    canvas.remove();
  }, DURATION + 500);
}

/* ── Modal cumpleaños ───────────────────────────────────────────── */
function ModalCumpleanos({ data, onClose }) {
  const hoy = new Date();
  const [cursor, setCursor] = useState(
    () => new Date(hoy.getFullYear(), hoy.getMonth(), 1),
  );
  const [monthData, setMonthData] = useState([]);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const cursorMonth = cursor.getMonth() + 1;

  useEffect(() => {
    const local = data.filter((b) => Number(b.mesNacimiento) === cursorMonth);
    if (local.length) {
      setMonthData(local);
      return;
    }
    setLoadingMonth(true);
    fetch(birthdaysUrl(cursorMonth), {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setMonthData(Array.isArray(rows) ? rows : []))
      .catch(() => setMonthData([]))
      .finally(() => setLoadingMonth(false));
  }, [cursorMonth, data]);

  const diaHoy = hoy.getDate();
  const grupos = monthData.reduce((acc, b) => {
    const dia = parseInt(b.diaNacimiento);
    if (!acc[dia]) acc[dia] = [];
    acc[dia].push(b);
    return acc;
  }, {});
  const diasOrdenados = Object.keys(grupos)
    .map(Number)
    .sort((a, b) => a - b);
  const mesLabel = cursor.toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });
  const MESES = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  const mesCorto = MESES[cursor.getMonth()];
  return (
    <div className="hx-modal-overlay" onClick={onClose}>
      <div className="hx-bday2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="hx-bday2-head">
          <div className="hx-bday2-head-top">
            <div>
              <div className="hx-bday2-head-label">
                <div className="hx-bday2-icon">🎂</div>
                <span className="hx-bday2-title">Cumpleaños FABPSA</span>
              </div>
              <div className="hx-bday2-sub">
                Celebremos a quienes cumplen años este mes
              </div>
            </div>
            <button className="hx-bday2-close" onClick={onClose}>
              <i className="ti ti-x" />
            </button>
          </div>
          <div className="hx-bday2-month-bar">
            <button
              className="hx-bday2-nav"
              onClick={() =>
                setCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
              }
              aria-label="Mes anterior"
            >
              <i className="ti ti-chevron-left" />
            </button>
            <span className="hx-bday2-month-text">
              {mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}
            </span>
            <button
              className="hx-bday2-nav"
              onClick={() =>
                setCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
              }
              aria-label="Mes siguiente"
            >
              <i className="ti ti-chevron-right" />
            </button>
            <span className="hx-bday2-month-count">
              <i className="ti ti-cake" /> {monthData.length} cumpleaños
            </span>
          </div>
        </div>
        <div className="hx-bday2-divider" />
        <div className="hx-bday2-body">
          {loadingMonth ? (
            <div className="hx-empty" style={{ padding: "28px 22px" }}>
              Cargando cumpleaños…
            </div>
          ) : monthData.length === 0 ? (
            <div className="hx-empty" style={{ padding: "28px 22px" }}>
              Sin cumpleaños este mes.
            </div>
          ) : (
            diasOrdenados.map((dia) => {
              const esHoy =
                dia === diaHoy && cursor.getMonth() === hoy.getMonth();
              return (
                <div key={dia} className="hx-bday2-group">
                  <div
                    className={`hx-bday2-group-label ${esHoy ? "hx-bday2-today-lbl" : ""}`}
                  >
                    {esHoy ? (
                      <>
                        <i className="ti ti-cake" />
                        Hoy
                      </>
                    ) : (
                      `${dia} ${mesCorto}`
                    )}
                  </div>
                  {grupos[dia].map((b, i) => {
                    const av =
                      AVS[(parseInt(b.diaNacimiento) + i) % AVS.length];
                    return (
                      <div
                        key={i}
                        className={`hx-bday2-person ${esHoy ? "hx-bday2-today-row" : ""}`}
                      >
                        <div
                          className="hx-bday2-av"
                          style={{ background: av.bg, color: av.c }}
                        >
                          {initials(b)}
                        </div>
                        <div className="hx-bday2-info">
                          <div className="hx-bday2-name">
                            {b.nombre} {b.apellidoPaterno}
                          </div>
                          <div className="hx-bday2-dept">
                            {b.departamento || b.sitio}
                          </div>
                        </div>
                        <div className="hx-bday2-right">
                          {esHoy ? (
                            <span className="hx-bday2-chip-today">
                              <i className="ti ti-confetti" />
                              Hoy
                            </span>
                          ) : (
                            <span className="hx-bday2-chip-date">
                              {dia} {mesCorto}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
        <div className="hx-bday2-foot">
          <button className="hx-bday2-btn-close" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   HOMEPAGE
   ══════════════════════════════════════════════════════════════════ */
export default function HomePage() {
  const nav = useNavigate();
  const { user } = useContext(AuthContext);
  const name = user?.name?.split(" ")[0] ?? "Usuario";
  const lastName = user?.name?.split(" ").slice(1).join(" ") ?? "";
  const msg = MENSAJES[new Date().getDay()] ?? MENSAJES[0];
  const ops = user?.area === "SISTEMAS";
  const canvasRef = useRef(null);
  const heroRef = useRef(null);

  /* ── Partículas ─────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current,
      hero = heroRef.current;
    if (!canvas || !hero) return;
    const ctx = canvas.getContext("2d");
    const mouse = { x: -999, y: -999 };
    const N = 32;
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: Math.random() * 1.6 + 0.7,
    }));
    let W, H, raf;
    const resize = () => {
      W = canvas.width = hero.offsetWidth;
      H = canvas.height = hero.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const onMove = (e) => {
      const r = hero.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const onLeave = () => {
      mouse.x = -999;
      mouse.y = -999;
    };
    hero.addEventListener("mousemove", onMove);
    hero.addEventListener("mouseleave", onLeave);
    const CONN = 80,
      MOUSE_R = 100,
      PUSH = 16;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const px = mouse.x,
        py = mouse.y;
      pts.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > 100) p.vx *= -1;
        if (p.y < 0 || p.y > 100) p.vy *= -1;
        const ax = (p.x / 100) * W,
          ay = (p.y / 100) * H;
        const dx = ax - px,
          dy = ay - py,
          dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MOUSE_R && dist > 0) {
          const f = (MOUSE_R - dist) / MOUSE_R;
          p.x += (((dx / dist) * f * PUSH) / W) * 100;
          p.y += (((dy / dist) * f * PUSH) / H) * 100;
        }
      });
      for (let i = 0; i < N; i++)
        for (let j = i + 1; j < N; j++) {
          const ax = (pts[i].x / 100) * W,
            ay = (pts[i].y / 100) * H;
          const bx = (pts[j].x / 100) * W,
            by = (pts[j].y / 100) * H;
          const d = Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
          if (d < CONN) {
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.strokeStyle = `rgba(76,201,166,${(1 - d / CONN) * 0.18})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      pts.forEach((p) => {
        const ax = (p.x / 100) * W,
          ay = (p.y / 100) * H;
        const near = Math.sqrt((ax - px) ** 2 + (ay - py) ** 2) < MOUSE_R;
        ctx.beginPath();
        ctx.arc(ax, ay, p.r * (near ? 1.8 : 1), 0, Math.PI * 2);
        ctx.fillStyle = near ? "rgba(76,201,166,0.7)" : "rgba(76,201,166,0.26)";
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      hero.removeEventListener("mousemove", onMove);
      hero.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  /* ── States ─────────────────────────────────────────────────── */
  const [coms, setComs] = useState([]);
  const [svcs, setSvcs] = useState([]);
  const [svcCat, setSvcCat] = useState([]);
  const [bdays, setBdays] = useState([]);
  const [arts, setArts] = useState([]);
  const [edicion, setEdicion] = useState(null);
  const [lCom, setLCom] = useState(true);
  const [lSvc, setLSvc] = useState(true);
  const [lBday, setLBday] = useState(true);
  const [lArts, setLArts] = useState(true);
  const [mCom, setMCom] = useState(false);
  const [mSvc, setMSvc] = useState(false);
  const [mBdays, setMBdays] = useState(false);
  const [busca, setBusca] = useState(""); // lanzador: filtra herramientas mientras se escribe
  const [fCom, setFCom] = useState({ encabezado: "", cuerpo: "" });
  const [fSvc, setFSvc] = useState({
    idServicio: "",
    estado: "operando",
    detalle: "",
  });
  const [sCom, setSCom] = useState(false);
  const [sSvc, setSSvc] = useState(false);

  useEffect(() => {
    loadComs();
    loadSvcs();
    loadBdays();
    loadArts();
  }, []);

  async function loadComs() {
    setLCom(true);
    try {
      const d = await apiFetch("/api/home/comunicados");
      setComs(Array.isArray(d) ? d : []);
    } catch {
      setComs([]);
    } finally {
      setLCom(false);
    }
  }
  async function loadSvcs() {
    setLSvc(true);
    try {
      const [a, b] = await Promise.all([
        apiFetch("/api/home/estado-servicios"),
        apiFetch("/api/home/servicios-ti"),
      ]);
      setSvcs(Array.isArray(a) ? a : []);
      setSvcCat(Array.isArray(b) ? b : []);
    } catch {
      setSvcs([]);
    } finally {
      setLSvc(false);
    }
  }
  async function loadBdays() {
    setLBday(true);
    try {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const nextMonth = (currentMonth % 12) + 1;
      const headers = { Authorization: `Bearer ${getToken()}` };
      const [current, next] = await Promise.all([
        fetch(birthdaysUrl(currentMonth), { headers }).then((r) => r.json()),
        fetch(birthdaysUrl(nextMonth), { headers }).then((r) => r.json()),
      ]);
      setBdays([
        ...(Array.isArray(current) ? current : []),
        ...(Array.isArray(next) ? next : []),
      ]);
    } catch {
      setBdays([]);
    } finally {
      setLBday(false);
    }
  }
  async function loadArts() {
    setLArts(true);
    try {
      const ed = await apiFetch("/api/blog/edicion/activa");
      if (ed && !ed.__httpError) {
        setEdicion(ed);
        const a = await apiFetch(
          `/api/blog/articulos?idEdicion=${ed.idEdicion}`,
        );
        setArts(Array.isArray(a) ? a.slice(0, 3) : []);
      }
    } catch {
    } finally {
      setLArts(false);
    }
  }

  async function pubCom() {
    if (!fCom.encabezado.trim()) return;
    setSCom(true);
    try {
      await apiFetch("/api/home/comunicados", {
        method: "POST",
        body: JSON.stringify({ ...fCom, loginAutor: user?.login }),
      });
      setMCom(false);
      setFCom({ encabezado: "", cuerpo: "" });
      loadComs();
    } finally {
      setSCom(false);
    }
  }
  async function updSvc() {
    if (!fSvc.idServicio) return;
    setSSvc(true);
    try {
      await apiFetch("/api/home/estado-servicios", {
        method: "PUT",
        body: JSON.stringify({
          idServicio: parseInt(fSvc.idServicio),
          estado: fSvc.estado,
          detalle: fSvc.detalle,
          loginAutor: user?.login,
        }),
      });
      setMSvc(false);
      setFSvc({ idServicio: "", estado: "operando", detalle: "" });
      loadSvcs();
    } finally {
      setSSvc(false);
    }
  }

  const allOk = svcs.length > 0 && svcs.every((s) => s.estado === "operando");
  const hoy = new Date();
  const mesActual = hoy.getMonth() + 1;
  const cumpleHoy = bdays.filter(
    (b) =>
      Number(b.mesNacimiento) === mesActual &&
      Number(b.diaNacimiento) === hoy.getDate(),
  );
  const futuros = bdays
    .filter((b) => {
      const monthOffset = (Number(b.mesNacimiento) - mesActual + 12) % 12;
      return monthOffset > 0 || Number(b.diaNacimiento) > hoy.getDate();
    })
    .sort((a, b) => {
      const aOffset = (Number(a.mesNacimiento) - mesActual + 12) % 12;
      const bOffset = (Number(b.mesNacimiento) - mesActual + 12) % 12;
      return aOffset - bOffset || Number(a.diaNacimiento) - Number(b.diaNacimiento);
    });
  const bdayProximos = cumpleHoy.length
    ? [
        ...cumpleHoy,
        ...(cumpleHoy.length === 1 ? futuros.slice(0, 2) : []),
      ].slice(0, 4)
    : futuros.slice(0, 4);
  const bdayResumen = bdayProximos.slice(0, 3);
  const totalCumpleRelevantes = cumpleHoy.length || bdayProximos.length;
  const bdayRestantes = Math.max(0, totalCumpleRelevantes - bdayResumen.length);
  const artDestacado = arts[0] ?? null;
  const artSecundarios = arts.slice(1, 3);

  return (
    <div className={"hx hx--nube" + (esTemporadaDiaMuertos() ? " hx--dm" : "")}>
      {/* ══ HERO ════════════════════════════════════════════════ */}
      <div className="hap" ref={heroRef}>
        <canvas
          ref={canvasRef}
          style={{
            display: "none",
          }}
        />
        <div className="hap-bg">
          <div className="hap-stripe" />
          <div className="hap-dot1" />
          <div className="hap-dot2" />
        </div>
        <div className="hap-inner">
          <div className="hap-row1">
            <div className="hap-id">
              <div className="hap-work-label">
                Tu espacio de trabajo <span />
              </div>
              <span className="hap-greet">{saludo()},</span>
              <div className="hap-name">
                {name} <span>{lastName}</span>
              </div>
              <div className="hap-msgs">
                <p className="hap-msg-a">{msg.a}</p>
                <p className="hap-msg-b">{msg.b}</p>
              </div>
            </div>
            {/* Fabi, el robot de la Mesa de Servicio, en el espacio libre del saludo */}
            <div className="hap-fabpsi">
              <FabpsiFlotante robot={robotFabi} />
            </div>
            <span className="hap-fecha">
              <i className="ti ti-calendar" /> {fmtHoy()}
            </span>
          </div>
          <div className="hap-row2">
            <button
              className="hap-cta"
              onClick={() => nav("/mesa-de-servicio")}
            >
              <i className="ti ti-plus" aria-hidden="true" />
              <span>Reportar Incidente</span>
            </button>
          </div>
        </div>
      </div>


      {/* ══ AVISOS: un comunicado importante reciente (≤ 15 días) y los cumpleaños de hoy, en una línea ══ */}
      {(() => {
        const aviso = coms.find((c) => /importante/i.test(c.tipo || "") && Date.now() - new Date(c.fechaPublicacion) < 15 * 864e5);
        if (!aviso && !cumpleHoy.length && !ops) return null;
        const nombres = cumpleHoy.slice(0, 2).map((b) => (b.nombre + " " + (b.apellidoPaterno || "")).toLowerCase()).join(" y ");
        return (
          <div className="hx-avisos">
            {aviso && (
              <span className="hx-aviso">
                <i className="ti ti-speakerphone" aria-hidden="true" />
                <b>Aviso</b> {aviso.encabezado}
              </span>
            )}
            {cumpleHoy.length > 0 && (
              <button type="button" className="hx-cumple-chip" onClick={() => setMBdays(true)} title="Ver cumpleaños">
                <span aria-hidden="true">🎂</span>
                Hoy {cumpleHoy.length > 1 ? "cumplen" : "cumple"} <b>{nombres}</b>
                {cumpleHoy.length > 2 ? " y " + (cumpleHoy.length - 2) + " más" : ""}
                <span className="hx-cumple-ver">Ver próximos →</span>
              </button>
            )}
            {ops && (
              <button type="button" className="hx-aviso-nuevo" onClick={() => setMCom(true)}>
                <i className="ti ti-plus" aria-hidden="true" /> Comunicado
              </button>
            )}
          </div>
        );
      })()}

      {/* ══ MIS HERRAMIENTAS: apps de la empresa + soporte, en un solo lugar ══ */}
      <section className="hx-lanzador" aria-label="Mis herramientas">
        {(() => {
          const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const todas = [
            ...QUICK_APPS.map((a) => ({ id: "app-" + a.name, nombre: a.name, icon: a.icon, bg: a.bg, color: a.color, abrir: () => window.open(a.url, "_blank") })),
            ...ACCESOS.filter((a) => !/reportar/i.test(a.label)).map((a) => ({ id: "acc-" + a.label, nombre: a.label, icon: a.icon, bg: a.bg, color: a.color, abrir: () => (a.url ? window.open(a.url, "_blank") : nav(a.path)) })),
          ];
          const q = norm(busca.trim());
          const vis = q ? todas.filter((t) => norm(t.nombre).includes(q)) : todas;
          return (
            <>
              <form
                className="hx-lz-barra"
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (vis[0]) vis[0].abrir();
                  else if (busca.trim()) nav("/mesa-de-servicio");
                }}
              >
                <i className="ti ti-search" aria-hidden="true" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="¿Qué necesitas abrir? Escribe PGI, SISAP, directorio…"
                  aria-label="Buscar herramienta"
                  maxLength={60}
                />
                <kbd>Enter</kbd>
              </form>
              <div className="hx-dock">
                {vis.map((t) => (
                  <button key={t.id} type="button" className="hx-dock-item" onClick={t.abrir} title={t.nombre}>
                    <span className="hx-dock-ico" style={{ background: t.bg, color: t.color }}>
                      <i className={"ti " + t.icon} aria-hidden="true" />
                    </span>
                    <span className="hx-dock-lbl">{t.nombre}</span>
                  </button>
                ))}
                {!vis.length && (
                  <button type="button" className="hx-dock-vacio" onClick={() => nav("/mesa-de-servicio")}>
                    No hay una herramienta con «{busca.trim()}». Pedir ayuda en Mesa de Servicio →
                  </button>
                )}
              </div>
            </>
          );
        })()}
      </section>

      {/* ══ BODY: col-main + col-side ════════════════════════════ */}
      <div className="hx-body">
        {/* ── Columna principal ─────────────────────────────────── */}
        <div className="hx-col-main">
          {/* Cultura Digital */}
          <div className="hx-surface hx-cultura-section">
            <div className="hx-section-hdr">
              <span className="hx-eyebrow">Noticias y Cultura Digital</span>
              {edicion && (
                <span className="hx-edition-chip">
                  Edición {edicion.titulo}
                </span>
              )}
              <button
                className="hx-link-btn"
                onClick={() => nav("/cultura-digital")}
              >
                Ver todas →
              </button>
            </div>

            {lArts ? (
              <div className="hx-art-skeleton-featured" />
            ) : (
              <div className="hx-art-grid">
                {/* Artículo destacado — imagen grande con overlay */}
                {artDestacado && (
                  <div
                    className="hx-art-hero"
                    onClick={() => nav("/cultura-digital")}
                  >
                    <div className="hx-art-hero-img">
                      {artDestacado.fotoUrl ? (
                        <img
                          src={artDestacado.fotoUrl}
                          onError={(e) => e.currentTarget.classList.add("is-rota")}
                          alt={artDestacado.titulo}
                        />
                      ) : (
                        <div
                          className="hx-art-hero-ph"
                          style={{
                            background:
                              (CAT_COLORS[artDestacado.categoria] ||
                                "#8b5cf6") + "22",
                          }}
                        >
                          <span>
                            {CAT_EMOJIS[artDestacado.categoria] || "📄"}
                          </span>
                        </div>
                      )}
                      <div className="hx-art-hero-overlay">
                        <span className="hx-art-hero-badge">
                          Artículo Destacado
                        </span>
                        <h2 className="hx-art-hero-title">
                          {artDestacado.titulo}
                        </h2>
                        <div className="hx-art-hero-meta">
                          {artDestacado.autor} ·{" "}
                          {artDestacado.fechaPublicacion
                            ? new Date(
                                artDestacado.fechaPublicacion,
                              ).toLocaleDateString("es-MX", {
                                day: "numeric",
                                month: "short",
                              })
                            : ""}
                          <span className="hx-art-hero-cta">
                            Leer artículo <i className="ti ti-arrow-right" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Artículos secundarios — imagen thumbnail derecha */}
                <div className="hx-art-side-list">
                  {artSecundarios.map((a) => {
                    const cc = CAT_COLORS[a.categoria] || "#3b82f6";
                    return (
                      <div
                        key={a.idArticulo}
                        className="hx-art-side-item"
                        onClick={() => nav("/cultura-digital")}
                      >
                        <div className="hx-art-side-body">
                          <span
                            className="hx-art-side-cat"
                            style={{ color: cc }}
                          >
                            {CAT_LABELS[a.categoria] || a.categoria}
                          </span>
                          <div className="hx-art-side-title">{a.titulo}</div>
                          <div className="hx-art-side-meta">
                            {a.autor} · 👍 {a.likes ?? 0}
                          </div>
                        </div>
                        <div className="hx-art-side-img">
                          {a.fotoUrl ? (
                            <img src={a.fotoUrl} alt={a.titulo} />
                          ) : (
                            <div
                              className="hx-art-side-ph"
                              style={{ background: cc + "14" }}
                            >
                              <span>{CAT_EMOJIS[a.categoria] || "📄"}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Fila inferior: Comunicados + Servicios TI + Accesos Rápidos */}
          <div className="hx-bottom-row">
            {/* Comunicados */}
            <div className="hx-surface">
              <div className="hx-section-hdr">
                <span className="hx-eyebrow">Comunicados</span>
                {ops && (
                  <button className="hx-link-btn" onClick={() => setMCom(true)}>
                    <i className="ti ti-plus" style={{ fontSize: "0.6rem" }} />{" "}
                    Nuevo
                  </button>
                )}
              </div>
              {lCom ? (
                <div className="hx-loading">Cargando…</div>
              ) : coms.length === 0 ? (
                <div className="hx-empty">Sin comunicados.</div>
              ) : (
                <>
                  {coms.slice(0, 2).map((c, i) => (
                    <div key={i} className="hx-com-row">
                      <div className="hx-com-thumb">
                        {c.imagenUrl ? (
                          <img src={c.imagenUrl} alt={c.encabezado} />
                        ) : (
                          <i
                            className={`ti ${i === 0 ? "ti-windmill" : "ti-device-desktop"}`}
                          />
                        )}
                      </div>
                      <div className="hx-com-body">
                        <span
                          className="hx-com-tag"
                          style={{
                            color: i === 0 ? "#ef4444" : "#7c8cf8",
                            background: i === 0 ? "#fee2e2" : "#ede9fe",
                          }}
                        >
                          {c.tipo || (i === 0 ? "Importante" : "Actualización")}
                        </span>
                        <div className="hx-com-title">{c.encabezado}</div>
                        {c.cuerpo && (
                          <div className="hx-com-desc">{c.cuerpo}</div>
                        )}
                        <div className="hx-com-date">
                          {fmtFecha(c.fechaPublicacion)}
                        </div>
                      </div>
                    </div>
                  ))}
              
                </>
              )}
            </div>

            {/* Servicios TI */}
            <div className="hx-surface">
              <div className="hx-section-hdr">
                <span className="hx-eyebrow">Servicios TI</span>
                {ops && (
                  <button className="hx-link-btn" onClick={() => setMSvc(true)}>
                    <i
                      className="ti ti-refresh"
                      style={{ fontSize: "0.6rem" }}
                    />{" "}
                    Actualizar
                  </button>
                )}
              </div>
              {!lSvc && svcs.length > 0 && (
                <div className={`hx-svc-banner ${allOk ? "ok" : "warn"}`}>
                  <span className="hx-svc-banner-dot" />
                  {allOk
                    ? "Todos los servicios operando"
                    : "Hay incidencias activas"}
                </div>
              )}
              {lSvc ? (
                <div className="hx-loading">Cargando…</div>
              ) : (
                svcs.map((s, i) => {
                  const e = EST[s.estado] ?? EST.operando;
                  const ico = SVC_ICONS[s.nombre] || "ti-server";
                  return (
                    <div key={i} className="hx-svc-row">
                      <div className="hx-svc-ico">
                        <i className={`ti ${ico}`} />
                      </div>
                      <span className="hx-svc-name">{s.nombre}</span>
                      <span
                        className="hx-svc-status"
                        style={{ color: e.color }}
                      >
                        <span
                          className="hx-svc-dot"
                          style={{ background: e.color }}
                        />
                        {e.label}
                      </span>
                    </div>
                  );
                })
              )}
          
            </div>

          </div>
        </div>

        {/* ── Columna derecha ───────────────────────────────────── */}
        <div className="hx-col-side">
          {/* Próximos Cumpleaños */}
          <div className="hx-surface hx-bday-surface">
            <div className="hx-section-hdr">
              <span className="hx-eyebrow">
                {cumpleHoy.length ? "Cumpleaños de hoy" : "Próximos Cumpleaños"}
              </span>
              {bdayRestantes > 0 && (
                <button className="hx-bday-more" onClick={() => setMBdays(true)}>
                  +{bdayRestantes} más
                </button>
              )}
              <button className="hx-link-btn" onClick={() => setMBdays(true)}>
                Ver todos →
              </button>
            </div>
            {lBday ? (
              <div className="hx-loading">Cargando…</div>
            ) : bdayProximos.length === 0 ? (
              <div className="hx-empty">Sin cumpleaños próximos.</div>
            ) : (
              <div className="hx-bday-list">
                {bdayResumen.map((b, i) => {
                  const av = AVS[i % AVS.length];
                  const esHoy =
                    Number(b.mesNacimiento) === mesActual &&
                    Number(b.diaNacimiento) === hoy.getDate();
                  const mes = new Date(2026, Number(b.mesNacimiento) - 1, 1)
                    .toLocaleDateString("es-MX", { month: "short" })
                    .replace(".", "");
                  return (
                    <div key={i} className="hx-bday-row-wrap">
                      {cumpleHoy.length > 0 && i === cumpleHoy.length && (
                        <span className="hx-bday-next-label">
                          Próximos cumpleaños
                        </span>
                      )}
                      <div className="hx-bday-row">
                      <div
                        className="hx-bday-av"
                        style={{ background: av.bg, color: av.c }}
                      >
                        {initials(b)}
                      </div>
                      <div className="hx-bday-info">
                        <div className="hx-bday-name">
                          {b.nombre} {b.apellidoPaterno}
                        </div>
                        <div className="hx-bday-meta">
                          {esHoy ? "Hoy" : `${b.diaNacimiento} ${mes}`} ·{" "}
                          {b.departamento || b.sitio}
                        </div>
                      </div>
                    </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Widget ¡Celebremos juntos! */}
            <div className="hx-bday-celebrate">
              <div className="hx-bday-celebrate-illo">🎂</div>
              <div className="hx-bday-celebrate-text">
                <div className="hx-bday-celebrate-title">
                  ¡Celebremos juntos!
                </div>
                <div className="hx-bday-celebrate-desc">
                  Reconozcamos a quienes hacen grande a FABPSA
                </div>
              </div>
              <button
                className="hx-bday-celebrate-btn"
                onClick={() => {
                  launchConfetti();
                  setMBdays(true);
                }}
              >
                Ver calendario
              </button>
            </div>
          </div>

          {/* Mesa de Servicios */}
          <div className="hx-surface hx-soporte-surface">
            <span
              className="hx-eyebrow"
              style={{ marginBottom: 10, display: "block" }}
            >
              Tu soporte
            </span>
            <div className="hx-soporte-inner">
              <div className="hx-soporte-illo" aria-hidden="true">
                🎧
              </div>
              <div className="hx-soporte-text">
                <div className="hx-soporte-title">Mesa de Servicios</div>
                <div className="hx-soporte-desc">
                  Reporta incidencias, solicita soporte o consulta tus
                  solicitudes.
                </div>
              </div>
            </div>
            <button
              className="hx-soporte-btn"
              onClick={() => nav("/mesa-de-servicio")}
            >
              Ir a Mesa de Servicios{" "}
              <i className="ti ti-arrow-right" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* ══ MODALES ══════════════════════════════════════════════ */}
      {mBdays && (
        <ModalCumpleanos data={bdays} onClose={() => setMBdays(false)} />
      )}

      {mCom && (
        <div className="hx-modal-overlay" onClick={() => setMCom(false)}>
          <div className="hx-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hx-modal-hdr">
              <span className="hx-modal-title">Nuevo comunicado</span>
              <button className="hx-modal-close" onClick={() => setMCom(false)}>
                <i className="ti ti-x" />
              </button>
            </div>
            <div className="hx-modal-body">
              <label className="hx-lbl">Encabezado</label>
              <input
                className="hx-inp"
                placeholder="Título"
                value={fCom.encabezado}
                autoFocus
                onChange={(e) =>
                  setFCom((v) => ({ ...v, encabezado: e.target.value }))
                }
              />
              <label className="hx-lbl" style={{ marginTop: 12 }}>
                Cuerpo <span className="hx-opt">(opcional)</span>
              </label>
              <textarea
                className="hx-ta"
                rows={4}
                placeholder="Descripción…"
                value={fCom.cuerpo}
                onChange={(e) =>
                  setFCom((v) => ({ ...v, cuerpo: e.target.value }))
                }
              />
              <div className="hx-hint">
                <i className="ti ti-calendar" /> Hoy,{" "}
                {new Date().toLocaleDateString("es-MX")}
              </div>
            </div>
            <div className="hx-modal-ftr">
              <button className="hx-btn-cancel" onClick={() => setMCom(false)}>
                Cancelar
              </button>
              <button
                className="hx-btn-primary"
                disabled={sCom || !fCom.encabezado.trim()}
                onClick={pubCom}
              >
                {sCom ? "Publicando…" : "Publicar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mSvc && (
        <div className="hx-modal-overlay" onClick={() => setMSvc(false)}>
          <div className="hx-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hx-modal-hdr">
              <span className="hx-modal-title">Actualizar servicio</span>
              <button className="hx-modal-close" onClick={() => setMSvc(false)}>
                <i className="ti ti-x" />
              </button>
            </div>
            <div className="hx-modal-body">
              <label className="hx-lbl">Servicio</label>
              <select
                className="hx-sel"
                value={fSvc.idServicio}
                onChange={(e) =>
                  setFSvc((v) => ({ ...v, idServicio: e.target.value }))
                }
              >
                <option value="">Seleccionar…</option>
                {svcCat.map((s) => (
                  <option key={s.idServicio} value={s.idServicio}>
                    {s.nombre}
                  </option>
                ))}
              </select>
              <label className="hx-lbl" style={{ marginTop: 12 }}>
                Estado
              </label>
              <div className="hx-radio-row">
                {Object.entries(EST).map(([k, v]) => (
                  <label
                    key={k}
                    className={`hx-radio${fSvc.estado === k ? " on" : ""}`}
                    style={
                      fSvc.estado === k
                        ? { borderColor: v.color, background: v.color + "10" }
                        : {}
                    }
                  >
                    <input
                      type="radio"
                      name="est"
                      checked={fSvc.estado === k}
                      onChange={() => setFSvc((f) => ({ ...f, estado: k }))}
                    />
                    <span
                      className="hx-radio-dot"
                      style={{ background: v.color }}
                    />
                    {v.label}
                  </label>
                ))}
              </div>
              <label className="hx-lbl" style={{ marginTop: 12 }}>
                Detalle <span className="hx-opt">(opcional)</span>
              </label>
              <textarea
                className="hx-ta"
                rows={3}
                value={fSvc.detalle}
                onChange={(e) =>
                  setFSvc((v) => ({ ...v, detalle: e.target.value }))
                }
                placeholder="Descripción…"
              />
            </div>
            <div className="hx-modal-ftr">
              <button className="hx-btn-cancel" onClick={() => setMSvc(false)}>
                Cancelar
              </button>
              <button
                className="hx-btn-primary"
                disabled={sSvc || !fSvc.idServicio}
                onClick={updSvc}
              >
                {sSvc ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
