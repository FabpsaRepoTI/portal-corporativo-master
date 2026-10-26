import { useState, useEffect, useRef, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import "./BlogPage.css";
import "./BlogEditorial.css";
import "./BlogParticipa.css";
import "./BlogDiscover.css";

// ─── helpers ────────────────────────────────────────────────
const TOKEN = () => localStorage.getItem("fabpsa_token");
const apiFetch = (url, opts = {}) =>
  fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN()}`, ...(opts.headers || {}) },
  });

const CATEGORIAS = [
  { value: "todos", label: "Todos", color: "var(--primary)" },
  { value: "tecnologia", label: "Tecnología", color: "#7c8cf8" },
  { value: "ciberseguridad", label: "Ciberseguridad", color: "#fb7185" },
  { value: "nom35", label: "NOM-035", color: "#4ade80" },
  { value: "vidasana", label: "Vida Sana", color: "#38bdf8" },
  { value: "industria", label: "Industria", color: "#fbbf24" },
  { value: "ia", label: "Inteligencia Artificial", color: "#e879f9" },
];
const CAT_MAP = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c]));

function DiscoverIcon({ name, className = "" }) {
  const paths = {
    trending: <><path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    laptop: <><rect x="4" y="4" width="16" height="12" rx="2"/><path d="M2 20h20M8 20h8"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><rect x="9" y="10" width="6" height="5" rx="1"/><path d="M10 10V8a2 2 0 0 1 4 0v2"/></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4"/></>,
    leaf: <><path d="M21 3c-6 0-12 3-12 10 0 3 2 5 5 5 7 0 7-9 7-15Z"/><path d="M3 21c3-6 7-10 13-13"/></>,
    factory: <><path d="M3 21V9l6 3V9l6 3V5h6v16Z"/><path d="M7 17h2M12 17h2M17 17h2"/></>,
    brain: <><path d="M9.5 4a3 3 0 0 0-5 2.2A3 3 0 0 0 3 11a3 3 0 0 0 1.5 4.8A3 3 0 0 0 9.5 18V4ZM14.5 4a3 3 0 0 1 5 2.2A3 3 0 0 1 21 11a3 3 0 0 1-1.5 4.8A3 3 0 0 1 14.5 18V4ZM9.5 9H7M14.5 9H17M9.5 14H7M14.5 14H17M12 3v18"/></>,
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3v-7a4 4 0 0 1-1-2.7V7a4 4 0 0 1 4-4h11a4 4 0 0 1 4 4Z"/><path d="M8 9h8M8 13h5"/></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>,
    comment: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3v-7a4 4 0 0 1-1-2.7V7a4 4 0 0 1 4-4h11a4 4 0 0 1 4 4Z"/>,
    back: <><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const REACCIONES = [
  { tipo: "love", emoji: "❤️", label: "Me encanta" },
  { tipo: "like", emoji: "👍", label: "Me gusta" },
  { tipo: "interest", emoji: "🎉", label: "Me interesa" },
];

// ─── Toast ──────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const show = (msg, tipo = "ok") => {
    clearTimeout(timer.current);
    setToast({ msg, tipo });
    timer.current = setTimeout(() => setToast(null), 3000);
  };
  return { toast, show };
}

function Toast({ toast }) {
  if (!toast) return null;
  const colors = {
    ok: "var(--primary)",
    error: "#fb7185",
    info: "var(--secondary)",
  };
  return (
    <div
      className="blog-toast"
      style={{
        background: "var(--bg-elevated)",
        border: `1px solid ${colors[toast.tipo]}`,
        color: "var(--text-h)",
      }}
    >
      <span style={{ color: colors[toast.tipo], flexShrink: 0 }}>
        {toast.tipo === "ok" ? "✓" : toast.tipo === "error" ? "✕" : "ℹ"}
      </span>
      {toast.msg}
    </div>
  );
}

// ─── Avatar ─────────────────────────────────────────────────
function Avatar({ fotoUrl, nombre, size = 28 }) {
  const iniciales = nombre
    ? nombre
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join("")
    : "?";
  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt={nombre}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          display: "block",
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        background: "linear-gradient(135deg, var(--primary), var(--secondary))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.max(8, size * 0.34),
        fontWeight: 700,
        color: "#fff",
      }}
    >
      {iniciales}
    </div>
  );
}

// ─── Badge categoría ────────────────────────────────────────
function CatBadge({ cat, small }) {
  const c = CAT_MAP[cat] || { label: cat, color: "var(--primary)" };
  return (
    <span
      style={{
        fontSize: small ? 9 : 10,
        fontWeight: 700,
        padding: small ? "2px 6px" : "3px 8px",
        borderRadius: 4,
        background: c.color + "18",
        color: c.color,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {c.label}
    </span>
  );
}

// ─── Skeleton ───────────────────────────────────────────────
function Skeleton({ h = 18, w = "100%", r = 6, mb = 0 }) {
  return (
    <div
      className="blog-skeleton"
      style={{ height: h, width: w, borderRadius: r, marginBottom: mb }}
    />
  );
}

// ─── ReactionsBar ───────────────────────────────────────────
function ReactionsBar({
  reacciones = {},
  miReaccion,
  onReaccionar,
  total = 0,
  usuarios = [],
  compact,
}) {
  const [popover, setPopover] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (!popover) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setPopover(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popover]);

  const colorMap = { love: "#fb7185", like: "#7c8cf8", interest: "#4ade80" };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
      }}
    >
      {REACCIONES.map(({ tipo, emoji, label }) => {
        const count = reacciones[tipo] ?? 0;
        const activo = miReaccion === tipo;
        const col = colorMap[tipo];
        return (
          <button
            key={tipo}
            onClick={() => onReaccionar(tipo)}
            title={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: activo ? col + "18" : "var(--bg-card)",
              border: `1px solid ${activo ? col + "55" : "var(--border)"}`,
              borderRadius: 20,
              padding: compact ? "3px 8px" : "5px 11px",
              fontSize: compact ? 12 : 13,
              fontWeight: 600,
              color: activo ? col : "var(--text-muted)",
              cursor: "pointer",
              transition: "all .15s",
            }}
            onMouseEnter={(e) => {
              if (!activo) e.currentTarget.style.borderColor = col + "55";
            }}
            onMouseLeave={(e) => {
              if (!activo) e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            <span style={{ fontSize: compact ? 13 : 15 }}>{emoji}</span>
            {count > 0 && <span>{count}</span>}
          </button>
        );
      })}

      {total > 0 && (
        <div ref={ref} style={{ position: "relative" }}>
          <div
            onClick={() => setPopover((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex" }}>
              {usuarios.slice(0, 3).map((u, i) => (
                <div
                  key={i}
                  style={{ marginLeft: i === 0 ? 0 : -6, zIndex: 3 - i }}
                >
                  <Avatar fotoUrl={u.fotoUrl} nombre={u.nombre} size={18} />
                </div>
              ))}
            </div>
            {total > 3 && (
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                +{total - 3} más
              </span>
            )}
          </div>

          {popover && (
            <div className="blog-popover">
              <div className="blog-popover-title">
                Personas que reaccionaron
              </div>
              {usuarios.map((u, i) => (
                <div
                  key={i}
                  className="blog-popover-user"
                  style={{ marginBottom: i < usuarios.length - 1 ? 7 : 0 }}
                >
                  <Avatar fotoUrl={u.fotoUrl} nombre={u.nombre} size={22} />
                  <span style={{ fontSize: 12, color: "var(--text-h)" }}>
                    {u.nombre}
                  </span>
                </div>
              ))}
              {total > usuarios.length && (
                <div className="blog-popover-more">
                  +{total - usuarios.length} personas más
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Botón Guardar ──────────────────────────────────────────
function BtnGuardar({ guardado, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={guardado ? "Quitar de guardados" : "Guardar artículo"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        background: guardado ? "rgba(251,191,36,.12)" : "var(--bg-card)",
        border: `1px solid ${guardado ? "rgba(251,191,36,.4)" : "var(--border)"}`,
        borderRadius: 8,
        padding: "5px 10px",
        fontSize: 12,
        fontWeight: 600,
        color: guardado ? "#fbbf24" : "var(--text-muted)",
        cursor: "pointer",
        transition: "all .15s",
      }}
    >
      🔖 {guardado ? "Guardado" : "Guardar"}
    </button>
  );
}

// ─── Modal Artículos Guardados ───────────────────────────────
function ModalGuardados({ open, onClose, onOpen }) {
  const [arts, setArts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiFetch("/api/blog/guardados")
      .then((r) => r.json())
      .then((d) => {
        setArts(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [open]);

  if (!open) return null;
  return (
    <div className="blog-guardados-backdrop" onClick={onClose}>
      <div className="blog-guardados-box" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <div
            style={{ fontSize: 16, fontWeight: 700, color: "var(--text-h)" }}
          >
            🔖 Mis artículos guardados
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              fontSize: 18,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} h={70} r={10} />
            ))}
          </div>
        ) : arts.length === 0 ? (
          <div className="blog-empty">
            <div className="blog-empty-icon">🔖</div>
            <div className="blog-empty-title">Sin artículos guardados</div>
            <div className="blog-empty-sub">
              Guarda artículos para leerlos después
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {arts.map((art) => {
              const cat = CAT_MAP[art.categoria] || { color: "var(--primary)" };
              return (
                <div
                  key={art.idArticulo}
                  onClick={() => {
                    onOpen(art.idArticulo);
                    onClose();
                  }}
                  style={{
                    display: "flex",
                    gap: 12,
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderLeft: `3px solid ${cat.color}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    cursor: "pointer",
                    transition: "all .15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--bg-elevated)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "var(--bg-card)")
                  }
                >
                  {art.fotoUrl && (
                    <img
                      src={art.fotoUrl}
                      alt={art.titulo}
                      style={{
                        width: 60,
                        height: 50,
                        objectFit: "cover",
                        borderRadius: 6,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ marginBottom: 4 }}>
                      <CatBadge cat={art.categoria} small />
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--text-h)",
                        lineHeight: 1.35,
                        marginBottom: 3,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {art.titulo}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {art.autor}
                      {art.tiempoLectura ? ` · ${art.tiempoLectura} min` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Participación ───────────────────────────────────────────
function Participacion({ idEdicion }) {
  const [data, setData] = useState([]);
  useEffect(() => {
    if (!idEdicion) return;
    apiFetch(`/api/blog/participacion?idEdicion=${idEdicion}`)
      .then((r) => r.json())
      .then((d) => setData(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [idEdicion]);
  if (!data.length) return null;
  return (
    <div className="blog-sb-card blog-community-panel">
      <div className="blog-discover-card-title"><DiscoverIcon name="users" /> <span>Comunidad activa</span></div>
      <div className="blog-community-list">
      {data.slice(0, 3).map((u) => (
        <div key={u.login} className="blog-participacion-row">
          <Avatar fotoUrl={u.fotoUrl} nombre={u.nombre} size={56} />
          <div className="blog-community-person">
            <strong>{u.nombre}</strong>
            {(u.area || u.departamento) && <span>{u.area || u.departamento}</span>}
          </div>
          <div className="blog-community-total"><strong>{u.total}</strong><span>{u.total === 1 ? "interacción" : "interacciones"}</span></div>
        </div>
      ))}
      </div>
      <div className="blog-community-thanks"><DiscoverIcon name="message" /> Gracias por compartir y participar.</div>
    </div>
  );
}

// ─── Ranking Trivia ─────────────────────────────────────────
function RankingTrivia({ idTrivia }) {
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch(`/api/blog/trivia/${idTrivia}/ranking`)
      .then((r) => r.json())
      .then((d) => {
        setRanking(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [idTrivia]);
  return (
    <div className="blog-sb-card">
      <div className="blog-sb-title">🏆 Hall of Fame — Trivia</div>
      {loading ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Cargando…
        </div>
      ) : ranking.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Sé el primero en acertar todo 🎯
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ranking.map((r, i) => (
            <div
              key={r.loginUsuario}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 10px",
                borderRadius: 8,
                background:
                  i === 0 ? "rgba(251,191,36,.1)" : "var(--bg-elevated)",
                border: `1px solid ${i === 0 ? "rgba(251,191,36,.3)" : "var(--border)"}`,
              }}
            >
              <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text-h)",
                  }}
                >
                  {r.nombre || r.loginUsuario}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  {new Date(r.fechaRegistro).toLocaleDateString("es-MX", {
                    day: "numeric",
                    month: "short",
                  })}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#fbbf24",
                  background: "rgba(251,191,36,.15)",
                  padding: "2px 7px",
                  borderRadius: 5,
                  flexShrink: 0,
                }}
              >
                {r.aciertos}/{r.totalPreguntas} ✓
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modal artículo completo ─────────────────────────────────
function ModalArticulo({
  articulo,
  articulos = [],
  onClose,
  onOpenArticle,
  onReaccionar,
  onComment,
  onReaccionarComentario,
  onResponder,
  onGuardar,
  loginUsuario,
}) {
  const [comentario, setComentario] = useState("");
  const [sending, setSending] = useState(false);
  const [respondiendo, setRespondiendo] = useState(null);
  const [textoResp, setTextoResp] = useState("");
  const [sendingResp, setSendingResp] = useState(false);

  if (!articulo) return null;
  const cat = CAT_MAP[articulo.categoria] || {
    color: "var(--primary)",
    label: articulo.categoria,
  };
  const reacciones = articulo.reacciones || {};
  const total =
    (reacciones.like || 0) +
    (reacciones.love || 0) +
    (reacciones.interest || 0);
  const colorMap = { love: "#fb7185", like: "#7c8cf8", interest: "#4ade80" };
  const related = [...articulos]
    .filter((a) => a.idArticulo !== articulo.idArticulo)
    .sort((a, b) => Number(b.categoria === articulo.categoria) - Number(a.categoria === articulo.categoria))
    .slice(0, 3);
  const sectionTitles = Array.from(
    String(articulo.contenido || "").matchAll(/<h[2-3][^>]*>(.*?)<\/h[2-3]>/gi),
  ).map((m) => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean).slice(0, 4);

  const handleComment = async () => {
    if (!comentario.trim()) return;
    setSending(true);
    await onComment(articulo.idArticulo, comentario);
    setComentario("");
    setSending(false);
  };

  const handleResponder = async (idComentario) => {
    if (!textoResp.trim()) return;
    setSendingResp(true);
    await onResponder(idComentario, textoResp);
    setTextoResp("");
    setRespondiendo(null);
    setSendingResp(false);
  };

  return (
    <div className="blog-modal-backdrop" onClick={onClose}>
      <div className="blog-modal-box" onClick={(e) => e.stopPropagation()}>
        <header className="blog-reader-toolbar">
          <button onClick={onClose}>← <span>Volver a Cultura Digital</span></button>
        </header>
        {/* Header */}
        {articulo.fotoUrl ? (
          <div
            className="blog-reader-cover"
            style={{ position: "relative", height: 240, overflow: "hidden" }}
          >
            <img
              src={articulo.fotoUrl}
              alt={articulo.titulo}
              className="blog-modal-hero-img"
            />
            <div className="blog-modal-hero-overlay" />
            <button className="blog-modal-close" onClick={onClose}>
              ×
            </button>
          </div>
        ) : (
          <div
            style={{
              height: 8,
              background: `linear-gradient(90deg, ${cat.color}, ${cat.color}88)`,
            }}
          />
        )}

        <div className="blog-modal-body">
          {/* Meta */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 14,
              flexWrap: "wrap",
            }}
          >
            <CatBadge cat={articulo.categoria} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Avatar
                fotoUrl={articulo.fotoAutor}
                nombre={articulo.autor}
                size={20}
              />
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {articulo.autor}
              </span>
            </div>
            {articulo.tiempoLectura && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                · {articulo.tiempoLectura} min de lectura
              </span>
            )}
            {!articulo.fotoUrl && (
              <button className="blog-modal-close-flat" onClick={onClose}>
                ×
              </button>
            )}
          </div>

          {/* Título */}
          <h2 className="blog-modal-title">{articulo.titulo}</h2>

          {/* Contenido */}
          <div
            className="blog-modal-content"
            dangerouslySetInnerHTML={{ __html: articulo.contenido }}
          />

          {/* Reacciones + Guardar */}
          <div
            className="blog-main-reactions"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 28,
              flexWrap: "wrap",
            }}
          >
            <ReactionsBar
              reacciones={reacciones}
              miReaccion={articulo.miReaccion}
              onReaccionar={(tipo) => onReaccionar(articulo.idArticulo, tipo)}
              total={total}
              usuarios={reacciones.usuarios || []}
            />
          </div>

          {/* Comentarios */}
          <div className="blog-comments-head blog-main-comments-head">
            💬 Comentarios ({articulo.comentarios?.length || 0})
          </div>

          {articulo.comentarios?.length === 0 && (
            <div
              className="blog-main-comment-empty"
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                textAlign: "center",
                padding: "16px 0",
                marginBottom: 16,
              }}
            >
              Sé el primero en comentar
            </div>
          )}

          <div
            className="blog-main-comment-list"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {articulo.comentarios?.map((c) => (
              <div key={c.idComentario} className="blog-comment-wrap">
                <Avatar
                  fotoUrl={c.fotoUsuario}
                  nombre={c.nombreUsuario}
                  size={32}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="blog-comment-bubble">
                    <div className="blog-comment-name">{c.nombreUsuario}</div>
                    <div className="blog-comment-text">{c.comentario}</div>
                  </div>

                  <div className="blog-comment-footer">
                    <span className="blog-comment-time">
                      {new Date(c.fecha).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {["like", "love"].map((tipo) => {
                      const emoji = tipo === "like" ? "👍" : "❤️";
                      const count = c.reacciones?.[tipo] ?? 0;
                      const activo = c.reacciones?.miReaccion === tipo;
                      const col = colorMap[tipo];
                      return (
                        <button
                          key={tipo}
                          onClick={() =>
                            onReaccionarComentario(c.idComentario, tipo)
                          }
                          className="blog-comment-react-btn"
                          style={{
                            background: activo ? col + "15" : "none",
                            borderColor: activo ? col + "44" : "transparent",
                            color: activo ? col : "var(--text-muted)",
                          }}
                        >
                          {emoji} {count > 0 && count}
                        </button>
                      );
                    })}
                    <button
                      className="blog-reply-link"
                      onClick={() =>
                        setRespondiendo(
                          respondiendo === c.idComentario
                            ? null
                            : c.idComentario,
                        )
                      }
                    >
                      ↩ Responder
                    </button>
                  </div>

                  {respondiendo === c.idComentario && (
                    <div className="blog-reply-input-wrap">
                      <Avatar fotoUrl={null} nombre={loginUsuario} size={22} />
                      <input
                        className="blog-reply-input"
                        value={textoResp}
                        onChange={(e) => setTextoResp(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            handleResponder(c.idComentario);
                        }}
                        placeholder="Escribe una respuesta…"
                        maxLength={500}
                        autoFocus
                      />
                      <button
                        className="blog-reply-send"
                        onClick={() => handleResponder(c.idComentario)}
                        disabled={sendingResp || !textoResp.trim()}
                      >
                        {sendingResp ? "…" : "↩"}
                      </button>
                    </div>
                  )}

                  {c.respuestas?.length > 0 && (
                    <div className="blog-replies-wrap">
                      {c.respuestas.map((r) => (
                        <div key={r.idRespuesta} className="blog-reply-item">
                          <Avatar
                            fotoUrl={r.fotoUsuario}
                            nombre={r.nombreUsuario}
                            size={24}
                          />
                          <div className="blog-reply-bubble">
                            <div className="blog-reply-name">
                              {r.nombreUsuario}
                            </div>
                            <div className="blog-reply-text">{r.respuesta}</div>
                            <div className="blog-reply-time">
                              {new Date(r.fecha).toLocaleDateString("es-MX", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Input comentario */}
          <div className="blog-comment-input-wrap blog-main-comment-input">
            <Avatar fotoUrl={null} nombre={loginUsuario} size={30} />
            <textarea
              className="blog-comment-textarea"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) handleComment();
              }}
              placeholder="Escribe un comentario… (Ctrl+Enter para enviar)"
              rows={2}
              maxLength={1000}
            />
            <button
              className="blog-comment-send"
              onClick={handleComment}
              disabled={sending || !comentario.trim()}
            >
              {sending ? "…" : "Enviar"}
            </button>
          </div>
        </div>
        <aside className="blog-reader-aside">
          <section className="blog-reader-index">
            <div className="blog-reader-aside-title"><span>Recorrido del artículo</span><small>{articulo.tiempoLectura || 3} min</small></div>
            <div className="blog-reader-progress"><span /></div>
            <ol>
              {(sectionTitles.length ? sectionTitles : ["Inicio de la lectura", "Ideas clave", "Cierre y conclusiones"]).map((titulo, i) => (
                <li key={`${titulo}-${i}`} className={i === 0 ? "active" : ""}>{titulo}</li>
              ))}
            </ol>
          </section>
          <section>
            <div className="blog-reader-aside-title"><span>¿Qué te pareció?</span></div>
            <div className="blog-reader-reactions">
              <button onClick={() => onReaccionar(articulo.idArticulo, "love")}>❤️<span>Me gustó</span><b>{reacciones.love || 0}</b></button>
              <button onClick={() => onReaccionar(articulo.idArticulo, "like")}>👍<span>Interesante</span><b>{reacciones.like || 0}</b></button>
              <button onClick={() => onReaccionar(articulo.idArticulo, "interest")}>🎉<span>Sorprendente</span><b>{reacciones.interest || 0}</b></button>
            </div>
            {reacciones.usuarios?.length > 0 && (
              <div className="blog-reacted-by">
                <div>{reacciones.usuarios.slice(0, 4).map((u, i) => <Avatar key={`${u.nombre}-${i}`} fotoUrl={u.fotoUrl} nombre={u.nombre} size={24} />)}</div>
                <span>{reacciones.usuarios.slice(0, 2).map((u) => u.nombre).join(", ")}{reacciones.usuarios.length > 2 ? ` y ${reacciones.usuarios.length - 2} más` : ""}</span>
              </div>
            )}
          </section>
          <section className="blog-reader-conversation">
            <div className="blog-reader-aside-title"><span>Conversación</span><small>{articulo.comentarios?.length || 0} comentarios</small></div>
            <div className="blog-aside-comment-input">
              <Avatar fotoUrl={null} nombre={loginUsuario} size={28} />
              <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Escribe un comentario…" rows={2} maxLength={1000} />
              <button onClick={handleComment} disabled={sending || !comentario.trim()}>{sending ? "…" : "Publicar"}</button>
            </div>
            {!articulo.comentarios?.length ? (
              <div className="blog-reader-empty"><DiscoverIcon name="comment" /><span>Sé la primera persona en compartir una idea.</span></div>
            ) : (
              <div className="blog-aside-comments">
                {articulo.comentarios.map((c) => (
                  <div className="blog-aside-comment" key={c.idComentario}>
                    <Avatar fotoUrl={c.fotoUsuario} nombre={c.nombreUsuario} size={28} />
                    <div><strong>{c.nombreUsuario}</strong><p>{c.comentario}</p><small>{new Date(c.fecha).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</small></div>
                  </div>
                ))}
              </div>
            )}
          </section>
          {related.length > 0 && (
            <section className="blog-reader-related">
              <div className="blog-reader-aside-title"><span>También te puede interesar</span></div>
              {related.map((art) => (
                <button key={art.idArticulo} onClick={() => onOpenArticle(art.idArticulo)}>
                  {art.fotoUrl && <img src={art.fotoUrl} alt="" />}
                  <span><small>{CAT_MAP[art.categoria]?.label || art.categoria}</small><strong>{art.titulo}</strong></span>
                </button>
              ))}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── Card artículo ───────────────────────────────────────────
function ArticuloCard({
  art,
  onClick,
  onReaccionar,
  onCommentClick,
  onGuardar,
}) {
  const cat = CAT_MAP[art.categoria] || { color: "var(--primary)" };
  return (
    <div
      className="blog-card"
      style={{ borderLeft: `3px solid ${cat.color}` }}
      onClick={() => onClick(art.idArticulo)}
    >
      {art.fotoUrl && (
        <img src={art.fotoUrl} alt={art.titulo} className="blog-card-img" />
      )}
      <div className="blog-card-body">
        <div style={{ marginBottom: 8 }}>
          <CatBadge cat={art.categoria} small />
        </div>
        <div className="blog-card-title">{art.titulo}</div>
        <div className="blog-card-excerpt">{art.extracto}</div>
        <div className="blog-card-footer">
          <div className="blog-card-author">
            <Avatar fotoUrl={art.fotoAutor} nombre={art.autor} size={20} />
            <span className="blog-card-author-name">{art.autor}</span>
            {art.tiempoLectura && (
              <span className="blog-card-author-time">
                · {art.tiempoLectura} min
              </span>
            )}
          </div>
          <div className="blog-card-actions">
            {REACCIONES.map(({ tipo, emoji }) => {
              const count = art.reacciones?.[tipo] || 0;
              const activo = art.miReaccion === tipo;
              if (!activo && count === 0) return null;
              return (
                <button
                  key={tipo}
                  className="blog-card-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReaccionar(art.idArticulo, tipo);
                  }}
                  style={{
                    color: activo ? "var(--primary)" : "var(--text-muted)",
                  }}
                >
                  <span>{emoji}</span>
                  <span style={{ fontWeight: 600 }}>{count}</span>
                </button>
              );
            })}
            <button
              className="blog-card-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCommentClick(art.idArticulo);
              }}
            >
              <span>💬</span>
              <span style={{ fontWeight: 600 }}>{art.comentarios}</span>
            </button>
            <button
              className="blog-card-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onGuardar(art.idArticulo);
              }}
              style={{ color: art.guardado ? "#fbbf24" : "var(--text-muted)" }}
            >
              🔖
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Artículo wide ───────────────────────────────────────────
function ArticuloWide({ art, onClick, onReaccionar, onGuardar }) {
  const cat = CAT_MAP[art.categoria] || { color: "var(--primary)" };
  const emojis = {
    tecnologia: "💻",
    ciberseguridad: "🔐",
    nom35: "📋",
    vidasana: "🌿",
    industria: "🏭",
    ia: "🤖",
  };
  return (
    <div
      className="blog-wide"
      style={{ borderLeft: `3px solid ${cat.color}` }}
      onClick={() => onClick(art.idArticulo)}
    >
      {art.fotoUrl ? (
        <img src={art.fotoUrl} alt={art.titulo} className="blog-wide-thumb" />
      ) : (
        <div className="blog-wide-emoji">{emojis[art.categoria] || "📄"}</div>
      )}
      <div className="blog-wide-body">
        <div className="blog-wide-meta">
          <CatBadge cat={art.categoria} small />
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Avatar fotoUrl={art.fotoAutor} nombre={art.autor} size={16} />
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {art.autor}
              {art.tiempoLectura ? ` · ${art.tiempoLectura} min` : ""}
            </span>
          </div>
        </div>
        <div className="blog-wide-title">{art.titulo}</div>
        <div className="blog-wide-excerpt">{art.extracto}</div>
        <div className="blog-wide-footer">
          {REACCIONES.map(({ tipo, emoji }) => {
            const count = art.reacciones?.[tipo] || 0;
            if (count === 0 && art.miReaccion !== tipo) return null;
            return (
              <button
                key={tipo}
                onClick={(e) => {
                  e.stopPropagation();
                  onReaccionar(art.idArticulo, tipo);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  fontSize: 11,
                  color: "var(--text-muted)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {emoji} {count > 0 && count}
              </button>
            );
          })}
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            💬 {art.comentarios}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onGuardar(art.idArticulo);
            }}
            style={{
              fontSize: 12,
              color: art.guardado ? "#fbbf24" : "var(--text-muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            🔖
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  PÁGINA PRINCIPAL
// ════════════════════════════════════════════════════════════
export default function BlogPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const toast = useToast();

  const [edicion, setEdicion] = useState(null);
  const [articulos, setArticulos] = useState([]);
  const [encuesta, setEncuesta] = useState(null);
  const [archivo, setArchivo] = useState([]);
  const [trivia, setTrivia] = useState(null);
  const [tip, setTip] = useState(null);
  const [loading, setLoading] = useState(true);

  const [catActiva, setCatActiva] = useState("todos");
  const [artAbierto, setArtAbierto] = useState(null);
  const [verArchivo, setVerArchivo] = useState(false);
  const [verGuardados, setVerGuardados] = useState(false);
  const [votando, setVotando] = useState(false);
  const [triviaAbierta, setTriviaAbierta] = useState(false);
  const [modalTrivia, setModalTrivia] = useState(false);
  const [triviaPaso, setTriviaPaso] = useState(0);
  const [modalEncuesta, setModalEncuesta] = useState(false);
  const [respuestasTrivia, setRespuestasTrivia] = useState({});
  const [triviaEnviada, setTriviaEnviada] = useState(false);
  const [enviandoTrivia, setEnviandoTrivia] = useState(false);

  // ── carga inicial ──────────────────────────────────────────
  useEffect(() => {
    cargar();
  }, []);

  /*const cargar = async () => {
    setLoading(true);
    try {
      const edRes = await apiFetch("/api/blog/edicion/activa").then((r) =>
        r.json(),
      );
      if (!edRes) {
        setLoading(false);
        return;
      }
      setEdicion(edRes);
      const [arts, enc, arc, triv, tipData] = await Promise.all([
        apiFetch(`/api/blog/articulos?idEdicion=${edRes.idEdicion}`).then((r) =>
          r.json(),
        ),
        apiFetch(`/api/blog/encuesta?idEdicion=${edRes.idEdicion}`)
          .then((r) => r.json())
          .catch(() => null),
        apiFetch("/api/blog/archivo").then((r) => r.json()),
        apiFetch(`/api/blog/trivia?idEdicion=${edRes.idEdicion}`)
          .then((r) => r.json())
          .catch(() => null),
        apiFetch("/api/blog/tips/activo")
          .then((r) => r.json())
          .catch(() => null),
      ]);
      setArticulos(Array.isArray(arts) ? arts : []);
      setEncuesta(enc);
      setArchivo(Array.isArray(arc) ? arc : []);
      setTrivia(triv);
      setTip(tipData);
    } catch {
      toast.show("Error cargando el blog", "error");
    } finally {
      setLoading(false);
    }
  };*/

  const cargar = async () => {
    setLoading(true);
    try {
      const edRes = await apiFetch("/api/blog/edicion/activa").then((r) =>
        r.json(),
      );
      if (!edRes) {
        setLoading(false);
        return;
      }
      setEdicion(edRes);

      const [arts, enc, arc, triv, tipData] = await Promise.all([
        apiFetch(`/api/blog/articulos?idEdicion=${edRes.idEdicion}`).then((r) =>
          r.json(),
        ),
        apiFetch(`/api/blog/encuesta?idEdicion=${edRes.idEdicion}`)
          .then((r) => r.json())
          .catch(() => null),
        apiFetch("/api/blog/archivo").then((r) => r.json()),
        apiFetch(`/api/blog/trivia?idEdicion=${edRes.idEdicion}`)
          .then((r) => r.json())
          .catch(() => null),
        apiFetch("/api/blog/tips/activo")
          .then((r) => r.json())
          .catch(() => null),
      ]);

      const artsArray = Array.isArray(arts) ? arts : [];

      // hidratar estado personal (miReaccion + guardado)
      const estado = await apiFetch(
        `/api/blog/articulos/estado?idEdicion=${edRes.idEdicion}`,
      )
        .then((r) => r.json())
        .catch(() => []);

      const estadoMap = {};
      if (Array.isArray(estado)) {
        estado.forEach((e) => {
          estadoMap[e.idArticulo] = e;
        });
      }

      const articulosHidratados = artsArray.map((a) => ({
        ...a,
        miReaccion: estadoMap[a.idArticulo]?.miReaccion || null,
        guardado:
          estadoMap[a.idArticulo]?.guardado === 1 ||
          estadoMap[a.idArticulo]?.guardado === true,
      }));

      setArticulos(articulosHidratados);
      setEncuesta(enc);
      setArchivo(Array.isArray(arc) ? arc : []);
      setTrivia(triv);
      setTip(tipData);
    } catch {
      toast.show("Error cargando el blog", "error");
    } finally {
      setLoading(false);
    }
  };

  // ── abrir artículo ─────────────────────────────────────────
  const abrirArticulo = async (idArticulo) => {
    try {
      const data = await apiFetch(`/api/blog/articulos/${idArticulo}`).then(
        (r) => r.json(),
      );
      setArtAbierto(data);
    } catch {
      toast.show("No se pudo cargar el artículo", "error");
    }
  };

  // ── reaccionar artículo ────────────────────────────────────
  const handleReaccionar = useCallback(
    async (idArticulo, tipo) => {
      try {
        const res = await apiFetch(
          `/api/blog/articulos/${idArticulo}/reaccionar`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tipo }),
          },
        ).then((r) => r.json());

        const updater = (art) => {
          if (art.idArticulo !== idArticulo) return art;
          const prev = art.reacciones || { like: 0, love: 0, interest: 0 };
          const prevTipo = art.miReaccion;
          const newReacciones = { ...prev };
          if (res.accion === "removed") {
            newReacciones[tipo] = Math.max(0, (newReacciones[tipo] || 0) - 1);
          } else if (res.accion === "added") {
            newReacciones[tipo] = (newReacciones[tipo] || 0) + 1;
          } else if (res.accion === "changed") {
            if (prevTipo)
              newReacciones[prevTipo] = Math.max(
                0,
                (newReacciones[prevTipo] || 0) - 1,
              );
            newReacciones[tipo] = (newReacciones[tipo] || 0) + 1;
          }
          return {
            ...art,
            reacciones: newReacciones,
            miReaccion: res.accion === "removed" ? null : tipo,
          };
        };

        setArticulos((prev) => prev.map(updater));
        if (artAbierto?.idArticulo === idArticulo)
          setArtAbierto((prev) => updater(prev));

        const msgs = {
          added: "¡Reacción registrada!",
          removed: "Reacción eliminada",
          changed: "Reacción actualizada",
        };
        toast.show(msgs[res.accion] || "Ok");
      } catch {
        toast.show("Error al reaccionar", "error");
      }
    },
    [artAbierto],
  );

  // ── reaccionar comentario ──────────────────────────────────
  const handleReaccionarComentario = useCallback(async (idComentario, tipo) => {
    try {
      const res = await apiFetch(
        `/api/blog/comentarios/${idComentario}/reaccionar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo }),
        },
      ).then((r) => r.json());

      setArtAbierto((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          comentarios: prev.comentarios.map((c) => {
            if (c.idComentario !== idComentario) return c;
            const prevR = c.reacciones || { like: 0, love: 0 };
            const newR = { ...prevR };
            if (res.accion === "removed")
              newR[tipo] = Math.max(0, (newR[tipo] || 0) - 1);
            else if (res.accion === "added") newR[tipo] = (newR[tipo] || 0) + 1;
            else if (res.accion === "changed") {
              if (prevR.miReaccion)
                newR[prevR.miReaccion] = Math.max(
                  0,
                  (newR[prevR.miReaccion] || 0) - 1,
                );
              newR[tipo] = (newR[tipo] || 0) + 1;
            }
            return {
              ...c,
              reacciones: {
                ...newR,
                miReaccion: res.accion === "removed" ? null : tipo,
              },
            };
          }),
        };
      });
    } catch {
      toast.show("Error al reaccionar", "error");
    }
  }, []);

  // ── comentar ──────────────────────────────────────────────
  const handleComment = async (idArticulo, texto) => {
    try {
      await apiFetch(`/api/blog/articulos/${idArticulo}/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comentario: texto }),
      });
      const data = await apiFetch(`/api/blog/articulos/${idArticulo}`).then(
        (r) => r.json(),
      );
      setArtAbierto(data);
      setArticulos((prev) =>
        prev.map((a) =>
          a.idArticulo === idArticulo
            ? { ...a, comentarios: (a.comentarios || 0) + 1 }
            : a,
        ),
      );
      toast.show("💬 Comentario publicado");
    } catch {
      toast.show("Error al comentar", "error");
    }
  };

  // ── responder comentario ───────────────────────────────────
  const handleResponder = async (idComentario, respuesta) => {
    try {
      await apiFetch(`/api/blog/comentarios/${idComentario}/responder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respuesta }),
      });
      if (artAbierto) {
        const data = await apiFetch(
          `/api/blog/articulos/${artAbierto.idArticulo}`,
        ).then((r) => r.json());
        setArtAbierto(data);
      }
      toast.show("↩ Respuesta publicada");
    } catch {
      toast.show("Error al responder", "error");
    }
  };

  // ── guardar artículo ──────────────────────────────────────
  const handleGuardar = useCallback(
    async (idArticulo) => {
      try {
        const res = await apiFetch(
          `/api/blog/articulos/${idArticulo}/guardar`,
          {
            method: "POST",
          },
        ).then((r) => r.json());
        const guardado = res.accion === "added";
        setArticulos((prev) =>
          prev.map((a) =>
            a.idArticulo === idArticulo ? { ...a, guardado } : a,
          ),
        );
        if (artAbierto?.idArticulo === idArticulo)
          setArtAbierto((p) => ({ ...p, guardado }));
        toast.show(
          guardado ? "🔖 Artículo guardado" : "Artículo eliminado de guardados",
        );
      } catch {
        toast.show("Error al guardar", "error");
      }
    },
    [artAbierto],
  );

  // ── votar encuesta ────────────────────────────────────────
  const handleVotar = async (idOpcion) => {
    if (!encuesta || votando) return;
    setVotando(true);
    try {
      const res = await apiFetch(
        `/api/blog/encuestas/${encuesta.idEncuesta}/votar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idOpcion }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "YA_VOTASTE")
          toast.show("Ya registraste tu voto", "info");
        else throw new Error(data.error);
      } else {
        toast.show("✅ ¡Voto registrado!");
        const enc = await apiFetch(
          `/api/blog/encuesta?idEdicion=${edicion.idEdicion}`,
        ).then((r) => r.json());
        setEncuesta(enc);
      }
    } catch {
      toast.show("Error al votar", "error");
    } finally {
      setVotando(false);
    }
  };

  // ── trivia ────────────────────────────────────────────────
  const handleResponderTrivia = async () => {
    if (!trivia) return;
    const totalPreguntas = trivia.preguntas?.length || 0;
    if (Object.keys(respuestasTrivia).length < totalPreguntas) {
      toast.show("Responde todas las preguntas", "info");
      return;
    }
    setEnviandoTrivia(true);
    try {
      const respuestas = Object.entries(respuestasTrivia).map(
        ([idPregunta, idOpcion]) => ({
          idPregunta: parseInt(idPregunta),
          idOpcion: parseInt(idOpcion),
        }),
      );
      const res = await apiFetch(
        `/api/blog/trivia/${trivia.idTrivia}/responder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ respuestas }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "YA_RESPONDISTE")
          toast.show("Ya completaste esta trivia", "info");
        else throw new Error(data.error);
      } else {
        setTriviaEnviada(true);
        const trivNew = await apiFetch(
          `/api/blog/trivia?idEdicion=${edicion.idEdicion}`,
        ).then((r) => r.json());
        setTrivia(trivNew);
        toast.show(`🎯 ¡${data.aciertos}/${data.totalPreguntas} correctas!`);
      }
    } catch (e) {
      toast.show(e.message, "error");
    } finally {
      setEnviandoTrivia(false);
    }
  };

  // ── filtrado ──────────────────────────────────────────────
  const artsFiltrados =
    catActiva === "todos"
      ? articulos
      : articulos.filter((a) => a.categoria === catActiva);

  const hero = artsFiltrados.find((a) => a.destacado) || artsFiltrados[0];
  const grilla = artsFiltrados
    .filter((a) => a.idArticulo !== hero?.idArticulo)
    .slice(0, 3);
  const restantes = artsFiltrados
    .filter((a) => a.idArticulo !== hero?.idArticulo)
    .slice(3);
  const heroReacciones = hero?.reacciones || {};
  const heroTotal =
    (heroReacciones.like || 0) +
    (heroReacciones.love || 0) +
    (heroReacciones.interest || 0);

  // ─────────────────────────────────────────────────────────
  return (
    <>
      <div className="blog-root">
        {/* ── Topbar ── */}
        <div className="blog-topbar">
          <div className="blog-topbar-inner">
            <div className="blog-topbar-head">
              <div className="blog-topbar-brand">
                <button className="blog-back-home" onClick={() => navigate("/")}>
                  <DiscoverIcon name="back" />
                  <span>Volver al inicio</span>
                </button>
              <div className="blog-topbar-logo-area">
                <img
                  src={new URL("../../logo-fabpsa.png", import.meta.url).href}
                  alt="FABPSA"
                  className="blog-topbar-logo"
                />
                <div>
                  <div className="blog-topbar-kicker">PORTAL CORPORATIVO</div>
                  <h1 className="blog-topbar-title">
                    Cultura Digital
                  </h1>
                  <div className="blog-topbar-sub">
                    Ideas para aprender, cuidarnos y trabajar mejor.
                  </div>
                </div>
              </div>
              </div>
              <div className="blog-topbar-actions">
                <div className="blog-search-box">
                  <i className="ti ti-search" />
                  <span>Buscar artículos</span>
                </div>
                <button
                  className={`blog-btn-sm${verGuardados ? " active" : ""}`}
                  onClick={() => setVerGuardados(true)}
                >
                  🔖 Guardados
                </button>
                <button
                  className={`blog-btn-sm${verArchivo ? " active" : ""}`}
                  onClick={() => setVerArchivo((v) => !v)}
                >
                  📁 Archivo
                </button>
                {user?.area === "SISTEMAS" && (
                  <button
                    className="blog-btn-sm"
                    onClick={() => navigate("/cultura-digital/admin")}
                  >
                    ⚙️ Admin
                  </button>
                )}
              </div>
            </div>

            {/* Filtros */}
            <div className="blog-cat-nav">
              {CATEGORIAS.map((cat) => {
                const activa = catActiva === cat.value;
                return (
                  <button
                    key={cat.value}
                    className={`blog-cat-pill${activa ? " active" : ""}`}
                    onClick={() => setCatActiva(cat.value)}
                    style={{
                      borderBottom: `2px solid ${activa ? cat.color : "transparent"}`,
                    }}
                  >
                    <span
                      className="blog-cat-dot"
                      style={{ background: cat.color }}
                    />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Contenido ── */}
        <div className="blog-content">
          {/* Archivo */}
          {verArchivo && (
            <div className="blog-archivo">
              <div className="blog-archivo-title">📁 Ediciones anteriores</div>
              <div className="blog-archivo-grid">
                {archivo.map((ed) => (
                  <div key={ed.idEdicion} className="blog-archivo-item">
                    <div className="blog-archivo-item-title">
                      {ed.titulo}
                      {(ed.activa === true || ed.activa === 1) && (
                        <span className="blog-archivo-item-badge">ACTUAL</span>
                      )}
                    </div>
                    <div className="blog-archivo-item-meta">
                      {ed.totalArticulos} artículos
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div>
              <Skeleton h={340} r={14} mb={28} />
              <div className="blog-grid">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    style={{
                      background: "var(--bg-card)",
                      borderRadius: 12,
                      padding: 18,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <Skeleton h={12} w="40%" mb={10} />
                    <Skeleton h={16} mb={8} />
                    <Skeleton h={12} mb={4} />
                    <Skeleton h={12} w="70%" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sin edición */}
          {!loading && !edicion && (
            <div className="blog-empty" style={{ padding: 80 }}>
              <div className="blog-empty-icon" style={{ fontSize: 40 }}>
                📭
              </div>
              <div className="blog-empty-title" style={{ fontSize: 16 }}>
                Aún no hay publicaciones
              </div>
              <div className="blog-empty-sub">
                El equipo de Sistemas está preparando la primera edición.
              </div>
            </div>
          )}

          {/* Contenido principal */}
          {!loading && edicion && (
            <div className="blog-layout">
              {/* MAIN */}
              <main className="blog-main">
                {/* HERO */}
                {hero && (
                  <div
                    className="blog-hero"
                    onClick={() => abrirArticulo(hero.idArticulo)}
                  >
                    {hero.fotoUrl ? (
                      <img
                        src={hero.fotoUrl}
                        alt={hero.titulo}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: `linear-gradient(135deg, ${(CAT_MAP[hero.categoria]?.color || "var(--primary)") + "22"} 0%, var(--bg-elevated) 100%)`,
                        }}
                      >
                        <div
                          className="blog-hero-grid-pattern"
                          style={{
                            "--hero-color":
                              (CAT_MAP[hero.categoria]?.color ||
                                "var(--primary)") + "08",
                          }}
                        />
                      </div>
                    )}
                    <div className="blog-hero-overlay" />
                    <div className="blog-hero-body">
                      <div className="blog-hero-badge">
                        ⭐ Artículo destacado
                      </div>
                      <h2 className="blog-hero-title">{hero.titulo}</h2>
                      {hero.extracto && (
                        <p className="blog-hero-excerpt">{hero.extracto}</p>
                      )}
                      <div className="blog-hero-meta">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                          }}
                        >
                          <Avatar
                            fotoUrl={hero.fotoAutor}
                            nombre={hero.autor}
                            size={20}
                          />
                          <span className="blog-hero-meta-text">
                            {hero.autor}
                          </span>
                        </div>
                        {hero.tiempoLectura && (
                          <span className="blog-hero-meta-text">
                            · {hero.tiempoLectura} min
                          </span>
                        )}
                        <div className="blog-hero-reactions">
                          <span className="blog-hero-read">Leer artículo →</span>
                          {REACCIONES.map(({ tipo, emoji }) => {
                            const count = hero.reacciones?.[tipo] || 0;
                            const activo = hero.miReaccion === tipo;
                            if (!activo && count === 0) return null;
                            return (
                              <button
                                key={tipo}
                                className="blog-hero-react-pill"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReaccionar(hero.idArticulo, tipo);
                                }}
                              >
                                {emoji} {count > 0 && count}
                              </button>
                            );
                          })}
                          <button
                            className={`blog-hero-save${hero.guardado ? " saved" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGuardar(hero.idArticulo);
                            }}
                            title={hero.guardado ? "Guardado" : "Guardar"}
                          >
                            🔖
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Grilla */}
                {grilla.length > 0 && (
                  <>
                    <div className="blog-section-heading">
                      <div className="blog-section-label">
                        <span
                          className="blog-section-bar"
                          style={{ background: "var(--primary)" }}
                        />
                        Publicaciones recientes
                        {catActiva !== "todos" && <span className="blog-active-filter">{CAT_MAP[catActiva]?.label}</span>}
                      </div>
                      {catActiva !== "todos" && (
                        <button className="blog-show-all" onClick={() => setCatActiva("todos")}>Mostrar todos ({articulos.length})</button>
                      )}
                    </div>
                    <div className="blog-grid">
                      {grilla.map((art) => (
                        <ArticuloCard
                          key={art.idArticulo}
                          art={art}
                          onClick={abrirArticulo}
                          onReaccionar={handleReaccionar}
                          onCommentClick={abrirArticulo}
                          onGuardar={handleGuardar}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* Restantes */}
                {restantes.length > 0 && (
                  <>
                    <div className="blog-section-label">
                      <span
                        className="blog-section-bar"
                        style={{ background: "var(--secondary)" }}
                      />
                      Más artículos
                    </div>
                    {restantes.map((art) => (
                      <ArticuloWide
                        key={art.idArticulo}
                        art={art}
                        onClick={abrirArticulo}
                        onReaccionar={handleReaccionar}
                        onGuardar={handleGuardar}
                      />
                    ))}
                  </>
                )}

                {!loading && artsFiltrados.length === 0 && (
                  <div className="blog-empty">
                    <div className="blog-empty-icon">🔍</div>
                    <div className="blog-empty-title">
                      Sin artículos en esta categoría
                    </div>
                    <div className="blog-empty-sub">
                      Pronto habrá contenido aquí
                    </div>
                  </div>
                )}
              </main>

              {/* SIDEBAR */}
              <aside className="blog-sidebar">
                <section className="blog-participa">
                  <h2>PARTICIPA ESTA SEMANA</h2>
                  <div className="blog-participa-grid">
                {/* Tip */}
                {tip && (
                  <div className="blog-tip-card">
                    <div className="blog-tip-bg-icon">{tip.icono}</div>
                    <div className="blog-tip-label">
                      <i className="ti ti-bulb blog-participa-title-icon" /> Tip de la semana
                    </div>
                    <div className="blog-tip-text">
                      <span>“Toma 5 minutos entre actividades</span>
                      <span>para respirar profundo. Tu cerebro lo</span>
                      <span>necesita tanto como tu cuerpo.”</span>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <CatBadge cat={tip.categoria} small />
                    </div>
                  </div>
                )}

                {/* Trivia */}
                {trivia && (
                  <div
                    className={`blog-sb-card blog-trivia-card${modalTrivia ? " is-open" : ""}`}
                    style={{ padding: 0, overflow: "hidden" }}
                  >
                    {modalTrivia && (
                      <button className="blog-interactive-close" onClick={() => setModalTrivia(false)}>×</button>
                    )}
                    <div
                      style={{
                        background: "linear-gradient(90deg, #7c8cf8, #e879f9)",
                        padding: "14px 18px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                        }}
                      >
                        <i className="ti ti-puzzle blog-participa-title-icon" /> Trivia del mes
                      </div>
                      {trivia.resultado && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: "#fff",
                            background: "rgba(255,255,255,.2)",
                            borderRadius: 6,
                            padding: "3px 8px",
                          }}
                        >
                          {trivia.resultado.aciertos}/
                          {trivia.resultado.totalPreguntas} ✓
                        </span>
                      )}
                    </div>
                    {!modalTrivia && (
                      <div className="blog-interactive-preview">
                        <div>{trivia.preguntas?.length || 0} preguntas · Una oportunidad</div>
                        <p className="blog-trivia-description">Pon a prueba tus conocimientos de cultura general.</p>
                        <button onClick={() => { setTriviaPaso(0); setModalTrivia(true); }}>Comenzar trivia →</button>
                      </div>
                    )}
                    <div className="blog-interactive-detail" style={{ padding: 16 }}>
                      {trivia.resultado ? (
                        <div className="blog-trivia-form">
                          <div
                            className="blog-trivia-intro"
                            style={{
                              textAlign: "center",
                              padding: "12px 0 16px",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 36,
                                fontWeight: 900,
                                background:
                                  "linear-gradient(90deg, #7c8cf8, #e879f9)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                                marginBottom: 4,
                              }}
                            >
                              {trivia.resultado.aciertos}/
                              {trivia.resultado.totalPreguntas}
                            </div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: "var(--text-h)",
                              }}
                            >
                              {trivia.resultado.aciertos ===
                              trivia.resultado.totalPreguntas
                                ? "🏆 ¡Perfecto!"
                                : trivia.resultado.aciertos === 0
                                  ? "😅 ¡La próxima te va mejor!"
                                  : "👍 ¡Buen intento!"}
                            </div>
                          </div>
                          <div
                            className="blog-trivia-questions"
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 12,
                            }}
                          >
                            {trivia.preguntas?.map((p, pi) => (
                              <div key={p.idPregunta} className={`blog-trivia-question${pi === triviaPaso ? " is-active" : ""}`}>
                                <div
                                  className="blog-trivia-question-title"
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "var(--text-h)",
                                    marginBottom: 6,
                                  }}
                                >
                                  {pi + 1}. {p.texto}
                                </div>
                                <div
                                  className="blog-trivia-options"
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 4,
                                  }}
                                >
                                  {p.opciones?.map((op) => {
                                    const elegida =
                                      op.idOpcion === p.opcionElegida;
                                    const correcta = op.correcta;
                                    let bg = "var(--bg-elevated)",
                                      color = "var(--text-muted)",
                                      border = "var(--border)";
                                    if (correcta) {
                                      bg = "rgba(74,222,128,.12)";
                                      color = "#4ade80";
                                      border = "#4ade80";
                                    }
                                    if (elegida && !correcta) {
                                      bg = "rgba(251,113,133,.12)";
                                      color = "#fb7185";
                                      border = "#fb7185";
                                    }
                                    return (
                                      <div
                                        key={op.idOpcion}
                                        style={{
                                          padding: "6px 10px",
                                          borderRadius: 7,
                                          fontSize: 11,
                                          background: bg,
                                          color,
                                          border: `1px solid ${border}`,
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 6,
                                          fontWeight:
                                            elegida || correcta ? 700 : 400,
                                        }}
                                      >
                                        {correcta ? "✓" : elegida ? "✗" : "·"}{" "}
                                        {op.texto}
                                      </div>
                                    );
                                  })}
                                </div>
                                {p.explicacion && (
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: "var(--text-muted)",
                                      marginTop: 5,
                                      padding: "6px 8px",
                                      background: "var(--bg-elevated)",
                                      borderRadius: 6,
                                      borderLeft: "2px solid var(--secondary)",
                                      lineHeight: 1.5,
                                    }}
                                  >
                                    💡 {p.explicacion}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          {trivia.resultado.aciertos ===
                            trivia.resultado.totalPreguntas && (
                            <button
                              onClick={() => setTriviaAbierta((v) => !v)}
                              style={{
                                marginTop: 14,
                                width: "100%",
                                padding: 8,
                                background:
                                  "linear-gradient(90deg, #7c8cf8, #e879f9)",
                                border: "none",
                                borderRadius: 8,
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#fff",
                                cursor: "pointer",
                              }}
                            >
                              🏆 Ver ranking de perfectos
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="blog-trivia-form">
                          <div
                            className="blog-trivia-intro"
                            style={{
                              fontSize: 12,
                              color: "var(--text-muted)",
                              marginBottom: 14,
                            }}
                          >
                            {trivia.preguntas?.length} preguntas · Una sola
                            oportunidad
                          </div>
                          <div
                            className="blog-trivia-questions"
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 14,
                            }}
                          >
                            {trivia.preguntas?.map((p, pi) => (
                              <div key={p.idPregunta} className={`blog-trivia-question${pi === triviaPaso ? " is-active" : ""}`}>
                                <div
                                  className="blog-trivia-question-title"
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "var(--text-h)",
                                    marginBottom: 8,
                                    lineHeight: 1.4,
                                  }}
                                >
                                  {pi + 1}. {p.texto}
                                </div>
                                <div
                                  className="blog-trivia-options"
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 5,
                                  }}
                                >
                                  {p.opciones?.map((op) => {
                                    const sel =
                                      respuestasTrivia[p.idPregunta] ===
                                      op.idOpcion;
                                    return (
                                      <button
                                        className={`blog-trivia-option${sel ? " is-selected" : ""}`}
                                        aria-pressed={sel}
                                        key={op.idOpcion}
                                        onClick={() =>
                                          setRespuestasTrivia((r) => ({
                                            ...r,
                                            [p.idPregunta]: op.idOpcion,
                                          }))
                                        }
                                        style={{
                                          padding: "7px 10px",
                                          borderRadius: 7,
                                          fontSize: 11,
                                          textAlign: "left",
                                          background: sel
                                            ? "rgba(124,140,248,.15)"
                                            : "var(--bg-elevated)",
                                          border: `1px solid ${sel ? "#7c8cf8" : "var(--border)"}`,
                                          color: sel
                                            ? "#7c8cf8"
                                            : "var(--text-body)",
                                          fontWeight: sel ? 700 : 400,
                                          cursor: "pointer",
                                          transition: "all .12s",
                                          width: "100%",
                                        }}
                                      >
                                        {op.texto}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                          <button
                            className="blog-trivia-submit"
                            onClick={handleResponderTrivia}
                            disabled={
                              enviandoTrivia ||
                              Object.keys(respuestasTrivia).length <
                                (trivia.preguntas?.length || 0)
                            }
                            style={{
                              marginTop: 16,
                              width: "100%",
                              padding: 10,
                              background:
                                "linear-gradient(90deg, #7c8cf8, #e879f9)",
                              border: "none",
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 700,
                              color: "#fff",
                              cursor: enviandoTrivia ? "wait" : "pointer",
                              opacity:
                                Object.keys(respuestasTrivia).length <
                                (trivia.preguntas?.length || 0)
                                  ? 0.5
                                  : 1,
                              transition: "opacity .15s",
                            }}
                          >
                            {enviandoTrivia
                              ? "Enviando…"
                              : "🎯 Enviar respuestas"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Ranking trivia */}
                {triviaAbierta &&
                  trivia?.resultado?.aciertos ===
                    trivia?.resultado?.totalPreguntas && (
                    <RankingTrivia idTrivia={trivia.idTrivia} />
                  )}

                {/* Encuesta */}
                {encuesta && (
                  <div className={`blog-sb-card blog-poll-card${modalEncuesta ? " is-open" : ""}`}>
                    {modalEncuesta && (
                      <button className="blog-interactive-close" onClick={() => setModalEncuesta(false)}>×</button>
                    )}
                    <div className="blog-sb-title">
                      <i className="ti ti-message-question blog-participa-title-icon" /> Pregunta de la semana
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--text-body)",
                        lineHeight: 1.5,
                        marginBottom: 14,
                      }}
                    >
                      {encuesta.pregunta}
                    </div>
                    {!modalEncuesta && (
                      <>
                        <div className="blog-poll-preview-options">
                          {encuesta.opciones?.slice(0, 3).map((op, index) => (
                            <button key={op.idOpcion} onClick={() => setModalEncuesta(true)}>
                              <i className={`ti ${index === 0 ? "ti-device-laptop" : index === 1 ? "ti-leaf" : "ti-brain"}`} />
                              <span>{op.texto}</span>
                            </button>
                          ))}
                        </div>
                        <button className="blog-poll-open" onClick={() => setModalEncuesta(true)}>Votar</button>
                      </>
                    )}
                    <div className="blog-interactive-detail">
                    {encuesta.miVoto ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        {encuesta.opciones?.map((op) => {
                          const pct =
                            encuesta.totalVotos > 0
                              ? Math.round(
                                  (op.votos / encuesta.totalVotos) * 100,
                                )
                              : 0;
                          const esMio = op.idOpcion === encuesta.miVoto;
                          return (
                            <div key={op.idOpcion}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  fontSize: 12,
                                  marginBottom: 4,
                                  gap: 8,
                                }}
                              >
                                <span
                                  style={{
                                    color: esMio
                                      ? "var(--primary)"
                                      : "var(--text-body)",
                                    fontWeight: esMio ? 700 : 400,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {esMio && "✓ "}
                                  {op.texto}
                                </span>
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: "var(--text-h)",
                                    flexShrink: 0,
                                  }}
                                >
                                  {pct}%
                                </span>
                              </div>
                              <div className="blog-poll-bar-track">
                                <div
                                  className="blog-poll-bar-fill"
                                  style={{
                                    width: `${pct}%`,
                                    background: esMio
                                      ? "linear-gradient(90deg, var(--primary), var(--secondary))"
                                      : "var(--bg-elevated)",
                                    border: esMio
                                      ? "none"
                                      : "1px solid var(--border)",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                        <div className="blog-poll-count">
                          {encuesta.totalVotos} votos totales
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        {encuesta.opciones?.map((op) => (
                          <button
                            key={op.idOpcion}
                            className="blog-poll-option-btn"
                            onClick={() => handleVotar(op.idOpcion)}
                            disabled={votando}
                            style={{ opacity: votando ? 0.6 : 1 }}
                          >
                            {op.texto}
                          </button>
                        ))}
                      </div>
                    )}
                    </div>
                  </div>
                )}

                  </div>
                </section>

                <section className="blog-discover-grid">
                  <div className="blog-discover-head">
                    <div>
                      <span className="blog-discover-accent" />
                      <h2>DESCUBRE Y CONECTA</h2>
                      <p>Lo que más interesa a nuestra comunidad</p>
                    </div>
                    <button onClick={() => setCatActiva("todos")}>Ver todos los artículos →</button>
                  </div>

                {/* Más leídos */}
                <div className="blog-sb-card blog-discover-articles">
                  <div className="blog-discover-card-title"><DiscoverIcon name="trending" /> <span>Más leídos</span></div>
                  {[...articulos]
                    .sort((a, b) => {
                      const ta =
                        (a.reacciones?.like || 0) +
                        (a.reacciones?.love || 0) +
                        (a.reacciones?.interest || 0);
                      const tb =
                        (b.reacciones?.like || 0) +
                        (b.reacciones?.love || 0) +
                        (b.reacciones?.interest || 0);
                      return tb - ta;
                    })
                    .slice(0, 4)
                    .map((art, i) => {
                      const total =
                        (art.reacciones?.like || 0) +
                        (art.reacciones?.love || 0) +
                        (art.reacciones?.interest || 0);
                      return (
                        <div
                          key={art.idArticulo}
                          className="blog-trending-row"
                          onClick={() => abrirArticulo(art.idArticulo)}
                        >
                          <span
                            className="blog-trending-num"
                            style={{
                              color:
                                i === 0 ? "var(--primary)" : "var(--border)",
                            }}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          {i === 0 && art.fotoUrl && (
                            <img className="blog-discover-thumb" src={art.fotoUrl} alt="" />
                          )}
                          <div className="blog-trending-copy">
                            <div className="blog-trending-title">
                              {art.titulo}
                            </div>
                            <div className="blog-trending-meta">
                              <CatBadge cat={art.categoria} small />
                              <span><DiscoverIcon name="heart" /> {total}</span>
                              <span><DiscoverIcon name="comment" /> {art.comentarios || 0}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Categorías */}
                <div className="blog-sb-card blog-category-card">
                  <div className="blog-discover-card-title"><DiscoverIcon name="grid" /> <span>Explorar por categoría</span></div>
                  <div className="blog-category-grid">
                    {CATEGORIAS.filter((c) => c.value !== "todos").map(
                      (cat) => {
                        const iconos = { tecnologia: "laptop", ciberseguridad: "shield", nom35: "clipboard", vidasana: "leaf", industria: "factory", ia: "brain" };
                        const cantidad = articulos.filter((art) => art.categoria === cat.value).length;
                        return (
                        <button
                          key={cat.value}
                          className="blog-cat-filter-btn"
                          onClick={() => setCatActiva((actual) => actual === cat.value ? "todos" : cat.value)}
                          style={{
                            background:
                              catActiva === cat.value
                                ? cat.color + "18"
                                : "var(--bg-elevated)",
                            color:
                              catActiva === cat.value
                                ? cat.color
                                : "var(--text-muted)",
                            border: `1px solid ${catActiva === cat.value ? cat.color + "40" : "var(--border)"}`,
                          }}
                        >
                          <DiscoverIcon name={iconos[cat.value]} />
                          <strong>{cat.label}</strong>
                          <span>{cantidad} {cantidad === 1 ? "artículo" : "artículos"}</span>
                        </button>
                        );
                      },
                    )}
                  </div>
                </div>
                </section>
              </aside>
            </div>
          )}
          {!loading && edicion && (
            <section className="blog-learning-break">
              <div className="blog-learning-plant">📖<span>🌱</span></div>
              <div className="blog-learning-reflection">
                <span className="blog-learning-kicker">CONOCIMIENTO EN ACCIÓN</span>
                <h2>Aprender también es mejorar la forma en que trabajamos.</h2>
                <p>Una idea útil puede simplificar un proceso, prevenir un problema o ayudarnos a tomar mejores decisiones.</p>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Modal artículo */}
      {artAbierto && (
        <ModalArticulo
          articulo={artAbierto}
          articulos={articulos}
          onClose={() => setArtAbierto(null)}
          onOpenArticle={abrirArticulo}
          onReaccionar={handleReaccionar}
          onComment={handleComment}
          onReaccionarComentario={handleReaccionarComentario}
          onResponder={handleResponder}
          onGuardar={handleGuardar}
          loginUsuario={user?.login}
        />
      )}

      {/* Modal guardados */}
      <ModalGuardados
        open={verGuardados}
        onClose={() => setVerGuardados(false)}
        onOpen={abrirArticulo}
      />

      <Toast toast={toast.toast} />
    </>
  );
}
