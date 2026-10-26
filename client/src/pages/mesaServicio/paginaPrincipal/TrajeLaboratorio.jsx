// pages/mesaServicio/paginaPrincipal/TrajeLaboratorio.jsx
// "Uniforme" de Fabi · Información Técnica (el asistente del SIT): goggles de
// laboratorio sobre el casco y gafete del SIT con un matraz, colgado del cuello.
// Coordenadas del PNG del robot (fabi.png, 910×1035), igual que DisfrazCatrin:
//  - LaboratorioCabeza va en la capa de la cabeza (se inclina con ella)
//  - LaboratorioCuerpo va en la capa del cuerpo

export function LaboratorioCabeza() {
  return (
    <svg className="mrb__disfraz" viewBox="0 0 910 1035" aria-hidden="true">
      <defs>
        <linearGradient id="lab-banda" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1f2937" />
          <stop offset="1" stopColor="#0b1220" />
        </linearGradient>
        <radialGradient id="lab-lente" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#d9fbf4" stopOpacity="0.95" />
          <stop offset="0.55" stopColor="#5fd4bd" stopOpacity="0.75" />
          <stop offset="1" stopColor="#0f766e" stopOpacity="0.85" />
        </radialGradient>
        <linearGradient id="lab-marco" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#e5e7eb" />
          <stop offset="1" stopColor="#9ca3af" />
        </linearGradient>
      </defs>
      {/* Banda elástica que rodea el casco por arriba del visor */}
      <path d="M268 150 Q540 70 812 150" stroke="url(#lab-banda)" strokeWidth="26" fill="none" strokeLinecap="round" />
      {/* Goggles sobre la frente */}
      <g transform="rotate(-3 540 112)">
        <rect x="392" y="70" width="296" height="92" rx="44" fill="url(#lab-marco)" />
        <rect x="402" y="80" width="276" height="72" rx="36" fill="#374151" />
        <ellipse cx="478" cy="116" rx="66" ry="30" fill="url(#lab-lente)" />
        <ellipse cx="602" cy="116" rx="66" ry="30" fill="url(#lab-lente)" />
        <rect x="532" y="104" width="16" height="22" rx="6" fill="#4b5563" />
        {/* reflejos */}
        <path d="M440 102 q18 -10 40 -8" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.8" />
        <path d="M566 102 q18 -10 40 -8" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.8" />
      </g>
    </svg>
  );
}

export function LaboratorioCuerpo() {
  return (
    <svg className="mrb__disfraz" viewBox="0 0 910 1035" aria-hidden="true">
      <defs>
        <linearGradient id="lab-gafete" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e6f4f1" />
        </linearGradient>
      </defs>
      {/* Cordón del gafete desde el cuello */}
      <path d="M470 585 L590 760 M640 585 L606 760" stroke="#0f766e" strokeWidth="9" strokeLinecap="round" fill="none" />
      {/* Gafete */}
      <g transform="rotate(6 600 820)">
        <rect x="548" y="752" width="112" height="140" rx="14" fill="url(#lab-gafete)" stroke="#0f766e" strokeWidth="5" />
        <rect x="586" y="744" width="36" height="18" rx="6" fill="#0f766e" />
        {/* Matraz */}
        <path d="M592 784 h24 v22 l22 38 a8 8 0 0 1 -7 12 h-54 a8 8 0 0 1 -7 -12 l22 -38 z" fill="none" stroke="#0f766e" strokeWidth="5" strokeLinejoin="round" />
        <path d="M580 836 h48 l8 14 a5 5 0 0 1 -4 6 h-56 a5 5 0 0 1 -4 -6 z" fill="#2ec4b6" opacity="0.8" />
        <text x="604" y="882" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="20" fill="#0f766e">SIT</text>
      </g>
    </svg>
  );
}
