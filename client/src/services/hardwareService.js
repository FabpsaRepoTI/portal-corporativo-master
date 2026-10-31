const API = `${process.env.REACT_APP_API_URL}/hardware`;

function getToken() {
  return localStorage.getItem("fabpsa_token");
}

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  };
}

export async function getCatalogo() {
  const res = await fetch(`${API}/catalogo`, { headers: headers() });
  if (!res.ok) throw new Error("Error cargando catálogo");
  return res.json();
}

export async function enviarSolicitud(payload) {
  const res = await fetch(`${API}/solicitud`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Error enviando solicitud");
  return res.json();
}
