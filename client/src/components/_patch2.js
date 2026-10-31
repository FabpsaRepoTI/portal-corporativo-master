const fs = require("fs");
const F = "src/components/DiaMuertosEscena.jsx";
let s = fs.readFileSync(F, "utf8");
const rep = (a, b) => {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error(`x${n}: ${a.slice(0, 60)}`);
  s = s.replace(a, () => b);
};

rep(
  "export function Ofrenda() {",
  `function MarcoFoto({ x, y }) {
  return (
    <g transform={\`translate(\${x} \${y})\`}>
      <rect x="-15" y="-19" width="30" height="36" rx="2" fill="#5a2c14" stroke="#e0a060" strokeWidth="1.2" />
      <rect x="-11" y="-15" width="22" height="26" fill="#f3e6cf" />
      <circle cx="0" cy="-5" r="6" fill="#8a7256" />
      <path d="M-8 9 Q0 -3 8 9 Z" fill="#8a7256" />
      <rect x="-6" y="14" width="12" height="4" fill="#3a1d0c" />
    </g>
  );
}

export function Ofrenda() {`,
);

rep(
  `        <g className="dm-of-veladas">
          <circle cx="150" cy="96" r="30" fill="url(#dm-luz-vela)" className="dm-of-halo" />`,
  `        <MarcoFoto x={150} y={70} />
        <g className="dm-of-veladas">
          <circle cx="150" cy="96" r="30" fill="url(#dm-luz-vela)" className="dm-of-halo" />`,
);

fs.writeFileSync(F, s);
console.log("ok");
