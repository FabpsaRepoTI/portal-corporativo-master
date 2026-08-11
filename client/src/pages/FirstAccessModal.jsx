// ─────────────────────────────────────────────────────────
//  FirstAccessModal.jsx — FABPSA Portal Corporativo v4
// ─────────────────────────────────────────────────────────
import { useEffect, useState, useRef } from "react";
import "../style/FirstAccessModal.css";

const STEPS = [
  "Validando credenciales",
  "Configurando perfil",
  "Preparando permisos",
  "Cargando recursos",
  "Acceso listo",
];

const FACTS = [
  {
    tag: "Ciberseguridad",
    text: "El 95 % de los incidentes de seguridad son causados por errores humanos. Una sola contraseña robusta puede marcar la diferencia.",
  },
  {
    tag: "Productividad",
    text: "Las personas que organizan sus tareas en bloques de tiempo son hasta un 80 % más eficientes que quienes trabajan sin estructura.",
  },
  {
    tag: "IA",
    text: "Los modelos de lenguaje como GPT o Claude procesan millones de parámetros en milisegundos para generar cada respuesta que lees.",
  },
  {
    tag: "Tecnología",
    text: "El primer correo electrónico fue enviado en 1971 por Ray Tomlinson. Hoy se envían más de 330 mil millones de correos al día.",
  },
  {
    tag: "Cultura Digital",
    text: "Las empresas que adoptan cultura digital crecen 5× más rápido en productividad que las que mantienen procesos 100 % manuales.",
  },
  {
    tag: "Ciberseguridad",
    text: "El phishing representa más del 80 % de los intentos de robo de información corporativa. Siempre verifica el remitente antes de hacer clic.",
  },
  {
    tag: "Productividad",
    text: "Según estudios de Harvard, tomarse pausas de 5 minutos cada hora mejora el enfoque y reduce errores hasta en un 40 %.",
  },
  {
    tag: "IA",
    text: "La inteligencia artificial puede analizar imágenes médicas con una precisión comparable a la de especialistas humanos en algunos casos.",
  },
  {
    tag: "Tecnología",
    text: "Más del 90 % del tráfico de internet se mueve por cables de fibra óptica submarinos. ¡Hay más de 400 cables en los fondos marinos!",
  },
  {
    tag: "Cultura Digital",
    text: "El trabajo remoto bien gestionado puede aumentar la retención de talento hasta en un 25 % dentro de las organizaciones.",
  },
];

const TOTAL_MS = 8000;
const FACT_MS = 3500;

export default function FirstAccessModal({ onComplete }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [factIdx, setFactIdx] = useState(() =>
    Math.floor(Math.random() * FACTS.length),
  );
  const [factVisible, setFactVisible] = useState(true);

  const rafRef = useRef(null);
  const startRef = useRef(null);
  const doneRef = useRef(false); // ref para evitar doble llamada a onComplete

  // ── Animación de progreso ─────────────────────────────
  useEffect(() => {
    startRef.current = performance.now();

    function tick(now) {
      const elapsed = now - startRef.current;
      const pct = Math.min(elapsed / TOTAL_MS, 1);
      const newStep = Math.floor(pct * STEPS.length);
      const clampIdx = Math.min(newStep, STEPS.length - 1);

      setProgress(Math.round(pct * 100));
      setStepIdx(clampIdx);

      if (pct < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else if (!doneRef.current) {
        doneRef.current = true;
        setDone(true);
        setTimeout(onComplete, 1200);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Rotación de datos curiosos ────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setFactVisible(false);
      setTimeout(() => {
        setFactIdx((i) => (i + 1) % FACTS.length);
        setFactVisible(true);
      }, 350);
    }, FACT_MS);
    return () => clearInterval(timer);
  }, []);

  const fact = FACTS[factIdx] ?? FACTS[0];
  const currentStep = STEPS[stepIdx] ?? STEPS[STEPS.length - 1];

  return (
    <div
      className="fam-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Configurando tu acceso"
    >
      <div className="fam-card">
        {/* Encabezado — ícono FIJO, sin acceso dinámico a array */}
        <div className="fam-header">
          <div className="fam-logo-ring">
            <i
              className={`ti ${done ? "ti-check fam-logo-icon--done" : "ti-settings"} fam-logo-icon`}
            />
          </div>
          <h2 className="fam-title">
            {done ? "¡Todo listo!" : "Preparando tu acceso"}
          </h2>
          <p className="fam-subtitle">
            {done
              ? "Tu espacio de trabajo ha sido configurado correctamente."
              : "Estamos configurando tu espacio de trabajo. Solo tomará unos segundos."}
          </p>
        </div>

        {/* Pasos */}
        <div className="fam-steps">
          {STEPS.map((label, i) => {
            const state =
              done || i < stepIdx
                ? "done"
                : i === stepIdx
                  ? "active"
                  : "pending";
            return (
              <div key={label} className={`fam-step fam-step--${state}`}>
                <div className="fam-step-dot">
                  {state === "done" && <i className="ti ti-check" />}
                  {state === "active" && <span className="fam-step-pulse" />}
                </div>
                <span className="fam-step-label">{label}</span>
              </div>
            );
          })}
        </div>

        {/* Barra de progreso */}
        <div
          className="fam-bar-wrap"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="fam-bar-track">
            <div className="fam-bar-fill" style={{ width: `${progress}%` }}>
              <div className="fam-bar-shine" />
            </div>
          </div>
          <span className="fam-bar-pct">{progress}%</span>
        </div>

        {/* Dato curioso */}
        {!done && (
          <div
            className={`fam-fact ${factVisible ? "fam-fact--visible" : "fam-fact--hidden"}`}
          >
            <div className="fam-fact-tag">
              <i className="ti ti-bulb" />
              {fact.tag}
            </div>
            <p className="fam-fact-text">{fact.text}</p>
          </div>
        )}

        {/* Éxito */}
        {done && (
          <div className="fam-success">
            <i className="ti ti-confetti" />
            <span>Iniciando sesión…</span>
          </div>
        )}
      </div>
    </div>
  );
}
