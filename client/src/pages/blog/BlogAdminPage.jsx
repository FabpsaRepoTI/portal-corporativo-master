import { useState, useEffect, useRef, useContext } from "react";
import { AuthContext } from "../../context/AuthContext";

// ─── helpers ────────────────────────────────────────────────
const TOKEN = () => localStorage.getItem("fabpsa_token");
const apiFetch = (url, opts = {}) =>
  fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN()}`, ...(opts.headers || {}) },
  });

const CATEGORIAS = [
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
    timer.current = setTimeout(() => setToast(null), 3200);
  };
  return { toast, show };
}

function Toast({ toast }) {
  if (!toast) return null;
  const colors = { ok: "#4cc9a6", error: "#fb7185", info: "#7c8cf8" };
  return (
    <div
      style={{
        position: "fixed",
        bottom: 28,
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
        gap: 9,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: colors[toast.tipo], fontSize: 16 }}>
        {toast.tipo === "ok" ? "✓" : toast.tipo === "error" ? "✕" : "ℹ"}
      </span>
      {toast.msg}
    </div>
  );
}

// ─── Modal genérico ─────────────────────────────────────────
function Modal({ open, onClose, title, children, width = 640 }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(6px)",
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 28,
          width: "100%",
          maxWidth: width,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 22,
          }}
        >
          <span
            style={{ fontSize: 16, fontWeight: 700, color: "var(--text-h)" }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Field ──────────────────────────────────────────────────
function Field({ label, required, children, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-muted)",
          marginBottom: 6,
          letterSpacing: 0.3,
        }}
      >
        {label}
        {required && <span style={{ color: "#fb7185", marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
  color: "var(--text-h)",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

// ─── Btn ────────────────────────────────────────────────────
function Btn({
  children,
  onClick,
  color = "#4cc9a6",
  outline,
  small,
  disabled,
  loading,
}) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: small ? "6px 12px" : "9px 16px",
    borderRadius: 8,
    fontSize: small ? 12 : 13,
    fontWeight: 600,
    cursor: disabled || loading ? "not-allowed" : "pointer",
    border: `1px solid ${color}`,
    opacity: disabled || loading ? 0.55 : 1,
    transition: "opacity .15s",
    whiteSpace: "nowrap",
    background: outline ? "transparent" : color,
    color: outline ? color : color === "#4cc9a6" ? "#0b0f1a" : "#fff",
  };
  return (
    <button
      style={base}
      onClick={disabled || loading ? undefined : onClick}
      disabled={disabled || loading}
    >
      {loading ? "⟳" : children}
    </button>
  );
}

// ─── Badge categoría ────────────────────────────────────────
function CatBadge({ cat }) {
  const c = CAT_MAP[cat] || { label: cat, color: "#94a3b8" };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 4,
        background: c.color + "18",
        color: c.color,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      {c.label}
    </span>
  );
}

// ════════════════════════════════════════════════════════════
//  MODAL NUEVO / EDITAR ARTÍCULO
// ════════════════════════════════════════════════════════════
function ModalArticulo({ open, onClose, idEdicion, articulo, onSaved, toast }) {
  const blank = {
    titulo: "",
    extracto: "",
    contenido: "",
    categoria: "tecnologia",
    autor: "",
    tiempoLectura: "",
    destacado: false,
    foto: null,
    fotoPreview: null,
  };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const fotoRef = useRef();

  useEffect(() => {
    if (open) {
      if (articulo) {
        // fetch completo para traer extracto y contenido
        apiFetch(`/api/blog/admin/articulos/${articulo.idArticulo}/detalle`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            const src = data || articulo;
            setForm({
              titulo: src.titulo || "",
              extracto: src.extracto || "",
              contenido: src.contenido || "",
              categoria: src.categoria || "tecnologia",
              autor: src.autor || "",
              tiempoLectura: src.tiempoLectura || "",
              destacado: !!src.destacado,
              foto: null,
              fotoPreview: src.fotoUrl || null,
            });
          })
          .catch(() => {
            // fallback con lo que ya tenemos
            setForm({
              titulo: articulo.titulo || "",
              extracto: articulo.extracto || "",
              contenido: articulo.contenido || "",
              categoria: articulo.categoria || "tecnologia",
              autor: articulo.autor || "",
              tiempoLectura: articulo.tiempoLectura || "",
              destacado: !!articulo.destacado,
              foto: null,
              fotoPreview: articulo.fotoUrl || null,
            });
          });
      } else {
        setForm(blank);
      }
    }
  }, [open, articulo]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleFoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    set("foto", file);
    set("fotoPreview", URL.createObjectURL(file));
  };

  const handleSave = async (publicar = false) => {
    if (
      !form.titulo.trim() ||
      !form.extracto.trim() ||
      !form.contenido.trim()
    ) {
      toast.show("Completa título, extracto y contenido", "error");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("idEdicion", idEdicion);
      fd.append("titulo", form.titulo);
      fd.append("extracto", form.extracto);
      fd.append("contenido", form.contenido);
      fd.append("categoria", form.categoria);
      fd.append("autor", form.autor);
      fd.append("tiempoLectura", form.tiempoLectura || "");
      fd.append("destacado", form.destacado ? "1" : "0");
      if (publicar) fd.append("estatus", "2");
      if (form.foto) fd.append("foto", form.foto);

      let res;
      if (articulo) {
        res = await apiFetch(
          `/api/blog/admin/articulos/${articulo.idArticulo}`,
          { method: "PUT", body: fd },
        );
      } else {
        res = await apiFetch("/api/blog/admin/articulos", {
          method: "POST",
          body: fd,
        });
      }
      if (!res.ok) throw new Error((await res.json()).error);
      if (publicar && articulo) {
        await apiFetch(
          `/api/blog/admin/articulos/${articulo.idArticulo}/publicar`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          },
        );
      }
      toast.show(
        articulo
          ? "Artículo actualizado"
          : publicar
            ? "Artículo publicado"
            : "Borrador guardado",
      );
      onSaved();
      onClose();
    } catch (e) {
      toast.show(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={articulo ? "Editar artículo" : "Nuevo artículo"}
      width={720}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0 20px",
        }}
      >
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Título" required>
            <input
              style={inputStyle}
              value={form.titulo}
              onChange={(e) => set("titulo", e.target.value)}
              placeholder="Título del artículo"
              maxLength={200}
            />
          </Field>
        </div>

        <Field label="Categoría" required>
          <select
            style={inputStyle}
            value={form.categoria}
            onChange={(e) => set("categoria", e.target.value)}
          >
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Autor">
          <input
            style={inputStyle}
            value={form.autor}
            onChange={(e) => set("autor", e.target.value)}
            placeholder="Nombre o área"
            maxLength={100}
          />
        </Field>

        <div style={{ gridColumn: "1 / -1" }}>
          <Field
            label="Extracto"
            required
            hint="Texto corto que aparece en la card (máx. 500 caracteres)"
          >
            <textarea
              style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
              value={form.extracto}
              maxLength={500}
              onChange={(e) => set("extracto", e.target.value)}
              placeholder="Resumen breve del artículo…"
            />
          </Field>
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Contenido" required hint="HTML básico o texto plano">
            <textarea
              style={{
                ...inputStyle,
                resize: "vertical",
                minHeight: 180,
                fontFamily: "monospace",
                fontSize: 12,
              }}
              value={form.contenido}
              onChange={(e) => set("contenido", e.target.value)}
              placeholder="<p>Contenido completo del artículo…</p>"
            />
          </Field>
        </div>

        <Field label="Tiempo de lectura" hint="Minutos estimados">
          <input
            style={inputStyle}
            type="number"
            min={1}
            max={60}
            value={form.tiempoLectura}
            onChange={(e) => set("tiempoLectura", e.target.value)}
            placeholder="5"
          />
        </Field>

        <Field label="Foto de portada" hint="JPG, PNG o WebP — máx. 5 MB">
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Btn
              small
              outline
              color="#7c8cf8"
              onClick={() => fotoRef.current.click()}
            >
              📎 Seleccionar
            </Btn>
            <input
              ref={fotoRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFoto}
            />
            {form.fotoPreview && (
              <img
                src={form.fotoPreview}
                alt="preview"
                style={{
                  width: 56,
                  height: 40,
                  objectFit: "cover",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                }}
              />
            )}
          </div>
        </Field>

        <div style={{ gridColumn: "1 / -1" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
            }}
          >
            <div
              onClick={() => set("destacado", !form.destacado)}
              style={{
                width: 38,
                height: 22,
                borderRadius: 11,
                background: form.destacado ? "#4cc9a6" : "var(--bg-elevated)",
                border: "1px solid var(--border)",
                position: "relative",
                transition: "background .2s",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  left: form.destacado ? 17 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left .2s",
                }}
              />
            </div>
            <span style={{ fontSize: 13, color: "var(--text-body)" }}>
              Marcar como <strong>artículo destacado</strong> (hero de la
              edición)
            </span>
          </label>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
          marginTop: 24,
          paddingTop: 18,
          borderTop: "1px solid var(--border)",
        }}
      >
        <Btn outline color="#64748b" onClick={onClose}>
          Cancelar
        </Btn>
        <Btn
          outline
          color="#4cc9a6"
          onClick={() => handleSave(false)}
          loading={saving}
        >
          Guardar borrador
        </Btn>
        <Btn color="#4cc9a6" onClick={() => handleSave(true)} loading={saving}>
          ✓ Publicar
        </Btn>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
//  MODAL NUEVA EDICIÓN
// ════════════════════════════════════════════════════════════
function ModalEdicion({ open, onClose, onSaved, toast }) {
  const anioActual = new Date().getFullYear();
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio, setAnio] = useState(anioActual);
  const [saving, setSaving] = useState(false);

  const titulo = `${MESES[mes - 1]} ${anio}`;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/blog/ediciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, mes, anio }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.show("Edición creada");
      onSaved();
      onClose();
    } catch (e) {
      toast.show(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva edición mensual"
      width={420}
    >
      <Field label="Mes">
        <select
          style={inputStyle}
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
        >
          {MESES.map((m, i) => (
            <option key={i} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Año">
        <input
          style={inputStyle}
          type="number"
          value={anio}
          onChange={(e) => setAnio(Number(e.target.value))}
          min={2024}
          max={2099}
        />
      </Field>
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 13,
          color: "var(--text-muted)",
          marginBottom: 20,
        }}
      >
        Se creará la edición:{" "}
        <strong style={{ color: "var(--text-h)" }}>{titulo}</strong>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn outline color="#64748b" onClick={onClose}>
          Cancelar
        </Btn>
        <Btn color="#4cc9a6" onClick={handleSave} loading={saving}>
          Crear edición
        </Btn>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
//  MODAL ENCUESTA
// ════════════════════════════════════════════════════════════
function ModalEncuesta({ open, onClose, idEdicion, onSaved, toast }) {
  const [pregunta, setPregunta] = useState("");
  const [opciones, setOpciones] = useState(["", "", ""]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPregunta("");
      setOpciones(["", "", ""]);
    }
  }, [open]);

  const setOpcion = (i, v) =>
    setOpciones((o) => o.map((x, j) => (j === i ? v : x)));
  const addOpcion = () => setOpciones((o) => [...o, ""]);
  const delOpcion = (i) => setOpciones((o) => o.filter((_, j) => j !== i));

  const handleSave = async () => {
    const ops = opciones.map((o) => o.trim()).filter(Boolean);
    if (!pregunta.trim() || ops.length < 2) {
      toast.show("Escribe la pregunta y al menos 2 opciones", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/blog/admin/encuestas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idEdicion, pregunta, opciones: ops }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.show("Encuesta creada");
      onSaved();
      onClose();
    } catch (e) {
      toast.show(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nueva encuesta" width={480}>
      <Field label="Pregunta" required>
        <input
          style={inputStyle}
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          maxLength={300}
          placeholder="¿Qué tema te gustaría ver el próximo mes?"
        />
      </Field>
      <Field label="Opciones" required hint="Mínimo 2">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {opciones.map((op, i) => (
            <div
              key={i}
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  width: 16,
                  flexShrink: 0,
                }}
              >
                {i + 1}.
              </span>
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={op}
                onChange={(e) => setOpcion(i, e.target.value)}
                placeholder={`Opción ${i + 1}`}
                maxLength={200}
              />
              {opciones.length > 2 && (
                <button
                  onClick={() => delOpcion(i)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#fb7185",
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {opciones.length < 6 && (
          <button
            onClick={addOpcion}
            style={{
              marginTop: 10,
              background: "none",
              border: "1px dashed var(--border)",
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 12,
              color: "var(--text-muted)",
              cursor: "pointer",
              width: "100%",
            }}
          >
            + Agregar opción
          </button>
        )}
      </Field>
      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
          marginTop: 8,
        }}
      >
        <Btn outline color="#64748b" onClick={onClose}>
          Cancelar
        </Btn>
        <Btn color="#4cc9a6" onClick={handleSave} loading={saving}>
          Crear encuesta
        </Btn>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
//  MODAL TRIVIA
// ════════════════════════════════════════════════════════════
function ModalTrivia({ open, onClose, idEdicion, onSaved, toast }) {
  const pregBlank = () => ({
    texto: "",
    explicacion: "",
    opciones: [
      { texto: "", correcta: true },
      { texto: "", correcta: false },
      { texto: "", correcta: false },
      { texto: "", correcta: false },
    ],
  });
  const [titulo, setTitulo] = useState("");
  const [preguntas, setPreguntas] = useState([
    pregBlank(),
    pregBlank(),
    pregBlank(),
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitulo("");
      setPreguntas([pregBlank(), pregBlank(), pregBlank()]);
    }
  }, [open]);

  const setPreg = (pi, k, v) =>
    setPreguntas((ps) => ps.map((p, i) => (i === pi ? { ...p, [k]: v } : p)));
  const setOp = (pi, oi, k, v) =>
    setPreguntas((ps) =>
      ps.map((p, i) =>
        i !== pi
          ? p
          : {
              ...p,
              opciones: p.opciones.map((o, j) => {
                if (k === "correcta") return { ...o, correcta: j === oi };
                return j === oi ? { ...o, [k]: v } : o;
              }),
            },
      ),
    );

  const handleSave = async () => {
    if (!titulo.trim()) {
      toast.show("Escribe el título de la trivia", "error");
      return;
    }
    for (const p of preguntas) {
      if (!p.texto.trim()) {
        toast.show("Todas las preguntas necesitan texto", "error");
        return;
      }
      if (p.opciones.some((o) => !o.texto.trim())) {
        toast.show("Todas las opciones necesitan texto", "error");
        return;
      }
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/blog/admin/trivia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idEdicion, titulo, preguntas }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.show("🎯 Trivia creada");
      onSaved();
      onClose();
    } catch (e) {
      toast.show(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nueva trivia" width={680}>
      <Field label="Título de la trivia" required>
        <input
          style={inputStyle}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Trivia Agosto 2026"
          maxLength={200}
        />
      </Field>

      {preguntas.map((p, pi) => (
        <div
          key={pi}
          style={{
            background: "var(--bg-elevated)",
            borderRadius: 10,
            padding: 16,
            marginBottom: 14,
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--secondary)",
              marginBottom: 10,
              letterSpacing: 0.5,
            }}
          >
            PREGUNTA {pi + 1}
          </div>
          <Field label="Enunciado" required>
            <input
              style={inputStyle}
              value={p.texto}
              onChange={(e) => setPreg(pi, "texto", e.target.value)}
              placeholder="¿Cuál es...?"
              maxLength={400}
            />
          </Field>
          <Field
            label="Explicación"
            hint="Opcional — se muestra al ver el resultado"
          >
            <input
              style={inputStyle}
              value={p.explicacion}
              onChange={(e) => setPreg(pi, "explicacion", e.target.value)}
              placeholder="La respuesta correcta es... porque..."
              maxLength={500}
            />
          </Field>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-muted)",
              marginBottom: 8,
              letterSpacing: 0.5,
            }}
          >
            OPCIONES — marca la correcta
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {p.opciones.map((op, oi) => (
              <div
                key={oi}
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                <button
                  onClick={() => setOp(pi, oi, "correcta", true)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    flexShrink: 0,
                    border: `2px solid ${op.correcta ? "#4ade80" : "var(--border)"}`,
                    background: op.correcta ? "#4ade80" : "transparent",
                    cursor: "pointer",
                    transition: "all .15s",
                  }}
                />
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={op.texto}
                  onChange={(e) => setOp(pi, oi, "texto", e.target.value)}
                  placeholder={`Opción ${oi + 1}`}
                  maxLength={300}
                />
                {op.correcta && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#4ade80",
                      background: "rgba(74,222,128,.12)",
                      padding: "2px 7px",
                      borderRadius: 4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    CORRECTA
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
          marginTop: 8,
        }}
      >
        <Btn outline color="#64748b" onClick={onClose}>
          Cancelar
        </Btn>
        <Btn color="#e879f9" onClick={handleSave} loading={saving}>
          🎯 Crear trivia
        </Btn>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
//  MODAL TIP
// ════════════════════════════════════════════════════════════
function ModalTip({ open, onClose, onSaved, toast }) {
  const hoy = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    texto: "",
    categoria: "tecnologia",
    icono: "💡",
    fechaInicio: hoy,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open)
      setForm({
        texto: "",
        categoria: "tecnologia",
        icono: "💡",
        fechaInicio: hoy,
      });
  }, [open]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const ICONOS = [
    "💡",
    "🔐",
    "🌿",
    "🏭",
    "🤖",
    "📋",
    "💪",
    "🎯",
    "🧠",
    "⚡",
    "🛡️",
    "📱",
  ];

  const handleSave = async () => {
    if (!form.texto.trim()) {
      toast.show("Escribe el texto del tip", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/blog/admin/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.show("💡 Tip creado");
      onSaved();
      onClose();
    } catch (e) {
      toast.show(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo tip de la semana"
      width={480}
    >
      <Field label="Ícono">
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}
        >
          {ICONOS.map((ic) => (
            <button
              key={ic}
              onClick={() => set("icono", ic)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                fontSize: 18,
                background:
                  form.icono === ic ? "var(--bg-elevated)" : "var(--bg-card)",
                border: `1px solid ${form.icono === ic ? "var(--primary)" : "var(--border)"}`,
                cursor: "pointer",
                transition: "all .12s",
              }}
            >
              {ic}
            </button>
          ))}
        </div>
      </Field>
      <Field
        label="Texto del tip"
        required
        hint="Máx. 200 caracteres — frase corta y accionable"
      >
        <textarea
          style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
          value={form.texto}
          maxLength={200}
          onChange={(e) => set("texto", e.target.value)}
          placeholder="Bloquea tu pantalla cada vez que te alejes de tu equipo."
        />
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            textAlign: "right",
            marginTop: 3,
          }}
        >
          {form.texto.length}/200
        </div>
      </Field>
      <Field label="Categoría" required>
        <select
          style={inputStyle}
          value={form.categoria}
          onChange={(e) => set("categoria", e.target.value)}
        >
          {CATEGORIAS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Fecha de inicio"
        hint="El tip se mostrará a partir de esta fecha"
      >
        <input
          style={inputStyle}
          type="date"
          value={form.fechaInicio}
          onChange={(e) => set("fechaInicio", e.target.value)}
        />
      </Field>

      {/* Preview */}
      <div
        style={{
          background: "var(--bg-elevated)",
          borderLeft: "3px solid var(--primary)",
          borderRadius: 8,
          padding: "12px 14px",
          marginBottom: 16,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -10,
            right: -10,
            fontSize: 50,
            opacity: 0.08,
          }}
        >
          {form.icono}
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--primary)",
            letterSpacing: 0.8,
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          {form.icono} Preview
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-h)",
            fontStyle: "italic",
            lineHeight: 1.5,
          }}
        >
          "{form.texto || "Tu tip aquí…"}"
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn outline color="#64748b" onClick={onClose}>
          Cancelar
        </Btn>
        <Btn color="#fbbf24" onClick={handleSave} loading={saving}>
          💡 Crear tip
        </Btn>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
//  PÁGINA PRINCIPAL
// ════════════════════════════════════════════════════════════
export default function BlogAdminPage() {
  const { user } = useContext(AuthContext);
  const toast = useToast();

  const [ediciones, setEdiciones] = useState([]);
  const [edicionActiva, setEdicionActiva] = useState(null);
  const [edicionSel, setEdicionSel] = useState(null); // la que estamos viendo en admin
  const [articulos, setArticulos] = useState([]);
  const [encuesta, setEncuesta] = useState(null);
  const [loadingArts, setLoadingArts] = useState(false);

  const [modalArt, setModalArt] = useState(false);
  const [artEditar, setArtEditar] = useState(null);
  const [modalEdicion, setModalEdicion] = useState(false);
  const [modalEncuesta, setModalEncuesta] = useState(false);
  const [modalTrivia, setModalTrivia] = useState(false);
  const [modalTip, setModalTip] = useState(false);
  const [confirmActivar, setConfirmActivar] = useState(null);
  const [confirmEliminar, setConfirmEliminar] = useState(null);
  const [tabActivo, setTabActivo] = useState("articulos"); // articulos|encuesta|trivia|tips
  const [trivia, setTrivia] = useState(null);
  const [estadTrivia, setEstatTrivia] = useState(null);
  const [tips, setTips] = useState([]);

  // ── carga inicial ──────────────────────────────────────────
  useEffect(() => {
    cargarEdiciones();
  }, []);

  const cargarEdiciones = async () => {
    try {
      const [rEds, rAct] = await Promise.all([
        apiFetch("/api/blog/ediciones").then((r) => r.json()),
        apiFetch("/api/blog/edicion/activa").then((r) => r.json()),
      ]);
      setEdiciones(rEds);
      setEdicionActiva(rAct);
      // seleccionar la activa por defecto
      const activa = rEds.find((e) => e.activa) || rEds[0];
      if (activa) setEdicionSel(activa.idEdicion);
    } catch {
      toast.show("Error cargando ediciones", "error");
    }
  };

  // ── artículos de la edición seleccionada ──────────────────
  useEffect(() => {
    if (!edicionSel) return;
    cargarArticulos();
    cargarEncuesta();
    cargarTrivia();
    cargarTips();
  }, [edicionSel]);

  const cargarTrivia = async () => {
    try {
      const data = await apiFetch(
        `/api/blog/admin/trivia?idEdicion=${edicionSel}`,
      ).then((r) => r.json());
      setTrivia(Array.isArray(data) && data.length > 0 ? data[0] : null);
    } catch {
      setTrivia(null);
    }
  };

  const cargarTips = async () => {
    try {
      const data = await apiFetch("/api/blog/admin/tips").then((r) => r.json());
      setTips(Array.isArray(data) ? data : []);
    } catch {
      setTips([]);
    }
  };

  const cargarEstadTrivia = async (idTrivia) => {
    try {
      const data = await apiFetch(
        `/api/blog/admin/trivia/${idTrivia}/estadisticas`,
      ).then((r) => r.json());
      setEstatTrivia(data);
    } catch {
      setEstatTrivia(null);
    }
  };

  const cargarArticulos = async () => {
    setLoadingArts(true);
    try {
      const data = await apiFetch(
        `/api/blog/admin/articulos?idEdicion=${edicionSel}`,
      ).then((r) => r.json());
      setArticulos(Array.isArray(data) ? data : []);
    } catch {
      toast.show("Error cargando artículos", "error");
    } finally {
      setLoadingArts(false);
    }
  };

  const cargarEncuesta = async () => {
    try {
      const data = await apiFetch(
        `/api/blog/encuesta?idEdicion=${edicionSel}`,
      ).then((r) => r.json());
      setEncuesta(data);
    } catch {
      setEncuesta(null);
    }
  };

  const handleActivar = async () => {
    try {
      await apiFetch(`/api/blog/ediciones/${confirmActivar}/activar`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      toast.show("Edición activada — ahora es la edición pública");
      setConfirmActivar(null);
      cargarEdiciones();
    } catch (e) {
      toast.show(e.message, "error");
    }
  };

  const handleEliminarEdicion = async () => {
    try {
      const res = await apiFetch(`/api/blog/ediciones/${confirmEliminar}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.show("Edición eliminada");
      setConfirmEliminar(null);
      setEdicionSel(null);
      cargarEdiciones();
    } catch (e) {
      toast.show(e.message, "error");
    }
  };

  const handlePublicar = async (id) => {
    try {
      await apiFetch(`/api/blog/admin/articulos/${id}/publicar`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      toast.show("Artículo publicado");
      cargarArticulos();
    } catch (e) {
      toast.show(e.message, "error");
    }
  };

  const edSelObj = ediciones.find((e) => e.idEdicion === edicionSel);

  // ── guard ─────────────────────────────────────────────────
  if (user?.area !== "SISTEMAS") {
    return (
      <div
        style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-h)" }}>
          Acceso restringido
        </div>
        <div style={{ fontSize: 13, marginTop: 6 }}>
          Esta sección es exclusiva del área de Sistemas.
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto" }}>
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 28,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "var(--text-h)",
              margin: 0,
            }}
          >
            Blog · Administración
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            Gestiona ediciones, artículos y encuestas del Hub FABPSA
          </p>
        </div>
        <Btn onClick={() => setModalEdicion(true)}>+ Nueva edición</Btn>
      </div>

      {/* ── Edición activa chip ── */}
      {edicionActiva && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(76,201,166,0.1)",
            border: "1px solid rgba(76,201,166,0.25)",
            borderRadius: 8,
            padding: "8px 14px",
            marginBottom: 24,
            fontSize: 13,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#4cc9a6",
              boxShadow: "0 0 0 3px rgba(76,201,166,0.25)",
            }}
          />
          <span style={{ color: "var(--text-muted)" }}>
            Edición pública activa:
          </span>
          <strong style={{ color: "#4cc9a6" }}>{edicionActiva.titulo}</strong>
        </div>
      )}

      <div
        style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 24 }}
      >
        {/* ── SIDEBAR: lista de ediciones ── */}
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: 0.8,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Ediciones
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ediciones.map((ed) => (
              <div
                key={ed.idEdicion}
                onClick={() => setEdicionSel(ed.idEdicion)}
                style={{
                  background:
                    edicionSel === ed.idEdicion
                      ? "var(--bg-elevated)"
                      : "var(--bg-card)",
                  border: `1px solid ${edicionSel === ed.idEdicion ? "var(--primary)" : "var(--border)"}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  cursor: "pointer",
                  transition: "all .15s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    marginBottom: 4,
                  }}
                >
                  {ed.activa === true || ed.activa === 1 ? (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        color: "#4cc9a6",
                        background: "rgba(76,201,166,0.12)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        letterSpacing: 0.5,
                      }}
                    >
                      ACTIVA
                    </span>
                  ) : null}
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--text-h)",
                    }}
                  >
                    {ed.titulo}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {ed.totalArticulos} artículo
                  {ed.totalArticulos !== 1 ? "s" : ""} publicados
                </div>
                {edicionSel === ed.idEdicion && (
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    {!ed.activa && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmActivar(ed.idEdicion);
                        }}
                        style={{
                          flex: 1,
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#4cc9a6",
                          background: "rgba(76,201,166,0.1)",
                          border: "1px solid rgba(76,201,166,0.25)",
                          borderRadius: 6,
                          padding: "4px 8px",
                          cursor: "pointer",
                        }}
                      >
                        ⚡ Activar
                      </button>
                    )}
                    {!ed.activa && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmEliminar(ed.idEdicion);
                        }}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#fb7185",
                          background: "rgba(251,113,133,0.1)",
                          border: "1px solid rgba(251,113,133,0.25)",
                          borderRadius: 6,
                          padding: "4px 8px",
                          cursor: "pointer",
                        }}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {ediciones.length === 0 && (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  textAlign: "center",
                  padding: 24,
                }}
              >
                Sin ediciones aún
              </div>
            )}
          </div>
        </div>

        {/* ── MAIN ── */}
        <div>
          {edicionSel && edSelObj ? (
            <>
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "var(--text-h)",
                    }}
                  >
                    {edSelObj.titulo}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      marginTop: 2,
                    }}
                  >
                    {articulos.filter((a) => a.estatus === 2).length} publicados
                    · {articulos.filter((a) => a.estatus === 1).length}{" "}
                    borradores
                  </div>
                </div>
                {/* Botón contextual según tab */}
                {tabActivo === "articulos" && (
                  <Btn
                    small
                    onClick={() => {
                      setArtEditar(null);
                      setModalArt(true);
                    }}
                  >
                    + Artículo
                  </Btn>
                )}
                {tabActivo === "encuesta" && !encuesta && (
                  <Btn
                    small
                    outline
                    color="#7c8cf8"
                    onClick={() => setModalEncuesta(true)}
                  >
                    + Encuesta
                  </Btn>
                )}
                {tabActivo === "trivia" && !trivia && (
                  <Btn
                    small
                    outline
                    color="#e879f9"
                    onClick={() => setModalTrivia(true)}
                  >
                    + Trivia
                  </Btn>
                )}
                {tabActivo === "tips" && (
                  <Btn
                    small
                    outline
                    color="#fbbf24"
                    onClick={() => setModalTip(true)}
                  >
                    + Tip
                  </Btn>
                )}
              </div>

              {/* Tabs */}
              <div
                style={{
                  display: "flex",
                  gap: 2,
                  marginBottom: 20,
                  background: "var(--bg-card)",
                  borderRadius: 10,
                  padding: 4,
                  border: "1px solid var(--border)",
                  width: "fit-content",
                }}
              >
                {[
                  { key: "articulos", label: "📝 Artículos" },
                  { key: "encuesta", label: "📊 Encuesta" },
                  { key: "trivia", label: "🎯 Trivia" },
                  { key: "tips", label: "💡 Tips" },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => {
                      setTabActivo(t.key);
                      if (t.key === "trivia" && trivia)
                        cargarEstadTrivia(trivia.idTrivia);
                    }}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 7,
                      fontSize: 12,
                      fontWeight: 600,
                      border: "none",
                      cursor: "pointer",
                      transition: "all .15s",
                      background:
                        tabActivo === t.key
                          ? "var(--bg-elevated)"
                          : "transparent",
                      color:
                        tabActivo === t.key
                          ? "var(--text-h)"
                          : "var(--text-muted)",
                      boxShadow:
                        tabActivo === t.key
                          ? "0 1px 4px rgba(0,0,0,.15)"
                          : "none",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── TAB: ARTÍCULOS ── */}
              {tabActivo === "articulos" && (
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  {loadingArts ? (
                    <div
                      style={{
                        padding: 32,
                        textAlign: "center",
                        color: "var(--text-muted)",
                        fontSize: 13,
                      }}
                    >
                      Cargando…
                    </div>
                  ) : articulos.length === 0 ? (
                    <div style={{ padding: 40, textAlign: "center" }}>
                      <div style={{ fontSize: 28, marginBottom: 10 }}>📝</div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--text-h)",
                        }}
                      >
                        Sin artículos todavía
                      </div>
                    </div>
                  ) : (
                    <table
                      style={{ width: "100%", borderCollapse: "collapse" }}
                    >
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          {[
                            "Artículo",
                            "Categoría",
                            "Estatus",
                            "👍",
                            "💬",
                            "Acciones",
                          ].map((h) => (
                            <th
                              key={h}
                              style={{
                                padding: "10px 14px",
                                fontSize: 11,
                                fontWeight: 700,
                                color: "var(--text-muted)",
                                textAlign: "left",
                                letterSpacing: 0.5,
                                textTransform: "uppercase",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {articulos.map((art) => (
                          <tr
                            key={art.idArticulo}
                            style={{
                              borderBottom: "1px solid var(--border)",
                              transition: "background .1s",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background =
                                "var(--bg-elevated)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                          >
                            <td style={{ padding: "12px 14px" }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                {(art.destacado === true ||
                                  art.destacado === 1) && (
                                  <span title="Destacado">⭐</span>
                                )}
                                <div>
                                  <div
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 600,
                                      color: "var(--text-h)",
                                      maxWidth: 260,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {art.titulo}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: "var(--text-muted)",
                                      marginTop: 2,
                                    }}
                                  >
                                    {art.autor} ·{" "}
                                    {art.tiempoLectura
                                      ? `${art.tiempoLectura} min`
                                      : "—"}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              <CatBadge cat={art.categoria} />
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: "3px 8px",
                                  borderRadius: 5,
                                  background:
                                    art.estatus === 2
                                      ? "rgba(76,201,166,0.12)"
                                      : "rgba(251,191,36,0.12)",
                                  color:
                                    art.estatus === 2 ? "#4cc9a6" : "#fbbf24",
                                }}
                              >
                                {art.estatus === 2 ? "Publicado" : "Borrador"}
                              </span>
                            </td>
                            <td
                              style={{
                                padding: "12px 14px",
                                fontSize: 13,
                                color: "var(--text-muted)",
                                textAlign: "center",
                              }}
                            >
                              {art.likes}
                            </td>
                            <td
                              style={{
                                padding: "12px 14px",
                                fontSize: 13,
                                color: "var(--text-muted)",
                                textAlign: "center",
                              }}
                            >
                              {art.comentarios}
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              <div style={{ display: "flex", gap: 6 }}>
                                <Btn
                                  small
                                  outline
                                  color="#7c8cf8"
                                  onClick={() => {
                                    setArtEditar(art);
                                    setModalArt(true);
                                  }}
                                >
                                  Editar
                                </Btn>
                                {art.estatus === 1 && (
                                  <Btn
                                    small
                                    color="#4cc9a6"
                                    onClick={() =>
                                      handlePublicar(art.idArticulo)
                                    }
                                  >
                                    Publicar
                                  </Btn>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ── TAB: ENCUESTA ── */}
              {tabActivo === "encuesta" && (
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
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    📊 Encuesta de la edición
                  </div>
                  {encuesta ? (
                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--text-h)",
                          marginBottom: 14,
                        }}
                      >
                        {encuesta.pregunta}
                      </div>
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
                                <span style={{ color: "var(--text-body)" }}>
                                  {op.texto}
                                </span>
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: "var(--text-h)",
                                  }}
                                >
                                  {pct}%{" "}
                                  <span
                                    style={{
                                      color: "var(--text-muted)",
                                      fontWeight: 400,
                                    }}
                                  >
                                    ({op.votos})
                                  </span>
                                </span>
                              </div>
                              <div
                                style={{
                                  height: 6,
                                  background: "var(--bg-elevated)",
                                  borderRadius: 3,
                                }}
                              >
                                <div
                                  style={{
                                    height: 6,
                                    borderRadius: 3,
                                    width: `${pct}%`,
                                    background:
                                      "linear-gradient(90deg, #4cc9a6, #7c8cf8)",
                                    transition: "width .4s",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          marginTop: 12,
                        }}
                      >
                        {encuesta.totalVotos} voto
                        {encuesta.totalVotos !== 1 ? "s" : ""} totales
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 16 }}
                    >
                      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                        Sin encuesta activa.
                      </div>
                      <Btn
                        small
                        outline
                        color="#7c8cf8"
                        onClick={() => setModalEncuesta(true)}
                      >
                        + Crear encuesta
                      </Btn>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB: TRIVIA ── */}
              {tabActivo === "trivia" && (
                <div>
                  {trivia ? (
                    <div>
                      {/* Info trivia */}
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
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 16,
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 700,
                                color: "var(--text-h)",
                              }}
                            >
                              {trivia.titulo}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: "var(--text-muted)",
                                marginTop: 3,
                              }}
                            >
                              {trivia.totalPreguntas} preguntas ·{" "}
                              {trivia.totalParticipantes} participantes ·{" "}
                              {trivia.perfectos} perfectos
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "3px 10px",
                              borderRadius: 6,
                              background: trivia.activa
                                ? "rgba(76,201,166,.12)"
                                : "rgba(100,116,139,.12)",
                              color: trivia.activa ? "#4cc9a6" : "#64748b",
                            }}
                          >
                            {trivia.activa ? "Activa" : "Inactiva"}
                          </span>
                        </div>

                        {/* Estadísticas por pregunta */}
                        {estadTrivia ? (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 16,
                            }}
                          >
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(3,1fr)",
                                gap: 12,
                                marginBottom: 8,
                              }}
                            >
                              {[
                                {
                                  label: "Participantes",
                                  val: estadTrivia.totalParticipantes,
                                  color: "#7c8cf8",
                                },
                                {
                                  label: "Perfectos",
                                  val: estadTrivia.perfectos,
                                  color: "#4ade80",
                                },
                                {
                                  label: "Promedio",
                                  val: estadTrivia.promedioAciertos
                                    ? `${Number(estadTrivia.promedioAciertos).toFixed(1)}/3`
                                    : "—",
                                  color: "#fbbf24",
                                },
                              ].map((s) => (
                                <div
                                  key={s.label}
                                  style={{
                                    background: "var(--bg-elevated)",
                                    borderRadius: 8,
                                    padding: "12px",
                                    textAlign: "center",
                                    border: "1px solid var(--border)",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 22,
                                      fontWeight: 800,
                                      color: s.color,
                                    }}
                                  >
                                    {s.val}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 10,
                                      color: "var(--text-muted)",
                                      marginTop: 3,
                                    }}
                                  >
                                    {s.label}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {estadTrivia.preguntas?.map((p, pi) => (
                              <div
                                key={p.idPregunta}
                                style={{
                                  background: "var(--bg-elevated)",
                                  borderRadius: 10,
                                  padding: 14,
                                  border: "1px solid var(--border)",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "var(--text-h)",
                                    marginBottom: 10,
                                  }}
                                >
                                  {pi + 1}. {p.texto}
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 6,
                                  }}
                                >
                                  {p.opciones?.map((op) => {
                                    const pct =
                                      p.totalRespuestas > 0
                                        ? Math.round(
                                            (op.veces / p.totalRespuestas) *
                                              100,
                                          )
                                        : 0;
                                    return (
                                      <div key={op.idOpcion}>
                                        <div
                                          style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            fontSize: 11,
                                            marginBottom: 3,
                                          }}
                                        >
                                          <span
                                            style={{
                                              color: op.correcta
                                                ? "#4ade80"
                                                : "var(--text-muted)",
                                              fontWeight: op.correcta
                                                ? 700
                                                : 400,
                                            }}
                                          >
                                            {op.correcta ? "✓ " : ""}
                                            {op.texto}
                                          </span>
                                          <span
                                            style={{
                                              color: "var(--text-muted)",
                                            }}
                                          >
                                            {op.veces} ({pct}%)
                                          </span>
                                        </div>
                                        <div
                                          style={{
                                            height: 4,
                                            background: "var(--bg-card)",
                                            borderRadius: 2,
                                          }}
                                        >
                                          <div
                                            style={{
                                              height: 4,
                                              borderRadius: 2,
                                              width: `${pct}%`,
                                              background: op.correcta
                                                ? "#4ade80"
                                                : "var(--border)",
                                              transition: "width .4s",
                                            }}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <Btn
                            small
                            outline
                            color="#e879f9"
                            onClick={() => cargarEstadTrivia(trivia.idTrivia)}
                          >
                            Ver estadísticas
                          </Btn>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        padding: 40,
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--text-h)",
                          marginBottom: 8,
                        }}
                      >
                        Sin trivia en esta edición
                      </div>
                      <Btn
                        outline
                        color="#e879f9"
                        onClick={() => setModalTrivia(true)}
                      >
                        + Crear trivia
                      </Btn>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB: TIPS ── */}
              {tabActivo === "tips" && (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {tips.length === 0 ? (
                    <div
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        padding: 40,
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: 32, marginBottom: 12 }}>💡</div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--text-h)",
                          marginBottom: 8,
                        }}
                      >
                        Sin tips todavía
                      </div>
                      <Btn
                        outline
                        color="#fbbf24"
                        onClick={() => setModalTip(true)}
                      >
                        + Crear primer tip
                      </Btn>
                    </div>
                  ) : (
                    tips.map((tip) => (
                      <div
                        key={tip.idTip}
                        style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border)",
                          borderLeft: `3px solid ${(CATEGORIAS.find((c) => c.value === tip.categoria) || { color: "#4cc9a6" }).color}`,
                          borderRadius: 10,
                          padding: "14px 16px",
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                        }}
                      >
                        <span style={{ fontSize: 24, flexShrink: 0 }}>
                          {tip.icono}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              color: "var(--text-h)",
                              lineHeight: 1.5,
                              marginBottom: 5,
                            }}
                          >
                            {tip.texto}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                            }}
                          >
                            <CatBadge cat={tip.categoria} />
                            <span
                              style={{
                                fontSize: 11,
                                color: "var(--text-muted)",
                              }}
                            >
                              Desde:{" "}
                              {new Date(tip.fechaInicio).toLocaleDateString(
                                "es-MX",
                                {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                },
                              )}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button
                            onClick={async () => {
                              await apiFetch(
                                `/api/blog/admin/tips/${tip.idTip}/toggle`,
                                {
                                  method: "PUT",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({ activo: !tip.activo }),
                                },
                              );
                              cargarTips();
                              toast.show(
                                tip.activo ? "Tip desactivado" : "Tip activado",
                              );
                            }}
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "4px 10px",
                              borderRadius: 6,
                              background: tip.activo
                                ? "rgba(76,201,166,.1)"
                                : "rgba(100,116,139,.1)",
                              color: tip.activo ? "#4cc9a6" : "#64748b",
                              border: `1px solid ${tip.activo ? "rgba(76,201,166,.25)" : "rgba(100,116,139,.25)"}`,
                              cursor: "pointer",
                            }}
                          >
                            {tip.activo ? "Activo" : "Inactivo"}
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm("¿Eliminar este tip?")) return;
                              await apiFetch(
                                `/api/blog/admin/tips/${tip.idTip}`,
                                { method: "DELETE" },
                              );
                              cargarTips();
                              toast.show("Tip eliminado");
                            }}
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 6,
                              border: "1px solid rgba(251,113,133,.25)",
                              background: "rgba(251,113,133,.08)",
                              color: "#fb7185",
                              cursor: "pointer",
                              fontSize: 14,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                padding: 60,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              Selecciona una edición del panel izquierdo
            </div>
          )}
        </div>
      </div>

      {/* ── Modales ── */}
      <ModalArticulo
        open={modalArt}
        onClose={() => {
          setModalArt(false);
          setArtEditar(null);
        }}
        idEdicion={edicionSel}
        articulo={artEditar}
        onSaved={cargarArticulos}
        toast={toast}
      />
      <ModalEdicion
        open={modalEdicion}
        onClose={() => setModalEdicion(false)}
        onSaved={cargarEdiciones}
        toast={toast}
      />
      <ModalEncuesta
        open={modalEncuesta}
        onClose={() => setModalEncuesta(false)}
        idEdicion={edicionSel}
        onSaved={cargarEncuesta}
        toast={toast}
      />

      {/* ── Confirm activar edición ── */}
      <Modal
        open={!!confirmActivar}
        onClose={() => setConfirmActivar(null)}
        title="Activar edición"
        width={400}
      >
        <p
          style={{
            fontSize: 13,
            color: "var(--text-body)",
            marginBottom: 20,
            lineHeight: 1.6,
          }}
        >
          Al activar esta edición, la anterior dejará de ser pública. Los
          artículos anteriores seguirán en el archivo. ¿Confirmas?
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn outline color="#64748b" onClick={() => setConfirmActivar(null)}>
            Cancelar
          </Btn>
          <Btn color="#4cc9a6" onClick={handleActivar}>
            Sí, activar
          </Btn>
        </div>
      </Modal>

      {/* ── Confirm eliminar edición ── */}
      <Modal
        open={!!confirmEliminar}
        onClose={() => setConfirmEliminar(null)}
        title="Eliminar edición"
        width={400}
      >
        <div
          style={{
            background: "rgba(251,113,133,0.08)",
            border: "1px solid rgba(251,113,133,0.2)",
            borderRadius: 8,
            padding: "12px 14px",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#fb7185",
              marginBottom: 4,
            }}
          >
            ⚠️ Esta acción no se puede deshacer
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Se eliminarán todos los artículos, comentarios, likes y encuestas de
            esta edición.
          </div>
        </div>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-body)",
            marginBottom: 20,
            lineHeight: 1.6,
          }}
        >
          ¿Estás seguro que deseas eliminar esta edición permanentemente?
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn outline color="#64748b" onClick={() => setConfirmEliminar(null)}>
            Cancelar
          </Btn>
          <Btn color="#fb7185" onClick={handleEliminarEdicion}>
            Sí, eliminar
          </Btn>
        </div>
      </Modal>

      {/* ── Modal Trivia ── */}
      <ModalTrivia
        open={modalTrivia}
        onClose={() => setModalTrivia(false)}
        idEdicion={edicionSel}
        onSaved={() => {
          cargarTrivia();
          setTabActivo("trivia");
        }}
        toast={toast}
      />

      {/* ── Modal Tip ── */}
      <ModalTip
        open={modalTip}
        onClose={() => setModalTip(false)}
        onSaved={cargarTips}
        toast={toast}
      />

      <Toast toast={toast.toast} />
    </div>
  );
}
