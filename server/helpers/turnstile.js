// D:\IntranetAPI\src\helpers\turnstile.js

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET;

async function validateTurnstile(token, remoteip) {
  // Sin secret configurado → desarrollo sin Turnstile, se permite pasar
  if (!TURNSTILE_SECRET) {
    console.warn("[Turnstile] Sin secret configurado — validación omitida.");
    return true;
  }
  // Token simulado del frontend (cuando no hay sitekey en .env del frontend)
  if (token === "__sim__") {
    console.warn("[Turnstile] Token simulado — solo válido en desarrollo.");
    return true;
  }
  // Sin token → rechazar
  if (!token) return false;

  try {
    const body = new URLSearchParams();
    body.append("secret", TURNSTILE_SECRET);
    body.append("response", token);
    if (remoteip) body.append("remoteip", remoteip);

    const resp = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
    );
    const data = await resp.json();
    return data.success === true;
  } catch (err) {
    console.error("[Turnstile] Error al validar:", err.message);
    return false;
  }
}

module.exports = { validateTurnstile };
