function FlorMini({ tono }) {
  const pet = [0, 60, 120, 180, 240, 300];
  return (
    <svg viewBox="-12 -12 24 24" width="100%" height="100%">
      {pet.map((a) => (
        <ellipse key={a} cx="0" cy="-5.2" rx="2.6" ry="4.6" fill={tono} transform={`rotate(${a})`} />
      ))}
      <circle r="2.6" fill="#ffc25c" />
    </svg>
  );
}

function CalaveraMini() {
  return (
    <svg viewBox="-12 -14 24 28" width="100%" height="100%">
      <path d="M0 -12 C7 -12 9 -6 9 -1 C9 3 7 5 5.5 6 L5.5 9 L-5.5 9 L-5.5 6 C-7 5 -9 3 -9 -1 C-9 -6 -6 -12 0 -12 Z" fill="#fbe3ea" stroke="#c9a46a" strokeWidth="0.6" />
      <circle cx="-3.5" cy="-2" r="2.2" fill="#2a1408" />
      <circle cx="3.5" cy="-2" r="2.2" fill="#2a1408" />
      <path d="M0 1 L-1.2 3.2 L1.2 3.2 Z" fill="#2a1408" />
      <circle cx="-7" cy="-7" r="1.3" fill="#c2185b" />
      <circle cx="7" cy="-7" r="1.3" fill="#c2185b" />
      <circle cx="0" cy="-10.5" r="1.3" fill="#ffb347" />
    </svg>
  );
}

function AranitaHilo({ left, top, height, dur, delay }) {
  const piernas = [-1, 1].flatMap((s) =>
    [0, 1, 2, 3].map((k) => (
      <path
        key={`${s}-${k}`}
        d={`M0 2 Q${s * (6 + k * 2)} ${-2 + k * 3} ${s * (12 + k * 2)} ${2 + k * 4}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    )),
  );
  return (
    <span
      className="dm-amb-hilo"
      style={{ left, top, height, animationDuration: `${dur}s`, animationDelay: `${delay}s` }}
    >
      <span className="dm-amb-arana-sube" style={{ animationDuration: `${dur * 1.9}s`, animationDelay: `${delay}s` }}>
        <span className="dm-amb-arana">
          <svg viewBox="-14 -14 28 28" width="100%" height="100%">
            <circle cx="0" cy="4" r="6.8" fill="currentColor" />
            <circle cx="0" cy="-5" r="4.6" fill="currentColor" />
            <circle cx="-1.6" cy="-6" r="1" fill="#ffb347" />
            <circle cx="1.6" cy="-6" r="1" fill="#ffb347" />
            {piernas}
          </svg>
        </span>
      </span>
    </span>
  );
}

// Ráfaga ocasional: cada elemento cae una sola vez muy rápido dentro de un
// ciclo largo, y el resto del tiempo queda invisible fuera de pantalla. Así
// se siente de vez en cuando, nunca como lluvia constante.
function RafagaOcasional() {
  const items = [
    { left: "4%", size: 22, dur: 86, delay: -8, tono: "#f0790d", tipo: "flor" },
    { left: "8%", size: 18, dur: 104, delay: -52, tono: "#ffb347", tipo: "flor" },
    { left: "93%", size: 24, dur: 95, delay: -30, tono: "#e8650b", tipo: "calavera" },
    { left: "96%", size: 19, dur: 112, delay: -70, tono: "#f0790d", tipo: "flor" },
    { left: "90%", size: 21, dur: 90, delay: -4, tono: "#ffb347", tipo: "flor" },
  ];
  return (
    <div className="dm-amb-rafaga" aria-hidden="true">
      {items.map((p, i) => (
        <span
          key={i}
          className="dm-amb-rafaga-item"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            "--dx": (i % 2 ? 1 : -1) * (12 + i * 4) + "px",
            "--giro": (i % 2 ? 1 : -1) * (220 + i * 20) + "deg",
          }}
        >
          {p.tipo === "flor" ? <FlorMini tono={p.tono} /> : <CalaveraMini />}
        </span>
      ))}
    </div>
  );
}

// Fantasmita juguetón: aparece en un punto, se queda un momento, se
// desvanece y "reaparece" en otro punto de la pantalla. Un solo elemento,
// nada invasivo.
function FantasmaVagabundo() {
  return (
    <span className="dm-amb-fantasma-vagar" aria-hidden="true">
      <svg viewBox="-13 -15 26 30" width="100%" height="100%">
        <path
          d="M-9 11 L-9 -2 C-9 -10 -5 -14 0 -14 C5 -14 9 -10 9 -2 L9 11
             L6 8 L3 11 L0 8 L-3 11 L-6 8 Z"
          fill="#fff6ea"
          opacity="0.95"
          stroke="#e7d9c4"
          strokeWidth="0.6"
        />
        <circle cx="-3.4" cy="-3" r="1.8" fill="#2a1408" />
        <circle cx="3.4" cy="-3" r="1.8" fill="#2a1408" />
        <path d="M-2 2.4 Q0 4.6 2 2.4" fill="none" stroke="#2a1408" strokeWidth="1" strokeLinecap="round" />
        <circle cx="-6.2" cy="-1" r="1.5" fill="#ffb3c6" opacity="0.6" />
        <circle cx="6.2" cy="-1" r="1.5" fill="#ffb3c6" opacity="0.6" />
      </svg>
    </span>
  );
}

export default function AmbienteDiaMuertos() {
  return (
    <div className="dm-ambiente" aria-hidden="true">
      <RafagaOcasional />
      <FantasmaVagabundo />
      <AranitaHilo left="18%" top="0" height="24vh" dur={7.5} delay={-2} />
      <AranitaHilo left="62%" top="0" height="18vh" dur={9} delay={-5} />
      <AranitaHilo left="86%" top="0" height="28vh" dur={6.5} delay={-1} />
    </div>
  );
}
