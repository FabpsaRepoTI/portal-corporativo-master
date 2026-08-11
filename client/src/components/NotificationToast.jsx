import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAudioCtx } from "../hooks/useNotifications";
import "../style/NotificationBell.css";

async function playNotificationSound() {
  try {
    const ctx = getAudioCtx();
    if (!ctx || ctx.state === "suspended") return;

    // Primer tono D5
    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.connect(g1);
    g1.connect(ctx.destination);
    o1.type = "sine";
    o1.frequency.value = 587;
    g1.gain.setValueAtTime(0.12, ctx.currentTime);
    g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    o1.start(ctx.currentTime);
    o1.stop(ctx.currentTime + 0.25);

    // Segundo tono A5
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.connect(g2);
    g2.connect(ctx.destination);
    o2.type = "sine";
    o2.frequency.value = 880;
    g2.gain.setValueAtTime(0.1, ctx.currentTime + 0.15);
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o2.start(ctx.currentTime + 0.15);
    o2.stop(ctx.currentTime + 0.5);
  } catch (err) {
    console.error("Error reproduciendo sonido:", err);
  }
}

export default function NotificationToast({ notificacion, onClose }) {
  const navigate = useNavigate();
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    playNotificationSound();
    const t1 = setTimeout(() => setSaliendo(true), 4000);
    const t2 = setTimeout(() => onClose(), 4500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  function handleClick() {
    onClose();
    navigate(notificacion.urlDestino);
  }

  return (
    <div
      className={`nt-toast ${saliendo ? "nt-toast--out" : ""}`}
      onClick={handleClick}
    >
      <div
        className="nt-toast-icon"
        style={{ background: `${notificacion.colorHex}22` }}
      >
        <i
          className={`ti ti-${notificacion.icono}`}
          style={{ color: notificacion.colorHex }}
        />
      </div>
      <div className="nt-toast-body">
        <div className="nt-toast-title">{notificacion.titulo}</div>
        <div className="nt-toast-desc">{notificacion.descripcion}</div>
      </div>
      <button
        className="nt-toast-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <i className="ti ti-x" />
      </button>
    </div>
  );
}
