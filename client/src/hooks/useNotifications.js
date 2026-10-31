import { useState, useEffect, useContext, useCallback } from "react";
import { AuthContext } from "../context/AuthContext";

/*const STATIC_BASE = (() => {
  const h = window.location.hostname;
  if (h === "192.168.16.198") return "http://192.168.16.198:3001";
  if (h === "201.151.218.138") return "http://201.151.218.138:3001";
  return "http://localhost:3001";
})();*/

const STATIC_BASE = (() => {
  if (window.location.hostname === "localhost") return "http://localhost:3001";
  return ""; // relativo — IIS proxea /api/* → localhost:3001
})();

const API = `${STATIC_BASE}/api/notificaciones`;

// ── Desbloqueo de audio al primer gesto del usuario ──────────────
let _audioCtx = null;

function _desbloquearAudio() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_audioCtx.state === "suspended") {
    _audioCtx.resume();
  }
}

if (typeof window !== "undefined") {
  ["click", "keydown", "touchstart"].forEach((evt) =>
    window.addEventListener(evt, _desbloquearAudio, { passive: true }),
  );
}

export function getAudioCtx() {
  return _audioCtx;
}
// ─────────────────────────────────────────────────────────────────

function agruparPorFecha(notifs) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  const semana = new Date(hoy);
  semana.setDate(semana.getDate() - 7);

  const grupos = { Hoy: [], Ayer: [], "Esta semana": [], Anteriores: [] };
  notifs.forEach((n) => {
    const f = new Date(n.fechaCreacion);
    f.setHours(0, 0, 0, 0);
    if (f >= hoy) grupos["Hoy"].push(n);
    else if (f >= ayer) grupos["Ayer"].push(n);
    else if (f >= semana) grupos["Esta semana"].push(n);
    else grupos["Anteriores"].push(n);
  });
  return grupos;
}

function tiempoRelativo(fecha) {
  const diff = Math.floor((Date.now() - new Date(fecha)) / 1000);
  if (diff < 60) return "Hace un momento";
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  return new Date(fecha).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

export function useNotifications() {
  const { user } = useContext(AuthContext);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [toastNotif, setToastNotif] = useState(null);

  const token = () => localStorage.getItem("fabpsa_token");
  const headers = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token()}`,
  });

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`${API}?limite=50`, { headers: headers() });
      const json = await res.json();
      if (json.ok) {
        setNotifs(json.data);
        setUnread(json.data.filter((n) => !n.leida).length);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    cargar();

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}?limite=50`, { headers: headers() });
        const json = await res.json();
        if (json.ok) {
          const nuevasCant = json.data.filter((n) => !n.leida).length;
          setNotifs((prev) => {
            const prevIds = new Set(prev.map((n) => n.idNotificacion));
            const recienLlegadas = json.data.filter(
              (n) => !prevIds.has(n.idNotificacion),
            );
            if (recienLlegadas.length > 0) {
              setToastNotif(recienLlegadas[0]);
              setPulse(true);
              setTimeout(() => setPulse(false), 1000);
            }
            return json.data;
          });
          setUnread(nuevasCant);
        }
      } catch {}
    }, 15000);

    return () => clearInterval(interval);
  }, [user]);

  const marcarLeida = async (idNotificacion) => {
    await fetch(`${API}/${idNotificacion}/leer`, {
      method: "PATCH",
      headers: headers(),
    });
    setNotifs((prev) =>
      prev.map((n) =>
        n.idNotificacion === idNotificacion ? { ...n, leida: true } : n,
      ),
    );
    setUnread((prev) => Math.max(0, prev - 1));
  };

  const marcarTodas = async () => {
    await fetch(`${API}/leer-todas`, { method: "PATCH", headers: headers() });
    setNotifs((prev) => prev.map((n) => ({ ...n, leida: true })));
    setUnread(0);
  };

  const eliminar = async (idNotificacion) => {
    await fetch(`${API}/${idNotificacion}`, {
      method: "DELETE",
      headers: headers(),
    });
    const eliminada = notifs.find((n) => n.idNotificacion === idNotificacion);
    setNotifs((prev) =>
      prev.filter((n) => n.idNotificacion !== idNotificacion),
    );
    if (eliminada && !eliminada.leida)
      setUnread((prev) => Math.max(0, prev - 1));
  };

  return {
    notifs,
    grupos: agruparPorFecha(notifs),
    unread,
    loading,
    pulse,
    panelOpen,
    setPanelOpen,
    marcarLeida,
    marcarTodas,
    eliminar,
    tiempoRelativo,
    toastNotif,
    setToastNotif,
  };
}
