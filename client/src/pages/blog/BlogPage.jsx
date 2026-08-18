import { useState, useEffect, useRef, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";

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

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
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
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--bg-elevated)",
        border: `1px solid ${colors[toast.tipo]}`,
        borderRadius: 10,
        padding: "11px 20px",
        fontSize: 13,
        color: "var(--text-h)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 8,
        boxShadow: "0 8px 32px rgba(0,0,0,.35)",
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      <span style={{ color: colors[toast.tipo] }}>
        {toast.tipo === "ok" ? "✓" : toast.tipo === "error" ? "✕" : "ℹ"}
      </span>
      {toast.msg}
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
      style={{
        height: h,
        width: w,
        borderRadius: r,
        background: "var(--bg-elevated)",
        marginBottom: mb,
        animation: "pulse 1.4s ease-in-out infinite",
      }}
    />
  );
}

// ─── Modal artículo completo ─────────────────────────────────
function ModalArticulo({ articulo, onClose, onLike, onComment, loginUsuario }) {
  const [comentario, setComentario] = useState("");
  const [sending, setSending] = useState(false);
  const textRef = useRef();

  if (!articulo) return null;
  const cat = CAT_MAP[articulo.categoria] || {
    color: "var(--primary)",
    label: articulo.categoria,
  };

  const handleComment = async () => {
    if (!comentario.trim()) return;
    setSending(true);
    await onComment(articulo.idArticulo, comentario);
    setComentario("");
    setSending(false);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.72)",
        backdropFilter: "blur(8px)",
        zIndex: 400,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        padding: "32px 16px 60px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          width: "100%",
          maxWidth: 700,
          overflow: "hidden",
        }}
      >
        {/* foto o header con color */}
        {articulo.fotoUrl ? (
          <div
            style={{ position: "relative", height: 240, overflow: "hidden" }}
          >
            <img
              src={articulo.fotoUrl}
              alt={articulo.titulo}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to top, rgba(0,0,0,.8) 0%, transparent 60%)",
              }}
            />
            <button
              onClick={onClose}
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "rgba(0,0,0,.5)",
                border: "1px solid rgba(255,255,255,.2)",
                color: "#fff",
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
        ) : (
          <div
            style={{
              height: 8,
              background: `linear-gradient(90deg, ${cat.color}, ${cat.color}88)`,
            }}
          />
        )}

        <div style={{ padding: "28px 32px" }}>
          {/* Meta superior */}
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
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {articulo.autor}
            </span>
            {articulo.tiempoLectura && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                · {articulo.tiempoLectura} min de lectura
              </span>
            )}
            {!articulo.fotoUrl && (
              <button
                onClick={onClose}
                style={{
                  marginLeft: "auto",
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
            )}
          </div>

          {/* Título */}
          <h2
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "var(--text-h)",
              lineHeight: 1.35,
              marginBottom: 20,
            }}
          >
            {articulo.titulo}
          </h2>

          {/* Contenido */}
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.75,
              color: "var(--text-body)",
              borderBottom: "1px solid var(--border)",
              paddingBottom: 24,
              marginBottom: 20,
            }}
            dangerouslySetInnerHTML={{ __html: articulo.contenido }}
          />

          {/* Like + contador */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 28,
            }}
          >
            <button
              onClick={() => onLike(articulo.idArticulo)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                background: articulo.meGusta
                  ? "rgba(251,113,133,.12)"
                  : "var(--bg-card)",
                border: `1px solid ${articulo.meGusta ? "#fb7185" : "var(--border)"}`,
                borderRadius: 8,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: articulo.meGusta ? "#fb7185" : "var(--text-muted)",
                cursor: "pointer",
                transition: "all .15s",
              }}
            >
              <span style={{ fontSize: 16 }}>
                {articulo.meGusta ? "❤️" : "🤍"}
              </span>
              {articulo.likes} Me gusta
            </button>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              💬 {articulo.comentarios?.length || 0} comentarios
            </span>
          </div>

          {/* Comentarios */}
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-h)",
              marginBottom: 14,
            }}
          >
            Comentarios
          </div>

          {articulo.comentarios?.length === 0 && (
            <div
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                marginBottom: 16,
                textAlign: "center",
                padding: "16px 0",
              }}
            >
              Sé el primero en comentar
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginBottom: 20,
            }}
          >
            {articulo.comentarios?.map((c) => (
              <div
                key={c.idComentario}
                style={{
                  display: "flex",
                  gap: 10,
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background:
                      "linear-gradient(135deg, var(--primary), var(--secondary))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#fff",
                  }}
                >
                  {(c.nombreUsuario || c.loginUsuario)
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--text-h)",
                      marginBottom: 3,
                    }}
                  >
                    {c.nombreUsuario || c.loginUsuario}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text-body)",
                      lineHeight: 1.55,
                    }}
                  >
                    {c.comentario}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      marginTop: 5,
                    }}
                  >
                    {new Date(c.fecha).toLocaleDateString("es-MX", {
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

          {/* Input comentario */}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <textarea
              ref={textRef}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) handleComment();
              }}
              placeholder="Escribe un comentario… (Ctrl+Enter para enviar)"
              rows={2}
              maxLength={1000}
              style={{
                flex: 1,
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 13,
                color: "var(--text-h)",
                resize: "none",
                outline: "none",
                fontFamily: "inherit",
                transition: "border-color .2s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
            />
            <button
              onClick={handleComment}
              disabled={sending || !comentario.trim()}
              style={{
                background: "var(--primary)",
                color: "#0b0f1a",
                border: "none",
                borderRadius: 10,
                padding: "10px 18px",
                fontSize: 13,
                fontWeight: 700,
                cursor:
                  sending || !comentario.trim() ? "not-allowed" : "pointer",
                opacity: sending || !comentario.trim() ? 0.5 : 1,
                transition: "opacity .15s",
                whiteSpace: "nowrap",
              }}
            >
              {sending ? "…" : "Enviar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Card artículo ───────────────────────────────────────────
function ArticuloCard({ art, onClick, onLike, onCommentClick }) {
  const cat = CAT_MAP[art.categoria] || { color: "var(--primary)" };
  return (
    <div
      onClick={() => onClick(art.idArticulo)}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${cat.color}`,
        borderRadius: 12,
        overflow: "hidden",
        cursor: "pointer",
        transition: "all .18s",
        display: "flex",
        flexDirection: "column",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,.25)";
        e.currentTarget.style.background = "var(--bg-elevated)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "";
        e.currentTarget.style.background = "var(--bg-card)";
      }}
    >
      {art.fotoUrl && (
        <img
          src={art.fotoUrl}
          alt={art.titulo}
          style={{
            width: "100%",
            height: 140,
            objectFit: "cover",
            display: "block",
          }}
        />
      )}
      <div
        style={{
          padding: "16px 18px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <CatBadge cat={art.categoria} small />
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text-h)",
            lineHeight: 1.45,
            marginBottom: 8,
            flex: 1,
          }}
        >
          {art.titulo}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            lineHeight: 1.55,
            marginBottom: 14,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {art.extracto}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                flexShrink: 0,
                background: `linear-gradient(135deg, ${cat.color}, var(--secondary))`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 8,
                fontWeight: 700,
                color: "#fff",
              }}
            >
              {(art.autor || "?").slice(0, 2).toUpperCase()}
            </div>
            {art.autor}
            {art.tiempoLectura && <span>· {art.tiempoLectura} min</span>}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLike(art.idArticulo);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "var(--text-muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "3px 6px",
                borderRadius: 6,
                transition: "all .15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#fb7185")}
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--text-muted)")
              }
            >
              <span>{art._meGusta ? "❤️" : "🤍"}</span>
              <span style={{ fontWeight: 600 }}>{art._likes ?? art.likes}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCommentClick(art.idArticulo);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "var(--text-muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "3px 6px",
                borderRadius: 6,
              }}
            >
              <span>💬</span>
              <span style={{ fontWeight: 600 }}>{art.comentarios}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Artículo wide (horizontal) ─────────────────────────────
function ArticuloWide({ art, onClick, onLike }) {
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
      onClick={() => onClick(art.idArticulo)}
      style={{
        display: "flex",
        gap: 0,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${cat.color}`,
        borderRadius: 12,
        overflow: "hidden",
        cursor: "pointer",
        transition: "all .18s",
        marginBottom: 12,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      {art.fotoUrl ? (
        <img
          src={art.fotoUrl}
          alt={art.titulo}
          style={{
            width: 88,
            flexShrink: 0,
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <div
          style={{
            width: 72,
            flexShrink: 0,
            background: "var(--bg-elevated)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
          }}
        >
          {emojis[art.categoria] || "📄"}
        </div>
      )}
      <div style={{ padding: "14px 16px", flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <CatBadge cat={art.categoria} small />
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {art.autor} · {art.tiempoLectura ? `${art.tiempoLectura} min` : ""}
          </span>
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--text-h)",
            lineHeight: 1.4,
            marginBottom: 4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {art.titulo}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--text-muted)",
            lineHeight: 1.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {art.extracto}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLike(art.idArticulo);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "var(--text-muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            {art._meGusta ? "❤️" : "🤍"} {art._likes ?? art.likes}
          </button>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            💬 {art.comentarios}
          </span>
        </div>
      </div>
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
      .then((data) => {
        setRanking(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [idTrivia]);

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 18,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--text-h)",
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        🏆 Hall of Fame — Trivia
      </div>
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
              <div style={{ flex: 1 }}>
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
  const [votando, setVotando] = useState(false);
  const [triviaAbierta, setTriviaAbierta] = useState(false);

  // ── carga inicial ──────────────────────────────────────────
  useEffect(() => {
    cargar();
  }, []);

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
  };

  // ── abrir artículo completo ────────────────────────────────
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

  // ── like ──────────────────────────────────────────────────
  const handleLike = useCallback(
    async (idArticulo) => {
      try {
        const res = await apiFetch(`/api/blog/articulos/${idArticulo}/like`, {
          method: "POST",
        }).then((r) => r.json());
        const added = res.accion === "added";
        // actualiza lista
        setArticulos((prev) =>
          prev.map((a) =>
            a.idArticulo === idArticulo
              ? {
                  ...a,
                  _meGusta: added,
                  _likes: (a._likes ?? a.likes) + (added ? 1 : -1),
                }
              : a,
          ),
        );
        // actualiza modal si está abierto
        if (artAbierto?.idArticulo === idArticulo) {
          setArtAbierto((prev) => ({
            ...prev,
            meGusta: added,
            likes: prev.likes + (added ? 1 : -1),
          }));
        }
        toast.show(added ? "👍 ¡Me gusta registrado!" : "Me gusta eliminado");
      } catch {
        toast.show("Error al registrar like", "error");
      }
    },
    [artAbierto],
  );

  // ── comentar ──────────────────────────────────────────────
  const handleComment = async (idArticulo, texto) => {
    try {
      await apiFetch(`/api/blog/articulos/${idArticulo}/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comentario: texto }),
      });
      // recarga artículo completo para ver el comentario nuevo
      const data = await apiFetch(`/api/blog/articulos/${idArticulo}`).then(
        (r) => r.json(),
      );
      setArtAbierto(data);
      // actualiza contador en la lista
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
        // recarga encuesta con resultados actualizados
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
  const [respuestasTrivia, setRespuestasTrivia] = useState({});
  const [triviaEnviada, setTriviaEnviada] = useState(false);
  const [enviandoTrivia, setEnviandoTrivia] = useState(false);

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
        // recargar trivia para mostrar respuestas correctas
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
    .slice(0, 4);
  const restantes = artsFiltrados
    .filter((a) => a.idArticulo !== hero?.idArticulo)
    .slice(4);

  // ─────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: .45; }
        }
        @media (max-width: 768px) {
          .blog-layout     { grid-template-columns: 1fr !important; }
          .blog-sidebar    { display: none !important; }
          .blog-grid       { grid-template-columns: 1fr !important; }
          .blog-hero-title { font-size: 18px !important; }
          .blog-hero       { height: 260px !important; }
        }
        @media (max-width: 480px) {
          .blog-cat-nav    { gap: 2px !important; }
          .blog-cat-pill   { padding: 8px 10px !important; font-size: 12px !important; }
        }
      `}</style>

      <div style={{ minHeight: "100vh", background: "var(--bg-base)" }}>
        {/* ── Header del hub ── */}
        <div
          style={{
            background: "var(--bg-surface)",
            borderBottom: "1px solid var(--border)",
            padding: "20px 28px 0",
          }}
        >
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <img
                  src={new URL("../../logo-fabpsa.png", import.meta.url).href}
                  alt="FABPSA"
                  style={{
                    height: 36,
                    width: "auto",
                    objectFit: "contain",
                    flexShrink: 0,
                  }}
                />
                <div>
                  <h1
                    style={{
                      fontSize: 34,
                      fontWeight: 800,
                      color: "var(--text-h)",
                      margin: 0,
                      lineHeight: 1.2,
                    }}
                  >
                    {user?.name ? (
                      <>
                        ¡Hola,{" "}
                        <span
                          style={{
                            background: "var(--primary)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
                          }}
                        >
                          {user.name.split(" ")[0]}
                        </span>
                        ! 👋
                      </>
                    ) : (
                      "¡Bienvenido! 👋"
                    )}
                  </h1>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      marginTop: 3,
                    }}
                  >
                    {user?.name
                      ? `Bienvenid${user.name.split(" ")[0].slice(-1).toLowerCase() === "a" ? "a" : "o"} al Blog Tecnológico FABPSA`
                      : "Bienvenido al Blog Tecnológico FABPSA"}
                    {edicion ? ` · Edición ${edicion.titulo}` : ""}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  onClick={() => setVerArchivo((v) => !v)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: verArchivo
                      ? "var(--bg-elevated)"
                      : "var(--bg-card)",
                    border: `1px solid ${verArchivo ? "var(--primary)" : "var(--border)"}`,
                    borderRadius: 8,
                    padding: "7px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: verArchivo ? "var(--primary)" : "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  📁 Archivo
                </button>
                {user?.area === "SISTEMAS" && (
                  <button
                    onClick={() => navigate("/cultura-digital/admin")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "7px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      cursor: "pointer",
                    }}
                  >
                    ⚙️ Admin
                  </button>
                )}
              </div>
            </div>

            {/* Filtros de categoría */}
            <div
              className="blog-cat-nav"
              style={{
                display: "flex",
                gap: 4,
                overflowX: "auto",
                scrollbarWidth: "none",
                paddingBottom: 1,
              }}
            >
              {CATEGORIAS.map((cat) => {
                const activa = catActiva === cat.value;
                return (
                  <button
                    key={cat.value}
                    className="blog-cat-pill"
                    onClick={() => setCatActiva(cat.value)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "10px 14px",
                      borderRadius: "6px 6px 0 0",
                      fontSize: 13,
                      fontWeight: 500,
                      color: activa ? "var(--text-h)" : "var(--text-muted)",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      borderBottom: activa
                        ? `2px solid ${cat.color}`
                        : "2px solid transparent",
                      transition: "all .15s",
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: cat.color,
                        flexShrink: 0,
                      }}
                    />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Contenido ── */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>
          {/* ARCHIVO */}
          {verArchivo && (
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 24,
                marginBottom: 28,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--text-h)",
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                📁 Ediciones anteriores
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                  gap: 10,
                }}
              >
                {archivo.map((ed) => (
                  <div
                    key={ed.idEdicion}
                    onClick={() => {
                      /* TODO: cargar edición del archivo */
                    }}
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "12px 14px",
                      cursor: "pointer",
                      transition: "border-color .15s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.borderColor = "var(--primary)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.borderColor = "var(--border)")
                    }
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--text-h)",
                        marginBottom: 4,
                      }}
                    >
                      {ed.titulo}
                      {(ed.activa === true || ed.activa === 1) && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 9,
                            fontWeight: 800,
                            color: "var(--primary)",
                            background: "rgba(76,201,166,.12)",
                            padding: "1px 5px",
                            borderRadius: 3,
                          }}
                        >
                          ACTUAL
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {ed.totalArticulos} artículos
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LOADING */}
          {loading && (
            <div>
              <div
                style={{
                  borderRadius: 14,
                  overflow: "hidden",
                  marginBottom: 28,
                  height: 340,
                }}
              >
                <Skeleton h={340} r={14} />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                }}
              >
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

          {/* SIN EDICIÓN */}
          {!loading && !edicion && (
            <div style={{ padding: 80, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>📭</div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--text-h)",
                }}
              >
                Aún no hay publicaciones
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  marginTop: 6,
                }}
              >
                El equipo de Sistemas está preparando la primera edición.
              </div>
            </div>
          )}

          {/* CONTENIDO */}
          {!loading && edicion && (
            <div
              className="blog-layout"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 300px",
                gap: 28,
              }}
            >
              {/* MAIN */}
              <main>
                {/* HERO */}
                {hero && (
                  <div
                    className="blog-hero"
                    onClick={() => abrirArticulo(hero.idArticulo)}
                    style={{
                      position: "relative",
                      borderRadius: 14,
                      overflow: "hidden",
                      height: 340,
                      cursor: "pointer",
                      marginBottom: 28,
                      background: "var(--bg-card)",
                    }}
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
                          background: `linear-gradient(135deg,
                          ${(CAT_MAP[hero.categoria]?.color || "var(--primary)") + "22"} 0%,
                          var(--bg-elevated) 100%)`,
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            backgroundImage: `linear-gradient(${(CAT_MAP[hero.categoria]?.color || "var(--primary)") + "08"} 1px, transparent 1px),
                                            linear-gradient(90deg, ${(CAT_MAP[hero.categoria]?.color || "var(--primary)") + "08"} 1px, transparent 1px)`,
                            backgroundSize: "40px 40px",
                          }}
                        />
                      </div>
                    )}
                    {/* overlay gradiente */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background:
                          "linear-gradient(to top, rgba(0,0,0,.9) 0%, rgba(0,0,0,.3) 55%, transparent 100%)",
                      }}
                    />
                    {/* contenido */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        padding: "28px 32px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-end",
                      }}
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: "rgba(76,201,166,.15)",
                          border: "1px solid rgba(76,201,166,.3)",
                          borderRadius: 20,
                          padding: "4px 12px",
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--primary)",
                          letterSpacing: 0.8,
                          textTransform: "uppercase",
                          marginBottom: 10,
                          width: "fit-content",
                        }}
                      >
                        ⭐ Artículo destacado
                      </div>
                      <h2
                        className="blog-hero-title"
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          color: "#fff",
                          lineHeight: 1.3,
                          marginBottom: 12,
                          maxWidth: 540,
                        }}
                      >
                        {hero.titulo}
                      </h2>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 16,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: "rgba(255,255,255,.55)",
                          }}
                        >
                          {hero.autor}
                        </span>
                        {hero.tiempoLectura && (
                          <span
                            style={{
                              fontSize: 12,
                              color: "rgba(255,255,255,.55)",
                            }}
                          >
                            · {hero.tiempoLectura} min
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLike(hero.idArticulo);
                          }}
                          style={{
                            marginLeft: "auto",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            background: "rgba(255,255,255,.1)",
                            border: "1px solid rgba(255,255,255,.2)",
                            borderRadius: 7,
                            padding: "5px 12px",
                            fontSize: 12,
                            color: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          {hero._meGusta ? "❤️" : "🤍"}{" "}
                          {hero._likes ?? hero.likes}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* GRILLA 2x2 */}
                {grilla.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        letterSpacing: 0.8,
                        textTransform: "uppercase",
                        marginBottom: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          width: 3,
                          height: 14,
                          borderRadius: 2,
                          background: "var(--primary)",
                          display: "inline-block",
                        }}
                      />
                      Publicaciones recientes
                    </div>
                    <div
                      className="blog-grid"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 14,
                        marginBottom: 28,
                      }}
                    >
                      {grilla.map((art) => (
                        <ArticuloCard
                          key={art.idArticulo}
                          art={art}
                          onClick={abrirArticulo}
                          onLike={handleLike}
                          onCommentClick={abrirArticulo}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* RESTANTES (wide) */}
                {restantes.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        letterSpacing: 0.8,
                        textTransform: "uppercase",
                        marginBottom: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          width: 3,
                          height: 14,
                          borderRadius: 2,
                          background: "var(--secondary)",
                          display: "inline-block",
                        }}
                      />
                      Más artículos
                    </div>
                    {restantes.map((art) => (
                      <ArticuloWide
                        key={art.idArticulo}
                        art={art}
                        onClick={abrirArticulo}
                        onLike={handleLike}
                      />
                    ))}
                  </>
                )}

                {/* Sin resultados en filtro */}
                {!loading && artsFiltrados.length === 0 && (
                  <div style={{ padding: 60, textAlign: "center" }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--text-h)",
                      }}
                    >
                      Sin artículos en esta categoría
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-muted)",
                        marginTop: 4,
                      }}
                    >
                      Pronto habrá contenido aquí
                    </div>
                  </div>
                )}
              </main>

              {/* SIDEBAR */}
              <aside className="blog-sidebar">
                {/* ── TIP DE LA SEMANA ── */}
                {tip && (
                  <div
                    style={{
                      background:
                        "linear-gradient(135deg, var(--bg-card), var(--bg-elevated))",
                      border: "1px solid var(--border)",
                      borderLeft: "3px solid var(--primary)",
                      borderRadius: 12,
                      padding: 18,
                      marginBottom: 16,
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: -20,
                        right: -20,
                        fontSize: 70,
                        opacity: 0.06,
                        pointerEvents: "none",
                      }}
                    >
                      {tip.icono}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--primary)",
                        letterSpacing: 0.8,
                        textTransform: "uppercase",
                        marginBottom: 10,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {tip.icono} Tip de la semana
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--text-h)",
                        lineHeight: 1.6,
                        fontWeight: 500,
                        fontStyle: "italic",
                      }}
                    >
                      "{tip.texto}"
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <CatBadge cat={tip.categoria} small />
                    </div>
                  </div>
                )}

                {/* ── TRIVIA ── */}
                {trivia && (
                  <div
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      overflow: "hidden",
                      marginBottom: 16,
                    }}
                  >
                    {/* Header trivia */}
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
                        🎯 Trivia del mes
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

                    <div style={{ padding: 16 }}>
                      {/* Ya respondió — mostrar resultado */}
                      {trivia.resultado ? (
                        <div>
                          {/* Puntaje */}
                          <div
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
                                ? "🏆 ¡Perfecto! Todo correcto"
                                : trivia.resultado.aciertos === 0
                                  ? "😅 ¡La próxima te va mejor!"
                                  : "👍 ¡Buen intento!"}
                            </div>
                          </div>

                          {/* Revisión de respuestas */}
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 12,
                            }}
                          >
                            {trivia.preguntas?.map((p, pi) => (
                              <div key={p.idPregunta}>
                                <div
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
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 4,
                                  }}
                                >
                                  {p.opciones?.map((op) => {
                                    const elegida =
                                      op.idOpcion === p.opcionElegida;
                                    const esCorrecta = op.correcta;
                                    let bg = "var(--bg-elevated)",
                                      color = "var(--text-muted)",
                                      border = "var(--border)";
                                    if (esCorrecta) {
                                      bg = "rgba(74,222,128,.12)";
                                      color = "#4ade80";
                                      border = "#4ade80";
                                    }
                                    if (elegida && !esCorrecta) {
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
                                            elegida || esCorrecta ? 700 : 400,
                                        }}
                                      >
                                        {esCorrecta ? "✓" : elegida ? "✗" : "·"}{" "}
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

                          {/* Ver ranking */}
                          {trivia.resultado.aciertos ===
                            trivia.resultado.totalPreguntas && (
                            <button
                              onClick={() => setTriviaAbierta((v) => !v)}
                              style={{
                                marginTop: 14,
                                width: "100%",
                                padding: "8px",
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
                        /* Sin responder — mostrar preguntas */
                        <div>
                          <div
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
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 14,
                            }}
                          >
                            {trivia.preguntas?.map((p, pi) => (
                              <div key={p.idPregunta}>
                                <div
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
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 5,
                                  }}
                                >
                                  {p.opciones?.map((op) => {
                                    const seleccionada =
                                      respuestasTrivia[p.idPregunta] ===
                                      op.idOpcion;
                                    return (
                                      <button
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
                                          background: seleccionada
                                            ? "rgba(124,140,248,.15)"
                                            : "var(--bg-elevated)",
                                          border: `1px solid ${seleccionada ? "#7c8cf8" : "var(--border)"}`,
                                          color: seleccionada
                                            ? "#7c8cf8"
                                            : "var(--text-body)",
                                          fontWeight: seleccionada ? 700 : 400,
                                          cursor: "pointer",
                                          transition: "all .12s",
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
                            onClick={handleResponderTrivia}
                            disabled={
                              enviandoTrivia ||
                              Object.keys(respuestasTrivia).length <
                                (trivia.preguntas?.length || 0)
                            }
                            style={{
                              marginTop: 16,
                              width: "100%",
                              padding: "10px",
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

                {/* ── RANKING TRIVIA (desplegable) ── */}
                {triviaAbierta &&
                  trivia?.resultado?.aciertos ===
                    trivia?.resultado?.totalPreguntas && (
                    <RankingTrivia idTrivia={trivia.idTrivia} />
                  )}

                {/* ── ENCUESTA ── */}
                {encuesta && (
                  <div
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: 20,
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--text-h)",
                        marginBottom: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                      }}
                    >
                      📊 ¿Qué quieres ver?
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
                                }}
                              >
                                <span
                                  style={{
                                    color: esMio
                                      ? "var(--primary)"
                                      : "var(--text-body)",
                                    fontWeight: esMio ? 700 : 400,
                                  }}
                                >
                                  {esMio && "✓ "}
                                  {op.texto}
                                </span>
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: "var(--text-h)",
                                  }}
                                >
                                  {pct}%
                                </span>
                              </div>
                              <div
                                style={{
                                  height: 5,
                                  background: "var(--bg-elevated)",
                                  borderRadius: 3,
                                }}
                              >
                                <div
                                  style={{
                                    height: 5,
                                    borderRadius: 3,
                                    width: `${pct}%`,
                                    background: esMio
                                      ? "linear-gradient(90deg, var(--primary), var(--secondary))"
                                      : "var(--bg-elevated)",
                                    border: esMio
                                      ? "none"
                                      : "1px solid var(--border)",
                                    transition: "width .5s",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--text-muted)",
                            marginTop: 4,
                            textAlign: "right",
                          }}
                        >
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
                            onClick={() => handleVotar(op.idOpcion)}
                            disabled={votando}
                            style={{
                              background: "var(--bg-elevated)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              padding: "9px 12px",
                              fontSize: 13,
                              color: "var(--text-body)",
                              cursor: votando ? "not-allowed" : "pointer",
                              textAlign: "left",
                              transition: "all .15s",
                              opacity: votando ? 0.6 : 1,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor =
                                "var(--primary)";
                              e.currentTarget.style.color = "var(--text-h)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor =
                                "var(--border)";
                              e.currentTarget.style.color = "var(--text-body)";
                            }}
                          >
                            {op.texto}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── TENDENCIAS ── */}
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: 20,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--text-h)",
                      marginBottom: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                    }}
                  >
                    🔥 Más leídos
                  </div>
                  {[...articulos]
                    .sort(
                      (a, b) => (b._likes ?? b.likes) - (a._likes ?? a.likes),
                    )
                    .slice(0, 4)
                    .map((art, i) => (
                      <div
                        key={art.idArticulo}
                        onClick={() => abrirArticulo(art.idArticulo)}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "flex-start",
                          padding: "10px 0",
                          borderBottom:
                            i < 3 ? "1px solid var(--border)" : "none",
                          cursor: "pointer",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color: "var(--border)",
                            lineHeight: 1,
                            width: 22,
                            flexShrink: 0,
                          }}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <div
                            style={{
                              fontSize: 12.5,
                              fontWeight: 600,
                              color: "var(--text-h)",
                              lineHeight: 1.4,
                              marginBottom: 3,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {art.titulo}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--text-muted)",
                              display: "flex",
                              gap: 8,
                            }}
                          >
                            <CatBadge cat={art.categoria} small />
                            <span>👍 {art._likes ?? art.likes}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>

                {/* ── CATEGORÍAS ── */}
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--text-h)",
                      marginBottom: 14,
                    }}
                  >
                    🏷️ Categorías
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {CATEGORIAS.filter((c) => c.value !== "todos").map(
                      (cat) => (
                        <button
                          key={cat.value}
                          onClick={() => setCatActiva(cat.value)}
                          style={{
                            padding: "5px 10px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background:
                              catActiva === cat.value
                                ? cat.color + "18"
                                : "var(--bg-elevated)",
                            color:
                              catActiva === cat.value
                                ? cat.color
                                : "var(--text-muted)",
                            border: `1px solid ${catActiva === cat.value ? cat.color + "40" : "var(--border)"}`,
                            cursor: "pointer",
                            transition: "all .15s",
                          }}
                        >
                          {cat.label}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </aside>
            </div>
          )}
        </div>
      </div>

      {/* Modal artículo completo */}
      {artAbierto && (
        <ModalArticulo
          articulo={artAbierto}
          onClose={() => setArtAbierto(null)}
          onLike={handleLike}
          onComment={handleComment}
          loginUsuario={user?.login}
        />
      )}

      <Toast toast={toast.toast} />
    </>
  );
}
