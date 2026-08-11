import { useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  TICKER_ITEMS,
  ARTICULOS,
  METRICAS,
  TRIVIA,
  ESTADOS_DATA,
  SABIAS,
} from "../data/staticData.js";

/* ══════════════════════════════════════════════
   SUB-COMPONENTES
══════════════════════════════════════════════ */
function Tag({ label, color }) {
  return <span className={`cd-tag cd-tag--${color}`}>{label}</span>;
}

function SemaforoSection() {
  const [seleccionado, setSeleccionado] = useState(null);
  const opciones = [
    {
      key: "verde",
      dot: "#2E8B70",
      label: "Bien y con energía",
      desc: "Me siento motivado, descansado y listo para la jornada",
    },
    {
      key: "amarillo",
      dot: "#C4A020",
      label: "Más o menos",
      desc: "Estoy bien, pero con algo de cansancio acumulado",
    },
    {
      key: "naranja",
      dot: "#E8833A",
      label: "Con presión o estrés",
      desc: "Siento carga, tengo pendientes que me generan tensión",
    },
    {
      key: "rojo",
      dot: "#C45066",
      label: "Agotado o sobrecargado",
      desc: "Me cuesta arrancar, siento que no me alcanza el tiempo",
    },
    {
      key: "azul",
      dot: "#4A7FA5",
      label: "Distante o sin ánimo",
      desc: "No me siento muy conectado con lo que hago hoy",
    },
  ];
  const estado = seleccionado ? ESTADOS_DATA[seleccionado] : null;

  return (
    <div className="cd-semaforo-wrap">
      <div>
        <p className="cd-semaforo-intro">
          Selecciona la opción que mejor describe tu estado emocional al inicio
          de esta quincena. No hay respuestas correctas o incorrectas — es un
          espacio para ti.
        </p>
        <div className="cd-semaforo-grid">
          {opciones.map((o) => (
            <button
              key={o.key}
              className={`cd-semaforo-opt${seleccionado === o.key ? " cd-semaforo-opt--sel" : ""}`}
              onClick={() => setSeleccionado(o.key)}
              type="button"
            >
              <span className="cd-s-dot" style={{ background: o.dot }} />
              <span>
                <span className="cd-s-label">{o.label}</span>
                <span className="cd-s-desc">{o.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div
        className={`cd-semaforo-result${estado ? " cd-semaforo-result--visible" : ""}`}
      >
        {estado && (
          <>
            <div className="cd-sr-label">Tu estado de ánimo hoy</div>
            <div className="cd-sr-titulo" style={{ color: estado.color }}>
              {estado.titulo}
            </div>
            <div className="cd-sr-cuerpo">{estado.cuerpo}</div>
            <div className="cd-sr-tips">
              {estado.tips.map((t, i) => (
                <div className="cd-sr-tip" key={i}>
                  {t}
                </div>
              ))}
            </div>
            <div className="cd-sr-nom">{estado.nom}</div>
          </>
        )}
      </div>
    </div>
  );
}

function TriviaSection() {
  const [respondidas, setRespondidas] = useState({});
  const total = TRIVIA.length;
  const correctas = Object.values(respondidas).filter(Boolean).length;
  const todasRespondidas = Object.keys(respondidas).length === total;

  function responder(qIdx, esCorrecta) {
    if (respondidas[qIdx] !== undefined) return;
    setRespondidas((prev) => ({ ...prev, [qIdx]: esCorrecta }));
  }

  const msgs = [
    "Hay conceptos por reforzar — esta sección es el punto de partida.",
    "Buen inicio. Sigue leyendo cada quincena y lo dominas.",
    "Perfecto — estás al día con lo que importa en bienestar laboral.",
  ];

  return (
    <div className="cd-trivia-block">
      <div className="cd-trivia-hed">
        ¿Cuánto sabes sobre tus derechos laborales?
      </div>
      <div className="cd-trivia-sub">
        3 preguntas sobre NOM-035 y bienestar — a ver cómo te va
      </div>
      <div className="cd-trivia-cards">
        {TRIVIA.map((q, qi) => {
          const respondida = respondidas[qi] !== undefined;
          return (
            <div className="cd-trivia-card" key={qi}>
              <div className="cd-trivia-q">{q.pregunta}</div>
              <div className="cd-trivia-opts">
                {q.opciones.map((o, oi) => {
                  let cls = "cd-trivia-opt";
                  if (respondida) {
                    if (o.correcto) cls += " cd-opt-correct";
                    else if (
                      !o.correcto &&
                      respondidas[qi] === false &&
                      oi ===
                        q.opciones.findIndex(
                          (x) => !x.correcto && respondidas[qi] !== undefined,
                        )
                    )
                      cls += " cd-opt-wrong";
                  }
                  return (
                    <button
                      key={oi}
                      className={cls}
                      disabled={respondida}
                      onClick={() => responder(qi, o.correcto)}
                      type="button"
                    >
                      {o.texto}
                    </button>
                  );
                })}
              </div>
              {respondida && (
                <div className="cd-trivia-feedback">{q.feedback}</div>
              )}
            </div>
          );
        })}
      </div>
      {todasRespondidas && (
        <div className="cd-trivia-score">
          {correctas}/{total} correctas — {msgs[correctas]}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   PÁGINA PRINCIPAL
══════════════════════════════════════════════ */
export default function CulturaDigitalPage() {
  const navigate = useNavigate();

  return (
    <div className="cd-root">
      {/* TICKER */}
      <div className="cd-ticker">
        <div className="cd-ticker-track">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((t, i) => (
            <span className="cd-ticker-item" key={i}>
              <span className="cd-ticker-dot" />
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="cd-page">
        {/* MASTHEAD */}
        <div className="cd-masthead">
          <div>
            <div className="cd-logo">
              Cultura <em>Digital</em>
            </div>
            <div className="cd-logo-sub">
              Bienestar · NOM-035 · Desarrollo personal
            </div>
          </div>
          <div className="cd-masthead-center">
            <div className="cd-edition-label">
              FABPSA · Sistemas · Agosto 2026
              <div className="cd-edition-date"></div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <button className="cd-back-btn" onClick={() => navigate("/")}>
              <i className="ti ti-arrow-left" /> Inicio
            </button>
          </div>
        </div>

        {/* HERO */}
        <div className="cd-hero">
          <div>
            <div className="cd-hero-kicker">
              Portada · Bienestar y NOM-035-STPS
            </div>
            <h1 className="cd-hero-headline">
              Trabajar más
              <br />
              no es trabajar
              <br />
              <em>mejor.</em>
            </h1>
            <p className="cd-hero-deck">
              El burnout ya es la primera causa de ausentismo laboral en México.
              Esta edición explora la NOM-035, el bienestar real y las
              herramientas que tienes a tu alcance para cuidarte — y para exigir
              que tu entorno también te cuide.
            </p>
          </div>
          <div className="cd-hero-sidebar">
            <div className="cd-hs-label">Tres cifras de esta quincena</div>
            <div className="cd-stat-item">
              <div className="cd-stat-num">
                52<sup>%</sup>
              </div>
              <div className="cd-stat-desc">
                de trabajadores mexicanos reporta síntomas de burnout en 2026 —
                IMSS. México lidera la lista global.
              </div>
              <div className="cd-stat-note">
                ↑ El agotamiento no es debilidad, es una condición médica
              </div>
            </div>
            <div className="cd-stat-item">
              <div className="cd-stat-num">
                34<sup>%</sup>
              </div>
              <div className="cd-stat-desc">
                de mejora en rendimiento cognitivo con descanso adecuado —
                supera cualquier estimulante o técnica de enfoque.
              </div>
              <div className="cd-stat-note">
                ↑ Dormir bien es la herramienta más barata
              </div>
            </div>
            <div className="cd-stat-item">
              <div className="cd-stat-num">2019</div>
              <div className="cd-stat-desc">
                año en que la OMS reconoció oficialmente el burnout como
                condición médica en la Clasificación Internacional de
                Enfermedades.
              </div>
              <div className="cd-stat-note">
                ↑ No es "estrés normal" — tiene diagnóstico
              </div>
            </div>
          </div>
        </div>

        {/* MÉTRICAS */}
        <div className="cd-metrics-row">
          {METRICAS.map((m) => (
            <div className="cd-metric-col" key={m.label}>
              <div className="cd-mc-label">{m.label}</div>
              <div className="cd-mc-value">{m.value}</div>
              <div className="cd-bar-track">
                <div
                  className={`cd-bar-fill cd-bar-fill--${m.color}`}
                  style={{ width: `${m.fill}%` }}
                />
              </div>
              <div className="cd-mc-caption">{m.caption}</div>
            </div>
          ))}
        </div>

        {/* ARTÍCULOS */}
        <div className="cd-section-rule">
          <div className="cd-rule-line" />
          <span>Análisis de esta edición</span>
          <div className="cd-rule-line" />
        </div>
        <div className="cd-three-col">
          {ARTICULOS.map((a, i) => (
            <div
              className={`cd-col-story ${i === 0 ? "cd-col-first" : ""} ${i === 2 ? "cd-col-last" : ""}`}
              key={a.titulo}
            >
              <Tag label={a.tag} color={a.tagColor} />
              <div className="cd-story-hed">{a.titulo}</div>
              <div className="cd-story-body">{a.cuerpo}</div>
              <div className="cd-story-insight">{a.insight}</div>
            </div>
          ))}
        </div>

        {/* TRIVIA */}
        <div className="cd-section-rule">
          <div className="cd-rule-line" />
          <span>¿Cuánto sabes sobre tus derechos laborales?</span>
          <div className="cd-rule-line" />
        </div>
        <TriviaSection />

        {/* SEMÁFORO NOM-035 */}
        <div className="cd-section-rule">
          <div className="cd-rule-line" />
          <span>Bienestar laboral · NOM-035-STPS</span>
          <div className="cd-rule-line" />
        </div>
        <div className="cd-bienestar-block">
          <div className="cd-bienestar-header">
            <div>
              <div className="cd-bienestar-badge">Sección interactiva</div>
              <div className="cd-bienestar-hed">
                Semáforo del estado de ánimo
                <br />
                ¿Cómo llegaste hoy al trabajo?
              </div>
              <div className="cd-bienestar-sub">
                Identifica cómo te sientes y recibe recursos personalizados para
                tu bienestar esta quincena.
              </div>
            </div>
            <div className="cd-nom-tag">NOM-035-STPS</div>
          </div>
          <SemaforoSection />
        </div>

        {/* SABÍAS QUE */}
        <div className="cd-section-rule">
          <div className="cd-rule-line" />
          <span>Cultura general · ¿sabías que...?</span>
          <div className="cd-rule-line" />
        </div>
        <div className="cd-cultura-grid">
          {SABIAS.map((s, i) => (
            <div
              className={`cd-cultura-card ${i === 0 ? "cd-cultura-first" : ""} ${i === SABIAS.length - 1 ? "cd-cultura-last" : ""}`}
              key={s.titulo}
            >
              <div className="cd-cultura-icon">{s.icon}</div>
              <div className="cd-cultura-hed">{s.titulo}</div>
              <div className="cd-cultura-body">{s.cuerpo}</div>
            </div>
          ))}
        </div>

        {/* CITA */}
        <div className="cd-quote-band">
          <div className="cd-quote-mark">"</div>
          <div className="cd-quote-text">
            El descanso no es la ausencia de trabajo. Es la condición que hace
            posible el trabajo bueno.
          </div>
          <div>
            <div className="cd-quote-author">Alex Soojung-Kim Pang</div>
            <div className="cd-quote-role">
              Autor de Rest · Stanford University
            </div>
          </div>
        </div>

        {/* CONSEJO */}
        <div className="cd-section-rule">
          <div className="cd-rule-line" />
          <span>Productividad · Consejo de la quincena</span>
          <div className="cd-rule-line" />
        </div>
        <div className="cd-consejo-band">
          <div>
            <div className="cd-consejo-label">Esta quincena</div>
            <div className="cd-consejo-num">03</div>
          </div>
          <div className="cd-consejo-list">
            <div className="cd-consejo-item">
              <div className="cd-consejo-icon">😴</div>
              <div>
                <h4>El ritual de cierre de jornada</h4>
                <p>
                  Los últimos 10 minutos del día: anota los 3 pendientes más
                  importantes de mañana, cierra aplicaciones y correo, y di
                  mentalmente "por hoy terminé". Activa el cierre cognitivo y
                  reduce la rumiación nocturna que deteriora el sueño.
                </p>
              </div>
            </div>
            <div className="cd-consejo-item">
              <div className="cd-consejo-icon">🍅</div>
              <div>
                <h4>Técnica Pomodoro adaptada al entorno industrial</h4>
                <p>
                  Trabaja 25 minutos en una tarea sin interrupciones, luego toma
                  5 minutos de pausa activa. Después de 4 ciclos, descansa 20
                  minutos. Aumenta la concentración hasta un 40% según estudios
                  de productividad laboral.
                </p>
              </div>
            </div>
            <div className="cd-consejo-item">
              <div className="cd-consejo-icon">🌿</div>
              <div>
                <h4>Pausa 4-7-8 para momentos de alta tensión</h4>
                <p>
                  Inhala 4 segundos, retén el aire 7 segundos, exhala lentamente
                  8 segundos. Repite 3 veces. Activa el sistema nervioso
                  parasimpático y reduce el estrés en menos de 2 minutos. Puedes
                  hacerlo en tu escritorio.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        {/*<div className="cd-footer">
          <div className="cd-footer-brand">
            FABPSA · <em>Sistemas</em>
          </div>
          <div className="cd-footer-meta">
            Cultura Digital · Intranet v4 · Agosto 2026 · sistemas@fabpsa.com.mx
          </div>
        </div>*/}
      </div>
    </div>
  );
}
