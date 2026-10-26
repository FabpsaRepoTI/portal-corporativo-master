const BASE = "/api/encuesta-mesa";

function headers() {
  const token = localStorage.getItem("fabpsa_token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function request(method, path, body) {
  const opts = { method, headers: headers(), cache: "no-store" };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok || data.ok === false)
    throw new Error(data.error || "Error en la solicitud");
  return data;
}

export const getEstadoEncuesta = () => request("GET", "/estado");
export const enviarEncuesta = (body) => request("POST", "", body);
export const getResultadosEncuesta = () => request("GET", "/resultados");
