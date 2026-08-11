// ─── APLICATIVOS ─────────────────────────────────────────────

export const CATEGORIAS = [
  {
    id: "hardware",
    icon: "ti-device-laptop",
    label: "Hardware y periféricos",
    descripcion:
      "Solicite la asignación, reemplazo o préstamo de equipos y accesorios tecnológicos.",
    color: "emerald",
    badge: "Popular",
    action: "navigate",
    route: "/mesa-de-servicio/hardware",
  },
  {
    id: "desarrollo",
    icon: "ti-code",
    label: "Desarrollo de sistemas",
    descripcion: "Solicita desarrollo, mejoras o mantenimiento de sistemas.",
    color: "amber",
    badge: "Nuevo",
    action: "navigate",
    route: "/mesa-de-servicio/desarrollo",
  },
  {
    id: "software",
    icon: "ti-apps",
    label: "Software",
    descripcion:
      "Instalación, actualización Y configuración de software autorizado por la empresa.",
    color: "blue",
    action: "incident",
  },
  {
    id: "accesos",
    icon: "ti-lock",
    label: "Accesos y cuentas de usuario",
    descripcion:
      "Altas, bajas y modificaciones de usuario en correo electronico.",
    color: "orange",
    action: "incident",
  },
  {
    id: "incidentes",
    icon: "ti-alert-triangle",
    label: "Incidentes y fallas",
    descripcion:
      "Reporta fallas en equipos, aplicaciones, sistemas o cualquier incidente tecnológico",
    color: "violet",
    action: "accordion",
  },
  {
    id: "consultas",
    icon: "ti-message-circle",
    label: "Servicios generales TI",
    descripcion:
      "Asesoría o servicios relacionados con el uso de las herramientas tecnológicas de la empresa.",
    color: "teal",
    action: "incident",
  },
  {
    id: "seguridad",
    icon: "ti-message-circle",
    label: "Servicios generales TI",
    descripcion:
      "Asesoría o servicios relacionados con el uso de las herramientas tecnológicas de la empresa.",
    color: "teal",
    action: "security",
  },
];

export const INCIDENTES_ICONS = {
  "Equipo de cómputo": "ti-device-desktop",
  "Correo electrónico y Microsoft 365": "ti-mail",
  "Sistemas y Aplicaciones": "ti-apps",
  "Internet y red": "ti-wifi-off",
  "Impresoras y Escáneres": "ti-printer",
  "Telefonia y comunicaciones": "ti-phone",
  "Infrasestructura y servidores": "ti-server",
  "Seguridad Informática": "ti-shield-lock",
  "Oficce 365": "ti-brand-office",
  "CCTV y control de acceso": "ti-camera",
  "ERP Multivisión": "ti-chart-bar",
};

export const INCIDENTES_CHIPS = [
  {
    id: "inc-computo",
    icon: "ti-desktop",
    label: "Equipo de cómputo",
    descripcion: "Computadora, teclado, monitor y mouse.",
  },
  {
    id: "inc-correo",
    icon: "ti-mail",
    label: "Correo electrónico y Microsoft 365",
    descripcion: "Outlook, Teams, OneDrive y SharePoint.",
  },
  {
    id: "inc-sistemas",
    icon: "ti-apps",
    label: "Sistemas y Aplicaciones",
    descripcion: "Sistemas contables y de negocio.",
  },
  {
    id: "inc-red",
    icon: "ti-wifi-off",
    label: "Internet y red",
    descripcion: "Internet, WiFi, VPN, red corporativa.",
  },
  {
    id: "inc-impresoras",
    icon: "ti-printer",
    label: "Impresoras y Escáneres",
    descripcion: "Impresoras multifuncionales y etiquetadoras.",
  },
  {
    id: "inc-telefonia",
    icon: "ti-phone",
    label: "Telefonía y comunicaciones",
    descripcion: "Extensiones, teléfonos y VPN.",
  },
  {
    id: "inc-servidores",
    icon: "ti-server",
    label: "Infraestructura y servidores",
    descripcion: "Servidores, almacenamiento, respaldos y AD.",
  },
  {
    id: "inc-seguridad",
    icon: "ti-shield",
    label: "Seguridad Informática",
    descripcion: "Antivirus, firewall, phishing y correos sospechosos.",
  },
  {
    id: "inc-office365",
    icon: "ti-brand-office",
    label: "Office 365",
    descripcion: "Excel, Word y PowerPoint.",
  },
  {
    id: "inc-cctv",
    icon: "ti-camera",
    label: "CCTV y control de acceso",
    descripcion: "Grabaciones, cámaras y reconocimiento facial.",
  },
  {
    id: "inc-erp",
    icon: "ti-chart-bar",
    label: "ERP Multivisión",
    descripcion: "Reportes erróneos, módulos con error, sistema lento.",
  },
];

export const TABS = [
  { key: "progreso", label: "Reporte de Incidencias", count: 5 },
  { key: "aprobacion", label: "Solicitudes de Hardware", count: 3 },
  { key: "cerradas", label: "Solcitudes de Desarrollo de Software", count: 8 },
];

export const SOLICITUDES = {
  progreso: [
    {
      badge: "SH",
      folio: "SH-000921",
      titulo: "Solicitud de laptop",
      estado: "En aprobación",
      estadoColor: "#F59E0B",
      responsable: "Jefe inmediato",
      fechaLabel: "Actualizado",
      fecha: "Ayer, 02:30 PM",
    },
    {
      badge: "DEV",
      folio: "DEV-000033",
      titulo: "Desarrollo de módulo de reportes",
      estado: "En desarrollo",
      estadoColor: "#4cc9a6",
      responsable: "Equipo de desarrollo",
      fechaLabel: "Actualizado",
      fecha: "15 may, 11:20 AM",
    },
  ],
  aprobacion: [
    {
      badge: "ACC",
      folio: "ACC-000045",
      titulo: "Acceso a sistema SAP",
      estado: "En aprobación",
      estadoColor: "#F59E0B",
      responsable: "Jefe inmediato",
      fechaLabel: "Actualizado",
      fecha: "Ayer, 08:30 AM",
    },
    {
      badge: "SH",
      folio: "SH-000918",
      titulo: "Silla ergonómica",
      estado: "En aprobación",
      estadoColor: "#F59E0B",
      responsable: "RRHH",
      fechaLabel: "Actualizado",
      fecha: "22 jul, 03:00 PM",
    },
  ],
  cerradas: [
    {
      badge: "INC",
      folio: "INC-000230",
      titulo: "Impresora sin conexión",
      estado: "Resuelto",
      estadoColor: "#4cc9a6",
      responsable: "Sistemas",
      fechaLabel: "Cerrado",
      fecha: "20 jul, 11:00 AM",
    },
    {
      badge: "ACC",
      folio: "ACC-000041",
      titulo: "Acceso a Teams",
      estado: "Resuelto",
      estadoColor: "#4cc9a6",
      responsable: "Sistemas",
      fechaLabel: "Cerrado",
      fecha: "18 jul, 04:15 PM",
    },
  ],
};

export const BADGE_COLORS = {
  INC: { bg: "rgba(124,140,248,0.12)", color: "#7c8cf8", border: "#7c8cf8" },
  SH: { bg: "rgba(76,201,166,0.12)", color: "#4cc9a6", border: "#4cc9a6" },
  DEV: { bg: "rgba(167,139,250,0.12)", color: "#a78bfa", border: "#a78bfa" },
  ACC: { bg: "rgba(245,158,11,0.12)", color: "#F59E0B", border: "#F59E0B" },
};

export const POPULARES = [
  { label: "Office 365", color: "#D83B01" },
  { label: "Teams", color: "#6264A7" },
  { label: "Internet", color: "#4285F4" },
  { label: "Telefonía", color: "#00897B" },
  { label: "Multivisión", color: "#E50914" },
  { label: "Impresoras", color: "#0096D6" },
  { label: "Correo", color: "#0078D4" },
  { label: "Seguridad", color: "#00A651" },
  { label: "Aplicaciones", color: "#7c8cf8" },
];

export const ANUNCIOS = [
  {
    tipo: "Mantenimiento programado",
    tipoColor: "#7c8cf8",
    tipoBg: "rgba(124,140,248,0.12)",
    tipoIcon: "ti-tool",
    titulo: "Actualización de servidores",
    desc: "18 de mayo, 10:00 PM – 2:00 AM",
  },
  {
    tipo: "Nuevo servicio",
    tipoColor: "#F59E0B",
    tipoBg: "rgba(245,158,11,0.12)",
    tipoIcon: "ti-sparkles",
    titulo: "Nuevo portal de solicitudes",
    desc: "Conoce las nuevas funcionalidades",
  },
];

/* SOLICITUD PAGE */
/*export const SERVICIOS_GRID = [
  {
    id: "hardware",
    icon: "ti-device-laptop",
    label: "Hardware y periféricos",
    descripcion: "Solicitud de nuevos equipos, accesorios y periféricos.",
    color: "#10b981",
    colorBg: "rgba(16,185,129,0.12)",
    badge: "Popular",
    action: "navigate",
    route: "/mesa-de-servicio/hardware",
  },
  {
    id: "software",
    icon: "ti-layout-grid-add",
    label: "Software y aplicaciones",
    descripcion:
      "Instalación, actualización, configuración o desinstalación de software autorizado por la empresa.",
    color: "#7c3aed",
    colorBg: "rgba(124,58,237,0.12)",
    action: "slug",
  },
  {
    id: "accesos",
    icon: "ti-lock",
    label: "Accesos y cuentas de usuario",
    descripcion:
      "Altas, bajas y modificaciones de usuario en correo electrónico.",
    color: "#f97316",
    colorBg: "rgba(249,115,22,0.12)",
    action: "slug",
  },
  {
    id: "consultas",
    icon: "ti-message-circle",
    label: "Servicios generales TI",
    descripcion:
      "Asesoría o servicios relacionados con el uso de las herramientas tecnológicas de la empresa.",
    color: "#0d9488",
    colorBg: "rgba(13,148,136,0.12)",
    action: "slug",
  },
  {
    id: "desarrollo",
    icon: "ti-code",
    label: "Desarrollo de software",
    descripcion: "Solicita desarrollo, mejoras o mantenimiento de sistemas.",
    color: "#f59e0b",
    colorBg: "rgba(245,158,11,0.12)",
    badge: "Nuevo",
    action: "slug",
  },
  {
    id: "seguridad",
    icon: "ti-shield-lock",
    label: "Seguridad informática",
    descripcion:
      "Desbloqueo o autorización de sitios web, revisión de archivos bloqueados por el antivirus o permisos de navegación.",
    color: "#ef4444",
    colorBg: "rgba(239,68,68,0.12)",
    action: "slug",
  },
];*/

export const SERVICIOS_GRID = [
  {
    nombre: "Hardware y periféricos",
    desc: "Solicitud de nuevos equipos, accesorios y periféricos.",
    icon: "ti-device-laptop",
    color: "#10b981",
    colorBg: "rgba(16,185,129,0.12)",
    to: "/mesa-de-servicio/hardware",
  },
  {
    nombre: "Software y aplicaciones",
    desc: "Instalación, actualización, configuración o desinstalación de software autorizado.",
    icon: "ti-layout-grid-add",
    color: "#7c3aed",
    colorBg: "rgba(124,58,237,0.12)",
    to: "/mesa-de-servicio/solicitud/software",
  },
  {
    nombre: "Accesos y cuentas de usuario",
    desc: "Altas, bajas y modificaciones de usuario en correo electrónico.",
    icon: "ti-lock",
    color: "#f97316",
    colorBg: "rgba(249,115,22,0.12)",
    to: "/mesa-de-servicio/solicitud/accesos",
  },
  {
    nombre: "Servicios generales TI",
    desc: "Asesoría o servicios relacionados con el uso de las herramientas tecnológicas.",
    icon: "ti-message-circle",
    color: "#0d9488",
    colorBg: "rgba(13,148,136,0.12)",
    to: "/mesa-de-servicio/solicitud/consultas",
  },
  {
    nombre: "Desarrollo de software",
    desc: "Solicita desarrollo, mejoras o mantenimiento de sistemas.",
    icon: "ti-code",
    color: "#f59e0b",
    colorBg: "rgba(245,158,11,0.12)",
    to: "/mesa-de-servicio/desarrollo/nueva",
  },
  {
    nombre: "Autorizaciones de Seguridad",
    desc: "Desbloqueo de sitios, revisión de archivos bloqueados o permisos de navegación.",
    icon: "ti-shield-lock",
    color: "#ef4444",
    colorBg: "rgba(239,68,68,0.12)",
    to: "/mesa-de-servicio/solicitud/seguridad",
  },
];

export const QUICK_SISTEMAS = [
  {
    label: "Mesa de Servicio TI",
    desc: "Gestionar tickets, hardware y software",
    icon: "ti-headset",
    color: "#7c3aed",
    colorBg: "rgba(124,58,237,0.12)",
    type: "route",
    route: "/mesa-de-servicio/admin",
  },

  {
    label: "Solicitudes de desarrollo",
    desc: "Revisar peticiones de software",
    icon: "ti-code",
    color: "#f97316",
    colorBg: "rgba(249,115,22,0.12)",
    type: "route",
    route: "/mesa-de-servicio/hardware/solicitudesDesarrollo",
  },
  {
    label: "Mis solicitudes",
    desc: "Ver el estado de mis solicitudes",
    icon: "ti-clipboard-list",
    color: "#7c8cf8",
    colorBg: "rgba(124,140,248,0.12)",
    type: "link",
    to: "/mesa-de-servicio/mis-solicitudes",
  },
];

export const QUICK_USUARIO = [
  {
    label: "Mis solicitudes",
    desc: "Ver el estado de mis solicitudes",
    icon: "ti-clipboard-list",
    color: "#7c8cf8",
    colorBg: "rgba(124,140,248,0.12)",
    type: "link",
    to: "/mesa-de-servicio/mis-solicitudes",
  },
];
