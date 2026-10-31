import cempasuchilReal from "../assets/cempasuchil-real.png";
const COLORES_PICADO = ["#f0790d", "#c2185b", "#ffb347", "#2e7d32", "#7b1fa2", "#e65100"];



function Calado({ tipo }) {
  if (tipo === "calavera") {
    return (
      <g fill="black">
        <path d="M0 -10 C6 -10 9 -6 9 -1 C9 3 7 5 5.5 6 L5.5 9 L-5.5 9 L-5.5 6 C-7 5 -9 3 -9 -1 C-9 -6 -6 -10 0 -10 Z" />
        <circle cx="-3.6" cy="-2" r="2.4" fill="white" />
        <circle cx="3.6" cy="-2" r="2.4" fill="white" />
        <path d="M0 1 L-1.4 3.6 L1.4 3.6 Z" fill="white" />
        <path d="M-3 6.6 V8.4 M0 6.6 V8.4 M3 6.6 V8.4" stroke="white" strokeWidth="0.8" />
      </g>
    );
  }
  if (tipo === "catrina") {
    return (
      <g fill="black">
        <ellipse cx="0" cy="-10" rx="10" ry="2.6" />
        <path d="M-5 -10 Q0 -17 5 -10 Z" />
        <circle cx="-6" cy="-14" r="1.6" />
        <circle cx="0" cy="-16" r="1.8" />
        <circle cx="6" cy="-14" r="1.6" />
        <ellipse cx="0" cy="0" rx="6.2" ry="7.2" />
        <circle cx="-2.4" cy="-1" r="1.5" fill="white" />
        <circle cx="2.4" cy="-1" r="1.5" fill="white" />
        <path d="M-2.2 3.4 Q0 5.2 2.2 3.4" fill="none" stroke="white" strokeWidth="0.9" />
        <path d="M-7 8 Q0 15 7 8 L8 16 L-8 16 Z" />
      </g>
    );
  }
  if (tipo === "calabaza") {
    return (
      <g fill="black">
        <ellipse cx="-4" cy="2" rx="5" ry="6.5" />
        <ellipse cx="4" cy="2" rx="5" ry="6.5" />
        <rect x="-1.2" y="-9" width="2.4" height="4" rx="0.6" />
        <path d="M1 -7 Q6 -10 8 -7 Q5 -5 1 -7 Z" />
        <path d="M-2.4 0 L-0.6 3 L-3.4 3 Z" fill="white" />
        <path d="M2.4 0 L0.6 3 L3.4 3 Z" fill="white" />
      </g>
    );
  }
  if (tipo === "flor") {
    return (
      <g fill="black">
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <circle key={a} cx={Math.cos((a * Math.PI) / 180) * 5.5} cy={Math.sin((a * Math.PI) / 180) * 5.5} r="2.6" />
        ))}
        <circle r="2.4" fill="white" />
      </g>
    );
  }
  if (tipo === "estrella") {
    return <path d="M0 -8 L2.2 -2.4 L8 -2 L3.6 1.6 L5 7 L0 3.8 L-5 7 L-3.6 1.6 L-8 -2 L-2.2 -2.4 Z" fill="black" />;
  }
  return <path d="M0 -6 C-5 -10 -9 -5 -7 -1 L0 7 L7 -1 C9 -5 5 -10 0 -6 Z" fill="black" />;
}

const TIPOS_CALADO = ["calavera", "flor", "catrina", "estrella", "calabaza", "corazon"];

export function PapelPicado({ n = 14, className = "dm-picado", idPrefix = "dm-pp" } = {}) {
  const ancho = 1000 / n;
  const w = ancho - 14;
  const cyDe = (i) => 6 + Math.sin(((i + 0.5) / n) * Math.PI) * 28;
  const altoDe = (i) => 84 + (i % 3) * 6;
  return (
    <svg className={className} viewBox="0 0 1000 150" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {Array.from({ length: n }, (_, i) => {
          const xm = i * ancho + ancho / 2;
          const cy = cyDe(i);
          return (
            <mask key={i} id={`${idPrefix}-${i}`} maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="150">
              <rect x="0" y="0" width="1000" height="150" fill="white" />
              <g transform={`translate(${xm} ${cy + altoDe(i) * 0.42})`}>
                <Calado tipo={TIPOS_CALADO[i % TIPOS_CALADO.length]} />
              </g>
            </mask>
          );
        })}
      </defs>
      <path d="M0 6 Q500 34 1000 6" fill="none" stroke="#6b3b1e" strokeWidth="1.2" opacity="0.7" />
      {Array.from({ length: n }, (_, i) => {
        const x = i * ancho + 7;
        const cy = cyDe(i);
        const c = COLORES_PICADO[i % COLORES_PICADO.length];
        const alto = altoDe(i);
        const xm = x + w / 2;
        const yb = cy + alto;
        return (
          <g key={i} className="dm-picado-flag" style={{ animationDelay: `${(i % 5) * -0.9}s` }}>
            <line x1={xm} y1={cy} x2={xm} y2={cy + 4} stroke="#6b3b1e" strokeWidth="0.6" opacity="0.6" />
            <path
              d={`M${x} ${cy + 4} H${x + w} V${yb - 14} Q${xm + w * 0.25} ${yb + 4} ${xm} ${yb - 6} Q${xm - w * 0.25} ${yb + 4} ${x} ${yb - 14} Z`}
              fill={c}
              opacity="0.93"
              mask={`url(#${idPrefix}-${i})`}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function CaminoPetalos() {
  const pts = [
    [120, 470], [150, 452], [185, 448], [220, 440], [258, 432], [294, 420], [328, 418], [360, 412],
  ];
  return (
    <svg className="dm-camino-petalos" viewBox="0 0 480 520" aria-hidden="true">
      {pts.map(([x, y], i) => (
        <ellipse
          key={i}
          cx={x}
          cy={y}
          rx={i % 2 ? 4 : 5.5}
          ry={i % 2 ? 2.6 : 3.4}
          fill={i % 3 ? "#f0790d" : "#ffb347"}
          transform={`rotate(${-20 + i * 6} ${x} ${y})`}
          className="dm-camino-petalo"
          style={{ animationDelay: `${i * 0.35}s` }}
        />
      ))}
    </svg>
  );
}

export function Cempasuchil({ size = 80, tono = "#f0790d", className = "" }) {
  const pet = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg className={`dm-flor ${className}`} width={size} height={size} viewBox="-50 -50 100 100" aria-hidden="true">
      {pet.map((a) => (
        <ellipse key={a} cx="0" cy="-24" rx="11" ry="20" fill={tono} transform={`rotate(${a})`} opacity="0.95" />
      ))}
      {pet.map((a) => (
        <ellipse key={`b${a}`} cx="0" cy="-16" rx="6" ry="11" fill="#ffc25c" transform={`rotate(${a + 15})`} opacity="0.9" />
      ))}
      <circle r="12" fill="#ffb347" />
      <circle r="5" fill="#8a3b06" opacity="0.6" />
    </svg>
  );
}

export function Vela({ className = "", encendida = false }) {
  return (
    <svg className={`dm-vela ${className}`} width={encendida ? 70 : 34} height={encendida ? 150 : 78} viewBox="0 0 34 78" aria-hidden="true">
      {encendida && (
        <>
          <defs>
            <radialGradient id="dm-halo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffd98a" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#ffb347" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle className="dm-halo" cx="17" cy="11" r="22" fill="url(#dm-halo)" />
        </>
      )}
      <rect x="5" y="22" width="24" height="54" rx="3" fill="#fff3d6" />
      <rect x="5" y="22" width="24" height="54" rx="3" fill="none" stroke="#e7b96a" strokeWidth="1" />
      <path d="M9 30 Q12 36 9 42" stroke="#ffffff" strokeWidth="1.4" fill="none" opacity="0.7" />
      <path d="M17 6 Q23 14 17 22 Q11 14 17 6 Z" className="dm-flama" fill="#ffb347" />
      <path d="M17 11 Q20 16 17 21 Q14 16 17 11 Z" fill="#fff6d6" />
    </svg>
  );
}

function FlorSvg({ x, y, r, c }) {
  const pet = Array.from({ length: 10 }, (_, i) => i * 36);
  return (
    <g transform={`translate(${x} ${y}) scale(${r})`} className="dm-of-flor">
      {pet.map((a) => (
        <ellipse key={a} cx="0" cy="-7" rx="3.4" ry="6.2" fill={c} transform={`rotate(${a})`} />
      ))}
      <circle r="3.6" fill="#ffc25c" />
    </g>
  );
}

function Hojas({ x, y, rot = 0 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d="M0 0 Q9 -7 18 0 Q9 7 0 0 Z" fill="#3f7d3f" />
      <path d="M-2 2 Q8 9 15 3" fill="none" stroke="#2a5a2a" strokeWidth="0.6" />
    </g>
  );
}

function Mandarina({ x, y, r = 6 }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill="#ff9a1f" />
      <circle cx={-r * 0.35} cy={-r * 0.3} r={r * 0.3} fill="#ffd98a" opacity="0.8" />
      <path d={`M0 ${-r} Q3 ${-r - 3} 6 ${-r - 2} Q3 ${-r + 1} 0 ${-r} Z`} fill="#3f8a3f" />
    </g>
  );
}

function Calabaza({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="-6" cy="2" rx="7" ry="8.5" fill="#e8650b" />
      <ellipse cx="0" cy="0" rx="7.5" ry="9.5" fill="#f0790d" />
      <ellipse cx="6" cy="2" rx="7" ry="8.5" fill="#e8650b" />
      <rect x="-1.4" y="-13" width="2.8" height="5" rx="0.8" fill="#5a3418" />
      <path d="M1 -11 Q7 -14 9 -10 Q5 -8 1 -11 Z" fill="#3f8a3f" />
      <path d="M-4 -5 Q0 -8 4 -5" fill="none" stroke="#c9530a" strokeWidth="0.8" opacity="0.6" />
    </g>
  );
}

function Tejocote({ x, y, r = 4.5 }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill="#e0443a" />
      <circle cx={-r * 0.3} cy={-r * 0.3} r={r * 0.28} fill="#ffb3a8" opacity="0.7" />
    </g>
  );
}

function CalaveritaSvg({ x, y, color, dots }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="dm-of-calavera">
        <path d="M0 -12 C7 -12 9 -6 9 0 C9 4 7 6 5.5 7 L5.5 10 L-5.5 10 L-5.5 7 C-7 6 -9 4 -9 0 C-9 -6 -7 -12 0 -12 Z" fill={color} stroke="#c9a46a" strokeWidth="0.5" />
        <circle cx="-3.5" cy="-1" r="2.2" fill="#2a1408" />
        <circle cx="3.5" cy="-1" r="2.2" fill="#2a1408" />
        <path d="M0 2 L-1.2 4.2 L1.2 4.2 Z" fill="#2a1408" />
        {dots && (
          <>
            <circle cx="-6" cy="-6" r="0.9" fill="#c2185b" />
            <circle cx="6" cy="-6" r="0.9" fill="#c2185b" />
            <circle cx="0" cy="-9" r="0.9" fill="#ffb347" />
          </>
        )}
      </g>
    </g>
  );
}

function PanDeMuerto({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="2" rx="18" ry="11" fill="#c9872e" />
      <ellipse cx="0" cy="0" rx="18" ry="11" fill="#e0a550" />
      <path d="M-14 -2 Q-6 -10 0 -2 Q6 -10 14 -2" fill="none" stroke="#b5762a" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M-14 2 Q-6 -6 0 2 Q6 -6 14 2" fill="none" stroke="#b5762a" strokeWidth="2.4" strokeLinecap="round" />
      <circle r="4.2" fill="#e8bb73" />
      <circle cx="-6" cy="-3" r="0.9" fill="#fff6e6" opacity="0.8" />
      <circle cx="5" cy="-4" r="0.7" fill="#fff6e6" opacity="0.8" />
      <circle cx="2" cy="4" r="0.8" fill="#fff6e6" opacity="0.7" />
      <circle cx="-7" cy="3" r="0.6" fill="#fff6e6" opacity="0.7" />
    </g>
  );
}

function Dulce({ x, y, color = "#c2185b" }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse rx="6" ry="3.6" fill={color} />
      <path d="M-6 0 L-10 -3 L-10 3 Z" fill={color} opacity="0.75" />
      <path d="M6 0 L10 -3 L10 3 Z" fill={color} opacity="0.75" />
      <path d="M-2.4 -3.6 L2.4 3.6 M2.4 -3.6 L-2.4 3.6" stroke="#fff6e6" strokeWidth="0.7" opacity="0.7" />
    </g>
  );
}

function VasoAgua({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-8 -14 L8 -14 L6 10 Q0 13 -6 10 Z" fill="#cfe9f7" opacity="0.55" stroke="#e8f4fb" strokeWidth="0.8" />
      <path d="M-7 -4 L7 -4 L5.6 9.5 Q0 12 -5.6 9.5 Z" fill="#aee0f2" opacity="0.65" />
      <ellipse cx="0" cy="-14" rx="8" ry="2" fill="#e8f7ff" opacity="0.8" />
      <path d="M-4 -9 L-3 2" stroke="#ffffff" strokeWidth="0.8" opacity="0.6" />
    </g>
  );
}

function MarcoFoto({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-15" y="-19" width="30" height="36" rx="2" fill="#5a2c14" stroke="#e0a060" strokeWidth="1.2" />
      <rect x="-11" y="-15" width="22" height="26" fill="#f3e6cf" />
      <circle cx="0" cy="-5" r="6" fill="#8a7256" />
      <path d="M-8 9 Q0 -3 8 9 Z" fill="#8a7256" />
      <rect x="-6" y="14" width="12" height="4" fill="#3a1d0c" />
    </g>
  );
}

export function Ofrenda() {
  const guirnalda = ["#f0790d", "#c2185b", "#ffb347", "#2e7d32", "#7b1fa2", "#e65100", "#ffb347", "#c2185b"];
  return (
    <div className="dm-ofrenda" aria-hidden="true">
      <span className="dm-ofrenda-halo" />
      <svg className="dm-ofrenda-svg" viewBox="0 0 300 260" aria-hidden="true">
        <defs>
          <linearGradient id="dm-altar-piedra" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9a5a33" />
            <stop offset="100%" stopColor="#3a1a0c" />
          </linearGradient>
          <linearGradient id="dm-altar-tapete" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#c2185b" />
            <stop offset="50%" stopColor="#f0790d" />
            <stop offset="100%" stopColor="#2e7d32" />
          </linearGradient>
          <radialGradient id="dm-luz-vela" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffd98a" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ffb347" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g className="dm-of-guirnalda">
          <path d="M18 14 Q150 40 282 14" fill="none" stroke="#5a2a12" strokeWidth="1" opacity="0.6" />
          {guirnalda.map((c, i) => {
            const t = i / (guirnalda.length - 1);
            const x = 22 + t * 256;
            const y = 14 + Math.sin(t * Math.PI) * 14;
            return <path key={i} d={`M${x} ${y} l9 0 l-4.5 13 z`} fill={c} opacity="0.9" />;
          })}
        </g>

        <path d="M60 176 Q150 164 240 176 L246 200 Q150 212 54 200 Z" fill="url(#dm-altar-tapete)" opacity="0.85" />
        <path d="M46 196 Q150 184 254 196 L264 232 Q150 246 36 232 Z" fill="url(#dm-altar-piedra)" />
        <path d="M46 196 Q150 184 254 196" fill="none" stroke="#e0a060" strokeWidth="0.8" opacity="0.6" />
        <path d="M72 150 Q150 138 228 150 L236 180 Q150 190 64 180 Z" fill="url(#dm-altar-piedra)" />
        <path d="M72 150 Q150 138 228 150" fill="none" stroke="#e0a060" strokeWidth="0.8" opacity="0.6" />
        <path d="M96 112 Q150 104 204 112 L210 140 Q150 148 90 140 Z" fill="url(#dm-altar-piedra)" />
        <path d="M96 112 Q150 104 204 112" fill="none" stroke="#e0a060" strokeWidth="0.8" opacity="0.6" />

        <g className="dm-of-frutas">
          <Calabaza x={40} y={214} s={1.1} />
          <Calabaza x={260} y={216} s={1} />
          <path d="M50 214 Q62 196 84 200 Q96 214 84 226 Q60 232 50 214 Z" fill="#7a4424" opacity="0.9" />
          <Mandarina x={62} y={212} />
          <Mandarina x={72} y={206} r={5.5} />
          <Mandarina x={80} y={214} r={5} />
          <Tejocote x={68} y={222} />
          <Tejocote x={78} y={222} />
          <Mandarina x={224} y={210} r={5.5} />
          <Mandarina x={234} y={216} r={6} />
          <Tejocote x={242} y={206} />
          <Tejocote x={230} y={224} />
        </g>

        <PanDeMuerto x={150} y={216} s={1.05} />
        <VasoAgua x={198} y={167} />
        <Dulce x={84} y={162} color="#c2185b" />
        <Dulce x={216} y={158} color="#2e7d32" />
        <Dulce x={150} y={160} color="#7b1fa2" />
        <Dulce x={108} y={204} color="#e8650b" />

        <MarcoFoto x={150} y={70} />
        <MarcoFoto x={102} y={96} s={0.6} />
        <MarcoFoto x={198} y={96} s={0.6} />
        <g className="dm-of-veladas">
          <circle cx="58" cy="178" r="18" fill="url(#dm-luz-vela)" className="dm-of-halo" />
          <rect x="50" y="164" width="16" height="16" rx="2" fill="#fff3d6" />
          <path d="M58 150 Q63 158 58 164 Q53 158 58 150 Z" className="dm-flama" fill="#ffb347" />
          <circle cx="150" cy="96" r="30" fill="url(#dm-luz-vela)" className="dm-of-halo" />
          <rect x="142" y="78" width="16" height="22" rx="2" fill="#fff3d6" />
          <path d="M150 62 Q156 72 150 78 Q144 72 150 62 Z" className="dm-flama" fill="#ffb347" />
          <circle cx="242" cy="178" r="18" fill="url(#dm-luz-vela)" className="dm-of-halo" />
          <rect x="234" y="166" width="14" height="14" rx="2" fill="#fff3d6" />
          <path d="M241 154 Q246 162 241 166 Q236 162 241 154 Z" className="dm-flama" fill="#ffb347" />
        </g>

        <g className="dm-of-flores">
          <FlorSvg x={36} y={232} r={1.3} c="#f0790d" />
          <FlorSvg x={52} y={240} r={1} c="#ff8c1a" />
          <FlorSvg x={262} y={232} r={1.3} c="#f0790d" />
          <FlorSvg x={248} y={242} r={1} c="#e8650b" />
          <FlorSvg x={120} y={122} r={1.1} c="#f0790d" />
          <FlorSvg x={180} y={124} r={1.2} c="#ff8c1a" />
          <FlorSvg x={108} y={152} r={0.9} c="#ff8c1a" />
          <FlorSvg x={194} y={154} r={0.9} c="#f0790d" />
          <Hojas x={24} y={226} rot={-20} />
          <Hojas x={270} y={228} rot={20} />
          <Hojas x={110} y={176} rot={-10} />
        </g>

        <PanDeMuerto x={132} y={132} s={0.6} />
        <PanDeMuerto x={150} y={126} s={0.65} />
        <PanDeMuerto x={168} y={132} s={0.6} />

        <g className="dm-of-calaveras">
          <CalaveritaSvg x={96} y={132} color="#fbe3ea" dots />
          <CalaveritaSvg x={204} y={134} color="#e3f0ff" dots={false} />
          <CalaveritaSvg x={150} y={226} color="#fdeccb" dots />
        </g>
      </svg>
    </div>
  );
}


function FlorCayendo({ tono }) {
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

function CalaveraCayendo() {
  return (
    <svg viewBox="-12 -14 24 28" width="100%" height="100%">
      <path d="M0 -12 C7 -12 9 -6 9 -1 C9 3 7 5 5.5 6 L5.5 9 L-5.5 9 L-5.5 6 C-7 5 -9 3 -9 -1 C-9 -6 -6 -12 0 -12 Z" fill="#fbe3ea" stroke="#c9a46a" strokeWidth="0.5" />
      <circle cx="-3.5" cy="-2" r="2.2" fill="#2a1408" />
      <circle cx="3.5" cy="-2" r="2.2" fill="#2a1408" />
      <path d="M0 1 L-1.2 3.2 L1.2 3.2 Z" fill="#2a1408" />
      <circle cx="-7" cy="-7" r="1.3" fill="#c2185b" />
      <circle cx="7" cy="-7" r="1.3" fill="#c2185b" />
      <circle cx="0" cy="-10.5" r="1.3" fill="#ffb347" />
    </svg>
  );
}

function CatrinaCayendo() {
  return (
    <svg viewBox="-12 -16 24 30" width="100%" height="100%">
      <path d="M-8 -8 Q0 -13 8 -8 Q6 -7 0 -7 Q-6 -7 -8 -8 Z" fill="#2a1408" />
      <path d="M-4.5 -8 Q-5 -14 0 -15 Q5 -14 4.5 -8 Z" fill="#2a1408" />
      <circle cx="-2.4" cy="-11.5" r="1.1" fill="#f0790d" />
      <circle cx="0.6" cy="-13" r="1.3" fill="#ff8c1a" />
      <circle cx="3" cy="-10.5" r="1.1" fill="#c2185b" />
      <path d="M-4.5 -6 C-4.5 0 -4.5 4 -2.6 6.5 L2.6 6.5 C4.5 4 4.5 0 4.5 -6 Z" fill="#fbe3ea" stroke="#c9a46a" strokeWidth="0.4" />
      <circle cx="-1.8" cy="-1" r="1" fill="#2a1408" />
      <circle cx="1.8" cy="-1" r="1" fill="#2a1408" />
      <path d="M0 1 L-0.7 2.2 L0.7 2.2 Z" fill="#2a1408" />
      <path d="M-5 5 Q0 9 5 5 L6 8.5 Q0 12 -6 8.5 Z" fill="#c2185b" opacity="0.9" />
    </svg>
  );
}

export function LluviaPetalos() {
  const n = 18;
  const petalos = Array.from({ length: n }, (_, i) => {
    const left = (i * 41) % 100;
    const size = 14 + ((i * 13) % 12);
    const dur = 13 + ((i * 7) % 10);
    const delay = -((i * 3.7) % dur);
    const dx = ((i % 2 ? 1 : -1) * (30 + ((i * 11) % 60))) + "px";
    const giro = (i % 2 ? 1 : -1) * (280 + ((i * 17) % 120)) + "deg";
    const tono = i % 3 === 0 ? "#ffb347" : i % 3 === 1 ? "#f0790d" : "#e8650b";
    const tipo = i % 3 === 0 ? "flor" : i % 3 === 1 ? "calavera" : "catrina";
    return { left, size, dur, delay, dx, giro, tono, tipo };
  });
  return (
    <div className="dm-lluvia-petalos" aria-hidden="true">
      {petalos.map((p, i) => (
        <span
          key={i}
          className="dm-lluvia-petalo"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            "--dx": p.dx,
            "--giro": p.giro,
          }}
        >
          {p.tipo === "flor" && <FlorCayendo tono={p.tono} />}
          {p.tipo === "calavera" && <CalaveraCayendo />}
          {p.tipo === "catrina" && <CatrinaCayendo />}
        </span>
      ))}
    </div>
  );
}

export function CalabazaIcono({ className = "" }) {
  return (
    <svg className={className} viewBox="-18 -26 36 46" aria-hidden="true">
      <path d="M-9 -16 Q0 -30 9 -16" fill="none" stroke="#2a1408" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="-8" cy="1" rx="8.6" ry="11.5" fill="#e8650b" />
      <ellipse cx="0" cy="-1" rx="10" ry="13" fill="#f0790d" />
      <ellipse cx="8" cy="1" rx="8.6" ry="11.5" fill="#e8650b" />
      <path d="M-5 -13 Q-8 -9 -5 -6" fill="none" stroke="#c9530a" strokeWidth="1" opacity="0.6" />
      <path d="M5 -13 Q8 -9 5 -6" fill="none" stroke="#c9530a" strokeWidth="1" opacity="0.6" />
      <path d="M-1.6 -17 Q0 -19.5 1.6 -17 L1.6 -14.5 Q0 -13.5 -1.6 -14.5 Z" fill="#3f7d3f" />
      <path d="M-6 -2 L-2.6 -2 L-4.3 -5.4 Z" fill="#2a1408" />
      <path d="M6 -2 L2.6 -2 L4.3 -5.4 Z" fill="#2a1408" />
      <path d="M0 0.5 L-2.2 4 L2.2 4 Z" fill="#2a1408" />
      <path d="M-6.5 7 L-4.5 5 L-2.6 7 L-0.8 5 L0.8 7 L2.6 5 L4.5 7 L6.5 5 L6.5 9 L-6.5 9 Z" fill="#2a1408" />
    </svg>
  );
}
