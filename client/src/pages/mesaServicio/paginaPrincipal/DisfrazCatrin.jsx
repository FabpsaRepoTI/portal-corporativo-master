// pages/mesaServicio/paginaPrincipal/DisfrazCatrin.jsx
// Disfraz de temporada de Fabi: el catrín (José Guadalupe Posada).
// Piezas en SVG con coordenadas del PNG del robot (fabi.png, 910×1035),
// medidas sobre su canal alfa, para que asienten sobre el personaje:
//  - CatrinCabeza: sombrero de copa satinado con banda rosa mexicano,
//    cempasúchil y pluma, más detalles de catrina en el visor. Va dentro de la
//    capa de la cabeza, así que se inclina con ella.
//  - CatrinCuerpo: moño de gala bajo el cuello y collar de cempasúchil. Va
//    dentro de la capa del cuerpo.
//  - CatrinCapa: capa de gala detrás de todo el robot.
// Los ids de los degradados llevan prefijo propio (pueden convivir varias
// instancias en la página: los degradados son idénticos).

const Flor = ({ x, y, r, color = "#f2b544", centro = "#e08a1e" }) => (
  <g>
    {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => (
      <ellipse
        key={a}
        cx={x}
        cy={y - r * 0.56}
        rx={r * 0.24}
        ry={r * 0.5}
        fill={color}
        stroke="rgba(120,60,10,.22)"
        strokeWidth="1.5"
        transform={`rotate(${a} ${x} ${y})`}
      />
    ))}
    {[15, 75, 135, 195, 255, 315].map((a) => (
      <ellipse key={`i${a}`} cx={x} cy={y - r * 0.33} rx={r * 0.17} ry={r * 0.3} fill={centro} opacity="0.75" transform={`rotate(${a} ${x} ${y})`} />
    ))}
    <circle cx={x} cy={y} r={r * 0.2} fill="#8a4b0f" />
  </g>
);

export function CatrinCabeza() {
  // Ojos (405,345) y (655,345); cejas en y 250; cima del casco en y 12
  const puntos = (cx, cy, r) =>
    Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return <circle key={i} cx={cx + Math.cos(a) * r} cy={cy + Math.sin(a) * r * 0.82} r={i % 2 ? 4.5 : 6.5} fill={i % 2 ? "#e83e8c" : "#f2b544"} opacity="0.85" />;
    });
  return (
    <svg className="mrb__disfraz" viewBox="0 0 910 1035" aria-hidden="true">
      <defs>
        <linearGradient id="ctr-satin" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#0d0b14" />
          <stop offset="0.28" stopColor="#2a2636" />
          <stop offset="0.42" stopColor="#4a4459" />
          <stop offset="0.56" stopColor="#25212f" />
          <stop offset="1" stopColor="#0b0a10" />
        </linearGradient>
        <linearGradient id="ctr-ala" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3a3547" />
          <stop offset="1" stopColor="#0b0a10" />
        </linearGradient>
        <linearGradient id="ctr-banda" x1="0" x2="1">
          <stop offset="0" stopColor="#b8135f" />
          <stop offset="0.5" stopColor="#e83e8c" />
          <stop offset="1" stopColor="#a5104f" />
        </linearGradient>
        <linearGradient id="ctr-pluma" x1="0" x2="1" y1="1" y2="0">
          <stop offset="0" stopColor="#3b2a55" />
          <stop offset="1" stopColor="#b48be6" />
        </linearGradient>
      </defs>

      {/* Detalles de catrina en el visor: puntos alrededor de los ojos y flor en la frente */}
      <g opacity="0.9">
        {puntos(405, 345, 84)}
        {puntos(655, 345, 84)}
        <Flor x={530} y={222} r={22} color="#e83e8c" centro="#f7c96b" />
      </g>

      {/* Sombrero de copa, ladeado sobre la cresta del casco (sale por encima de la imagen) */}
      <g transform="translate(8 -168) rotate(-9 555 228) translate(555 250) scale(1.1) translate(-555 -250)">
        {/* sombra del ala sobre el casco */}
        <ellipse cx="555" cy="236" rx="178" ry="34" fill="rgba(10,8,20,.28)" />
        {/* copa */}
        <path d="M432 222 L448 52 Q555 30 662 52 L678 222 Z" fill="url(#ctr-satin)" />
        <ellipse cx="555" cy="52" rx="107" ry="20" fill="#2d2939" />
        <ellipse cx="555" cy="50" rx="100" ry="15" fill="#1a1724" />
        {/* banda */}
        <path d="M436 178 L674 178 L678 222 L432 222 Z" fill="url(#ctr-banda)" />
        <path d="M436 182 L674 182" stroke="#f7c96b" strokeWidth="3" opacity="0.8" />
        {/* ala */}
        <ellipse cx="555" cy="224" rx="172" ry="30" fill="url(#ctr-ala)" />
        <path d="M388 220 Q555 252 722 220" stroke="#5a5470" strokeWidth="3" fill="none" opacity="0.7" />
        {/* pluma y cempasúchil en la banda */}
        <path d="M628 196 C 664 130 700 84 752 44 C 730 86 708 112 698 136 C 688 158 676 176 660 196 Z" fill="url(#ctr-pluma)" />
        <path d="M644 192 C 680 132 712 88 748 50" stroke="#efe6fb" strokeWidth="3" fill="none" opacity="0.75" />
        <Flor x={640} y={196} r={34} />
        <Flor x={598} y={206} r={20} color="#f7c96b" />
      </g>
    </svg>
  );
}

// Collar: curva en U alrededor de la base del cuello, sin tapar la luz del pecho
const COLLAR = Array.from({ length: 9 }, (_, i) => {
  const t = i / 8;
  const x = 418 + (678 - 418) * t;
  const y = 598 + Math.sin(Math.PI * t) * 42;
  return [Math.round(x), Math.round(y)];
});

// Capa de gala: va DETRÁS de todo el robot. Exterior negro satinado, forro
// rosa mexicano que asoma en las orillas, bordado dorado y calaveritas en el ruedo.
export function CatrinCapa() {
  const calaverita = (x, y, k) => (
    <g key={k} transform={`translate(${x} ${y})`} opacity="0.95">
      <path d="M0 -15 c11 0 15 7 15 14 c0 6 -3 9 -6 11 v6 h-18 v-6 c-3 -2 -6 -5 -6 -11 c0 -7 4 -14 15 -14z" fill="#f7efe3" />
      <circle cx="-5.5" cy="-2" r="4" fill="#2a1408" />
      <circle cx="5.5" cy="-2" r="4" fill="#2a1408" />
      <path d="M0 3 l-2.5 4 h5z" fill="#2a1408" />
      <circle cx="0" cy="-11" r="2.6" fill="#e83e8c" />
    </g>
  );
  return (
    <svg className="mrb__disfraz mrb__disfraz--capa" viewBox="0 0 910 1035" aria-hidden="true">
      <defs>
        <linearGradient id="ctr-capa" x1="0" x2="1">
          <stop offset="0" stopColor="#0b0a12" />
          <stop offset="0.3" stopColor="#26222f" />
          <stop offset="0.5" stopColor="#3b3548" />
          <stop offset="0.7" stopColor="#221e2b" />
          <stop offset="1" stopColor="#0a0910" />
        </linearGradient>
        <linearGradient id="ctr-forro" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#e83e8c" />
          <stop offset="1" stopColor="#9c0f4f" />
        </linearGradient>
      </defs>
      {/* Formas de la capa, ajustadas al cuerpo (hombros y370–740, ruedo y≈960) */}
      <g transform="translate(555 598) scale(0.84 0.68) translate(-550 -772)">
      {/* Forro: asoma en las orillas y el ruedo */}
      <path d="M314 772 C 256 900, 198 1090, 168 1296 Q 268 1334 360 1310 Q 452 1340 545 1316 Q 638 1340 730 1310 Q 822 1334 922 1296 C 892 1090, 834 900, 786 772 Z" fill="url(#ctr-forro)" />
      {/* Exterior con vuelo */}
      <path d="M330 772 C 272 900, 214 1090, 184 1288 Q 268 1318 360 1294 Q 452 1324 545 1300 Q 638 1324 730 1294 Q 822 1318 906 1288 C 876 1090, 818 900, 770 772 Z" fill="url(#ctr-capa)" />
      {/* Bordado dorado del ruedo */}
      <path d="M196 1262 Q270 1290 360 1268 Q452 1298 545 1274 Q638 1298 730 1268 Q820 1290 894 1262" stroke="#f2b544" strokeWidth="5" fill="none" opacity="0.9" />
      <path d="M206 1236 Q545 1270 884 1236" stroke="#f2b544" strokeWidth="2" strokeDasharray="3 9" fill="none" opacity="0.8" />
      {/* Pliegues */}
      <path d="M300 900 Q262 1080 236 1250" stroke="rgba(255,255,255,.07)" strokeWidth="10" fill="none" />
      <path d="M800 900 Q838 1080 862 1250" stroke="rgba(255,255,255,.07)" strokeWidth="10" fill="none" />
      </g>
      {/* Calaveritas del ruedo (fuera de la transformación para no deformarlas) */}
      {[[302, 893], [380, 893], [725, 893], [802, 893]].map(([x, y], k) => calaverita(x, y, k))}
    </svg>
  );
}

export function CatrinCuerpo() {
  return (
    <svg className="mrb__disfraz" viewBox="0 0 910 1035" aria-hidden="true">
      <defs>
        <linearGradient id="ctr-mono" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3a3547" />
          <stop offset="0.5" stopColor="#15121d" />
          <stop offset="1" stopColor="#05040a" />
        </linearGradient>
      </defs>
      {/* Collar de cempasúchil, como en las ofrendas (el moño va encima) */}
      {COLLAR.map(([x, y], i) => (
        <Flor key={i} x={x} y={y} r={i % 2 ? 21 : 25} color={i === 4 ? "#e83e8c" : i % 3 === 1 ? "#f7c96b" : "#f2b544"} centro={i === 4 ? "#f7c96b" : "#e08a1e"} />
      ))}
      {/* Moño de gala bajo el cuello */}
      <g transform="translate(-3 -172) rotate(-6 548 776) translate(548 776) scale(0.78) translate(-548 -776)">
        <path d="M548 776 L470 742 Q452 776 470 810 Z" fill="url(#ctr-mono)" />
        <path d="M548 776 L626 742 Q644 776 626 810 Z" fill="url(#ctr-mono)" />
        <path d="M478 752 Q490 776 478 800" stroke="#5a5470" strokeWidth="3" fill="none" opacity="0.6" />
        <path d="M618 752 Q606 776 618 800" stroke="#5a5470" strokeWidth="3" fill="none" opacity="0.6" />
        <rect x="532" y="760" width="32" height="32" rx="9" fill="#e83e8c" />
        <rect x="537" y="764" width="22" height="7" rx="3" fill="#f6a6c8" opacity="0.7" />
      </g>
    </svg>
  );
}
