// pages/sit/components/IlustracionDocumental.jsx
// Ilustración del banner del dashboard documental (mismo estilo 3D brillante
// que la del Visor Ejecutivo, pero del tema del SIT): carpeta con fichas
// técnicas, sello de documento aprobado, matraz de laboratorio y calendario
// de vigencia. SVG inline: escala sin pixelarse y no pesa.
export default function IlustracionDocumental({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 360 250" role="img" aria-label="Documentación técnica" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ild-carpeta" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4f8dff" />
          <stop offset="1" stopColor="#1d4fd8" />
        </linearGradient>
        <linearGradient id="ild-carpeta-frente" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6aa2ff" />
          <stop offset="1" stopColor="#2f62f0" />
        </linearGradient>
        <linearGradient id="ild-hoja" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e7efff" />
        </linearGradient>
        <linearGradient id="ild-sello" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34e3a6" />
          <stop offset="1" stopColor="#06ad76" />
        </linearGradient>
        <linearGradient id="ild-matraz" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9b6ff" />
          <stop offset="1" stopColor="#9b3ff2" />
        </linearGradient>
        <linearGradient id="ild-cal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e8eefb" />
        </linearGradient>
        <radialGradient id="ild-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#7aa8ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#7aa8ff" stopOpacity="0" />
        </radialGradient>
        <filter id="ild-sombra" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#1d4fd8" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Halo y base */}
      <ellipse cx="180" cy="128" rx="150" ry="105" fill="url(#ild-halo)" />
      <ellipse cx="180" cy="228" rx="118" ry="12" fill="#1d4fd8" opacity="0.12" />

      {/* Esferas decorativas */}
      <circle cx="58" cy="62" r="9" fill="#5b8dff" opacity="0.85" />
      <circle cx="306" cy="48" r="6" fill="#9b3ff2" opacity="0.7" />
      <circle cx="322" cy="150" r="8" fill="#2ec4b6" opacity="0.75" />
      <circle cx="44" cy="170" r="5" fill="#9b3ff2" opacity="0.6" />

      {/* Carpeta (fondo) */}
      <g filter="url(#ild-sombra)">
        <path d="M96 70 h52 l14 14 h94 a12 12 0 0 1 12 12 v112 a12 12 0 0 1 -12 12 H96 a12 12 0 0 1 -12 -12 V82 a12 12 0 0 1 12 -12 z" fill="url(#ild-carpeta)" />
      </g>

      {/* Fichas técnicas saliendo de la carpeta */}
      <g transform="rotate(-8 150 110)">
        <rect x="112" y="46" width="96" height="124" rx="9" fill="url(#ild-hoja)" stroke="#cfdcf7" />
        <rect x="124" y="62" width="50" height="7" rx="3.5" fill="#246bfe" />
        <rect x="124" y="78" width="70" height="5" rx="2.5" fill="#c3d3f3" />
        <rect x="124" y="90" width="62" height="5" rx="2.5" fill="#c3d3f3" />
        <rect x="124" y="102" width="68" height="5" rx="2.5" fill="#c3d3f3" />
      </g>
      <g transform="rotate(6 210 110)">
        <rect x="160" y="40" width="96" height="124" rx="9" fill="url(#ild-hoja)" stroke="#cfdcf7" />
        <rect x="172" y="56" width="42" height="7" rx="3.5" fill="#9b3ff2" />
        <rect x="172" y="72" width="70" height="5" rx="2.5" fill="#c3d3f3" />
        <rect x="172" y="84" width="58" height="5" rx="2.5" fill="#c3d3f3" />
        {/* Mini tabla de la ficha */}
        <rect x="172" y="98" width="72" height="34" rx="5" fill="#eef3ff" />
        <path d="M172 109 h72 M172 120 h72 M196 98 v34" stroke="#d3def6" strokeWidth="1.5" />
      </g>

      {/* Carpeta (frente) */}
      <path d="M84 118 a12 12 0 0 1 12 -12 h172 a12 12 0 0 1 12 12 l-8 92 a12 12 0 0 1 -12 11 H104 a12 12 0 0 1 -12 -11 z" fill="url(#ild-carpeta-frente)" />
      <path d="M96 118 h172" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round" />
      <rect x="160" y="150" width="44" height="8" rx="4" fill="#ffffff" opacity="0.35" />

      {/* Sello de aprobado */}
      <g filter="url(#ild-sombra)">
        <circle cx="262" cy="176" r="27" fill="url(#ild-sello)" />
        <circle cx="262" cy="176" r="27" fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="3" />
        <path d="M250 176 l8 8 l16 -17" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Matraz de laboratorio */}
      <g transform="translate(278 62)" filter="url(#ild-sombra)">
        <path d="M14 0 h16 v22 l16 30 a8 8 0 0 1 -7 12 H5 a8 8 0 0 1 -7 -12 l16 -30 z" fill="#ffffff" fillOpacity="0.85" stroke="#b9a6f6" strokeWidth="2" />
        <path d="M2 48 h40 l4 6 a6 6 0 0 1 -5 8 H3 a6 6 0 0 1 -5 -8 z" fill="url(#ild-matraz)" />
        <rect x="11" y="-4" width="22" height="7" rx="3" fill="#9b3ff2" />
        <circle cx="16" cy="40" r="2.5" fill="#ffffff" opacity="0.8" />
        <circle cx="26" cy="34" r="1.8" fill="#ffffff" opacity="0.7" />
      </g>

      {/* Calendario de vigencia */}
      <g transform="translate(34 92)" filter="url(#ild-sombra)">
        <rect x="0" y="8" width="58" height="56" rx="9" fill="url(#ild-cal)" />
        <rect x="0" y="8" width="58" height="16" rx="9" fill="#246bfe" />
        <rect x="0" y="16" width="58" height="8" fill="#246bfe" />
        <rect x="12" y="2" width="5" height="12" rx="2.5" fill="#1d4fd8" />
        <rect x="41" y="2" width="5" height="12" rx="2.5" fill="#1d4fd8" />
        {[0, 1, 2].map((f) =>
          [0, 1, 2, 3].map((c) => (
            <rect key={`${f}-${c}`} x={7 + c * 12} y={30 + f * 10} width="8" height="6" rx="2" fill={f === 1 && c === 2 ? "#ff9f0a" : f === 2 && c === 0 ? "#2ec4b6" : "#d5e0f5"} />
          )),
        )}
      </g>

      {/* Lupa */}
      <g transform="translate(70 178)">
        <circle cx="16" cy="16" r="14" fill="#ffffff" fillOpacity="0.7" stroke="#5b8dff" strokeWidth="5" />
        <path d="M26 26 l12 12" stroke="#1d4fd8" strokeWidth="7" strokeLinecap="round" />
      </g>
    </svg>
  );
}
