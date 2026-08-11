//Axios es una popular librería de JavaScript utilizada como un cliente HTTP basado en promesas.
// Sirve para realizar solicitudes HTTP a servidores externos o APIs.
// Funciona de manera idéntica tanto en el navegador web como en entornos de servidor como Node.js
import axios from "axios";

const API_URL = `${process.env.REACT_APP_API_URL}/auth`;

//Hace el post al back y devuelve un objeto {toker, user}
export async function loginService(login, password) {
  const response = await axios.post(`${API_URL}/login`, {
    login,
    password,
  });
  return response.data;
}

//guardamos el token y lo usamos en localstorage
//importante a la funcion le pasamos los parametros del objeto
export function saveSession(token, user) {
  localStorage.setItem("fabpsa_token", token);

  //El usuario es un objeto, así que lo convertimos a texto primero von stringify.
  localStorage.setItem("fabpsa_user", JSON.stringify(user));
}

export function getSession() {
  //Lee lo que guardamos antes. Si el usuario recarga la página, esta función recupera su sesión para que no tenga que volver a iniciar sesión.
  //parseamos el objeto antes de pasarlo
  const token = localStorage.getItem("fabpsa_token");
  const user = localStorage.getItem("fabpsa_user");
  if (!token || !user) return null;
  return { token, user: JSON.parse(user) };
}

//"limpiamos" o Borramos la sesion

export function clearSession() {
  localStorage.removeItem("fabpsa_token");
  localStorage.removeItem("fabpsa_user");
}
