// Aquí definimos la URL base del backend para solicitudes.
// process.env.REACT_APP_API_URL viene del archivo .env.development
// que ya configuramos antes — en desarrollo vale http://localhost:3001/api
//const API = `${process.env.REACT_APP_API_URL}/solicitudes`;
const API_ADMIN = `${process.env.REACT_APP_API_URL}/admin`;
const API       = `${process.env.REACT_APP_API_URL}/solicitudes`;
// Esta función lee el token JWT que guardamos en localStorage al hacer login.
// Lo necesitamos para identificarnos ante el backend en cada petición.
function getToken() {
  return localStorage.getItem("fabpsa_token");
}

// headers() construye el objeto de cabeceras HTTP que va en cada petición.
// "Content-Type" le dice al backend que enviamos JSON.
// "Authorization" le dice quién somos — el backend valida que sea un token válido.
function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  };
}

// Trae todas las solicitudes de hardware con su detalle de artículos.
// Es un GET — solo pide datos, no envía nada.



// Guarda los cambios de atención de una solicitud.
// Recibe el ID de la solicitud y un array de cambios por artículo.
// Es un POST — envía datos al backend.



// Rechaza una solicitud completa — marca todos sus artículos como Rechazada.
// Solo recibe el ID de la solicitud.

export async function getSolicitudesHardware() {
  const res = await fetch(`${API_ADMIN}/hardware`, { headers: headers() });
  if (!res.ok) throw new Error("Error cargando solicitudes");
  return res.json();
}

export async function atenderSolicitud(idSolicitud, cambios) {
  const res = await fetch(`${API_ADMIN}/hardware/atender`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ idSolicitud, cambios }),
  });
  if (!res.ok) throw new Error("Error guardando cambios");
  return res.json();
}

export async function rechazarSolicitud(idSolicitud) {
  const res = await fetch(`${API_ADMIN}/hardware/rechazar`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ idSolicitud }),
  });
  if (!res.ok) throw new Error("Error rechazando solicitud");
  return res.json();
}