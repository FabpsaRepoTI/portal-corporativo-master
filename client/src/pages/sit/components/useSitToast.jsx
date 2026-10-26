// pages/sit/components/useSitToast.jsx
// Toast simple del módulo SIT: const [toastEl, showToast] = useSitToast()
import { useCallback, useEffect, useRef, useState } from "react";

export default function useSitToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const showToast = useCallback((msg, tipo = "success") => {
    clearTimeout(timer.current);
    setToast({ msg, tipo });
    timer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const toastEl = toast ? (
    <div className={`sit-toast sit-toast--${toast.tipo}`} role="status">
      <i className={`ti ${toast.tipo === "success" ? "ti-circle-check" : "ti-alert-circle"}`} />
      {toast.msg}
    </div>
  ) : null;

  return [toastEl, showToast];
}
