// pages/cedis/lectoraComandos.js
// Navegación del escáner de facturas solo con la lectora (sin teclado ni mouse).
//
// 1) useLectoraGlobal: la lectora "teclea" muy rápido y termina con Enter. Mientras
//    el escáner está activo se escuchan las teclas de toda la página, así que una
//    lectura llega aunque el campo de captura haya perdido el foco (scroll, clic en
//    la tabla, detalle abierto…). Una persona tecleando es mucho más lenta: esas
//    teclas no se interceptan.
// 2) COMANDOS: códigos QR impresos (tarjeta de comandos) que mueven el módulo. Solo
//    navegación: ningún comando cambia ni borra datos.
import { useEffect, useRef } from "react";

export const PREFIJO = "CMD-";

export const COMANDOS = [
  { codigo: "CMD-INICIO", titulo: "Inicio", ayuda: "Volver arriba, a la captura", icono: "⤒" },
  { codigo: "CMD-ABAJO", titulo: "Bajar", ayuda: "Desplazar el visor hacia abajo", icono: "↓" },
  { codigo: "CMD-ARRIBA", titulo: "Subir", ayuda: "Desplazar el visor hacia arriba", icono: "↑" },
  { codigo: "CMD-SIGUIENTE", titulo: "Página siguiente", ayuda: "Siguientes 50 facturas", icono: "›" },
  { codigo: "CMD-ANTERIOR", titulo: "Página anterior", ayuda: "50 facturas anteriores", icono: "‹" },
  { codigo: "CMD-ULTIMA", titulo: "Ver última leída", ayuda: "Abre el detalle de la última factura escaneada", icono: "◎" },
  { codigo: "CMD-CERRAR", titulo: "Cerrar", ayuda: "Cierra el detalle o el aviso abierto", icono: "✕" },
  { codigo: "CMD-PENDIENTES", titulo: "No surtidas", ayuda: "Filtra las facturas por surtir", icono: "◔" },
  { codigo: "CMD-SURTIDAS", titulo: "Surtidas", ayuda: "Filtra las facturas ya surtidas", icono: "✓" },
  { codigo: "CMD-TODAS", titulo: "Todas", ayuda: "Quita el filtro de estado", icono: "≡" },
  { codigo: "CMD-ACTUALIZAR", titulo: "Actualizar", ayuda: "Vuelve a consultar las facturas", icono: "⟳" },
];

const MAX_ENTRE_TECLAS_MS = 45; // la lectora teclea en 5–20 ms; una persona, en 100+ ms
const MIN_LARGO = 3;

// Quita los últimos `n` caracteres de un input controlado por React (dispara su onChange)
function quitarDelCampo(input, n) {
  const proto = input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(input, input.value.slice(0, input.value.length - n));
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const esEditable = (el) =>
  !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/**
 * Escucha la lectora en toda la página mientras `activo`.
 * - Si el foco está en el campo de captura (`campoCaptura`), no hace nada: ese
 *   campo ya procesa la lectura con su propio formulario.
 * - Si el foco está en otro campo de texto (por ejemplo, el buscador), deja
 *   escribir normal; si la ráfaga resulta ser de la lectora, borra del campo lo
 *   que escribió y entrega el código a `onLectura`.
 * - En cualquier otro lugar acumula las teclas; al llegar Enter, si la ráfaga fue
 *   lo bastante rápida, entrega el código a `onLectura`.
 */
export function useLectoraGlobal({ activo, campoCaptura, onLectura }) {
  const buffer = useRef({ texto: "", ultima: 0, lenta: false });
  const callback = useRef(onLectura);
  callback.current = onLectura;

  useEffect(() => {
    if (!activo) return undefined;
    const alTeclear = (e) => {
      const destino = e.target;
      if (destino === campoCaptura.current) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      // En otro campo de texto (p. ej. el buscador) las teclas se dejan escribir
      // normalmente; si al final resulta ser una ráfaga de lectora, se quita del
      // campo lo que escribió y se procesa como lectura.
      const enCampo = esEditable(destino) && "value" in destino && destino.tagName !== "SELECT";
      if (esEditable(destino) && !enCampo) return;

      const b = buffer.current;
      const ahora = performance.now();
      if (ahora - b.ultima > 400) {
        b.texto = "";
        b.lenta = false;
      }
      if (e.key === "Enter") {
        const texto = b.texto.trim();
        const rapida = !b.lenta;
        const escrito = b.texto;
        b.texto = "";
        b.lenta = false;
        if (texto.length >= MIN_LARGO && rapida) {
          e.preventDefault();
          e.stopPropagation();
          if (enCampo && destino.value.endsWith(escrito)) quitarDelCampo(destino, escrito.length);
          callback.current(texto);
        }
        return;
      }
      if (e.key.length !== 1) return;
      if (b.texto && ahora - b.ultima > MAX_ENTRE_TECLAS_MS) b.lenta = true;
      b.texto += e.key;
      b.ultima = ahora;
      // Fuera de un campo: que la ráfaga no active botones ni desplace la página
      if (!enCampo) e.preventDefault();
    };
    document.addEventListener("keydown", alTeclear, true);
    return () => document.removeEventListener("keydown", alTeclear, true);
  }, [activo, campoCaptura]);
}

// Sonido corto de confirmación (sin archivos): factura, comando o error
let _audio = null;
export function sonar(tipo) {
  try {
    _audio = _audio || new (window.AudioContext || window.webkitAudioContext)();
    const notas = { factura: [880], comando: [660, 990], error: [220, 180] }[tipo] || [700];
    notas.forEach((f, i) => {
      const o = _audio.createOscillator();
      const g = _audio.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = _audio.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(g).connect(_audio.destination);
      o.start(t);
      o.stop(t + 0.09);
    });
  } catch {
    /* sin audio disponible: solo el aviso visual */
  }
}
