import { useState, useEffect } from "react";

export function useServicioConfig(slug) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!slug) return;

    setLoading(true);
    setConfig(null);
    setError(null);

    /*fetch(`/api/servicios/${slug}`, {*/
    fetch(`${process.env.REACT_APP_API_URL}/servicios/${slug}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("fabpsa_token")}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        console.log("API response:", data); // ← agrega esto
        setConfig(data.data ?? data); // ← cambia esta línea también
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  return { config, loading, error };
}
