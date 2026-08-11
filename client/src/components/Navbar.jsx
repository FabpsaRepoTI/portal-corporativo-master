import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../hooks/useAuth";
import NotificationBell from "./NotificationBell";

export default function Navbar() {
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const initials = user?.name
    ? user.name
        .trim()
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "?";

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [usd, setUsd] = useState(null);
  const [prevUsd, setPrevUsd] = useState(null);
  const [trend, setTrend] = useState(null);
  const [temp, setTemp] = useState(null);
  const [city, setCity] = useState("Ubicación");
  const [neighborhood, setNeighborhood] = useState("");
  const [weatherCode, setWeatherCode] = useState(null);

  const dropdownRef = useRef(null);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  /* ── Scroll ── */
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  /* ── USD/MXN ── */
  useEffect(() => {
    const getRate = () => {
      fetch("https://fxapi.app/api/USD/MXN.json")
        .then((r) => r.json())
        .then((data) => {
          const newRate = data.rate;
          setPrevUsd((prev) => {
            setTrend(
              prev === null
                ? null
                : newRate > prev
                  ? "up"
                  : newRate < prev
                    ? "down"
                    : null,
            );
            return newRate;
          });
          setUsd(newRate);
        })
        .catch(console.error);
    };
    getRate();
    const id = setInterval(getRate, 10000);
    return () => clearInterval(id);
  }, []);

  /* ── Clima ── */
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude: lat, longitude: lon } }) => {
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`,
        )
          .then((r) => r.json())
          .then((d) => {
            setTemp(Math.round(d.current.temperature_2m));
            setWeatherCode(d.current.weather_code);
          })
          .catch(console.error);

        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
        )
          .then((r) => r.json())
          .then((d) => {
            setCity(d.address.city || d.address.town || d.address.state);
            setNeighborhood(d.address.suburb || d.address.neighbourhood || "");
          })
          .catch(console.error);
      },
      console.error,
    );
  }, []);

  /* ── Cerrar dropdown al hacer clic fuera ── */
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  /* ── Icono clima ── */
  let weatherIcon = "ti ti-cloud";
  if (weatherCode === 0) weatherIcon = "ti ti-sun";
  else if ([1, 2].includes(weatherCode)) weatherIcon = "ti ti-cloud-sun";
  else if (weatherCode === 3) weatherIcon = "ti ti-cloud";
  else if ([61, 63, 65, 80, 81, 82].includes(weatherCode))
    weatherIcon = "ti ti-cloud-rain";
  else if (weatherCode >= 95) weatherIcon = "ti ti-cloud-storm";

  const usdDisplay =
    usd !== null ? (Math.floor(usd * 100) / 100).toFixed(2) : "—";

  return (
    <nav
      className={`navbar ${scrolled ? "navbar--scrolled" : ""} navbar--${theme}`}
    >
      {/* ── LEFT (solo móvil) ── */}
      <div className="navbar-left">
        <button
          className="nb-hamburger"
          aria-label="Abrir menú"
          onClick={() =>
            document.dispatchEvent(new CustomEvent("sidebar:toggle"))
          }
        >
          <i className="ti ti-menu-2" />
        </button>
      </div>
      {/* ── RIGHT ── */}
      <div className="navbar-right">
        {/* Clima */}
        <div
          className="nb-widget nb-widget--weather"
          title={`${city}${neighborhood ? ` · ${neighborhood}` : ""}`}
        >
          <i
            className={`${weatherIcon} nb-widget-icon nb-widget-icon--weather`}
            aria-hidden="true"
          />
          <div className="nb-widget-body">
            <span className="nb-widget-val">{temp ?? "—"}°</span>
            <span className="nb-widget-sub">{city}</span>
          </div>
        </div>

        <span className="nb-divider" aria-hidden="true" />

        {/* USD/MXN */}
        <div
          className="nb-widget nb-widget--usd"
          title="Tipo de cambio USD/MXN"
        >
          <span
            className="nb-widget-icon nb-widget-icon--usd"
            aria-hidden="true"
          >
            $
          </span>
          <div className="nb-widget-body">
            <span className="nb-widget-val">
              {usdDisplay}
              {trend && (
                <span
                  className={`nb-trend nb-trend--${trend}`}
                  aria-label={trend === "up" ? "al alza" : "a la baja"}
                >
                  {trend === "up" ? "▲" : "▼"}
                </span>
              )}
            </span>
            <span className="nb-widget-sub">USD/MXN</span>
          </div>
        </div>

        <span className="nb-divider" aria-hidden="true" />

        {/* Toggle dark/light */}
        <button
          className="nb-theme-toggle"
          onClick={() => toggle(theme === "dark" ? "light" : "dark")}
          title={
            theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"
          }
          aria-label={
            theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"
          }
        >
          <span className="nb-theme-track">
            <span className="nb-theme-thumb">
              {theme === "dark" ? (
                <i className="ti ti-moon" aria-hidden="true" />
              ) : (
                <i className="ti ti-sun" aria-hidden="true" />
              )}
            </span>
          </span>
        </button>

        <span className="nb-divider" aria-hidden="true" />

        {/* Campana */}
        <NotificationBell />

        <span className="nb-divider" aria-hidden="true" />

        {/* Perfil */}
        <div className="nb-profile-wrapper" ref={dropdownRef}>
          <button
            className={`nb-profile-trigger ${menuOpen ? "nb-profile-trigger--open" : ""}`}
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="true"
          >
            {user?.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                className="nb-avatar nb-avatar--img"
              />
            ) : (
              <div className="nb-avatar nb-avatar--initials">{initials}</div>
            )}
            <div className="nb-profile-info">
              <span className="nb-profile-name">
                {user?.name?.split(" ")[0] ?? "Usuario"}&nbsp;
                {user?.name?.split(" ").slice(-1)[0]?.[0] ?? ""}.
              </span>
              <span className="nb-profile-dept">
                {user?.area || user?.role || "Colaborador"}
              </span>
            </div>
            <i
              className="ti ti-chevron-down nb-profile-chevron"
              aria-hidden="true"
            />
          </button>

          {menuOpen && (
            <div className="nb-dropdown" role="menu">
              {/* Cabecera */}
              <div className="nb-dd-header">
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="nb-dd-avatar nb-dd-avatar--img"
                  />
                ) : (
                  <div className="nb-dd-avatar nb-dd-avatar--initials">
                    {initials}
                  </div>
                )}
                <div className="nb-dd-name">{user?.name ?? "Usuario"}</div>
                <div className="nb-dd-meta">
                  <span className="nb-dd-dept">
                    {user?.area || user?.role || "Colaborador"}
                  </span>
                  {user?.sitio && (
                    <span className="nb-dd-badge">{user.sitio}</span>
                  )}
                </div>
              </div>

              {/* Items */}
              <div className="nb-dd-menu">
                <button className="nb-dd-item" role="menuitem">
                  <i
                    className="ti ti-user nb-dd-item-icon"
                    aria-hidden="true"
                  />
                  <span>Mi perfil</span>
                </button>
                <button className="nb-dd-item" role="menuitem">
                  <i
                    className="ti ti-settings nb-dd-item-icon"
                    aria-hidden="true"
                  />
                  <span>Configuración</span>
                </button>

                {/* Solo visible para área SISTEMAS */}
                {user?.area === "SISTEMAS" && (
                  <button
                    className="nb-dd-item"
                    role="menuitem"
                    onClick={() => {
                      navigate("/configuracion/usuarios");
                      setMenuOpen(false);
                    }}
                  >
                    <i
                      className="ti ti-users nb-dd-item-icon"
                      aria-hidden="true"
                    />
                    <span>Usuarios</span>
                  </button>
                )}

                <div className="nb-dd-sep" role="separator" />
                <button
                  className="nb-dd-item nb-dd-item--danger"
                  role="menuitem"
                  onClick={handleLogout}
                >
                  <i
                    className="ti ti-logout nb-dd-item-icon"
                    aria-hidden="true"
                  />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
