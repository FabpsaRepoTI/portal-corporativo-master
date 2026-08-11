import { Route } from "react-router-dom";

// Acceso rápido — abre directo al aplicativo
export const QUICK_APPS = [
  {
    name: "PGI",
    desc: "Gestión Integral",
    icon: "ti-chart-bar",
    color: "#c4a058",
    bg: "rgba(196,160,88,0.12)",
    url: "http://192.168.16.198:3550/PGI_Corporativo/app_Login/",
  },
  {
    name: "SISAP",
    desc: "Control de Acceso",
    icon: "ti-clipboard-list",
    color: "#c4a058",
    bg: "rgba(196,160,88,0.12)",
    url: "http://192.168.16.198:3550/sisap",
  },
  {
    name: "FABPSYS",
    desc: "Sistema Principal",
    icon: "ti-server",
    color: "#c4a058",
    bg: "rgba(196,160,88,0.12)",
    url: "http://192.168.16.198:3550/fabpsys/app_Login/",
  },
  {
    name: "CIDE",
    desc: "Certificaciones",
    icon: "ti-certificate",
    color: "#c4a058",
    bg: "rgba(196,160,88,0.12)",
    url: "http://10.0.0.3:8080/cidetech/Login",
  },
  {
    name: "Control de Calidad",
    desc: "Laboratorio",
    icon: "ti-microscope",
    color: "#c4a058",
    bg: "rgba(196,160,88,0.12)",
    url: "http://10.0.0.3:8080/calidad/Auth",
  },
  {
    name: "Solicitudes de Crédito",
    desc: "Financiero",
    icon: "ti-credit-card",
    color: "#c4a058",
    bg: "rgba(196,160,88,0.12)",
    url: "http://10.0.0.3:8080/creditodev",
  },
];

export const APPS = [
  {
    id: 1,
    name: "Prerrequisitos",
    icon: "fa-solid fa-list-check",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.12)",
    url: "http://10.0.0.3:8080/cide/Auth",
    support: "Abraham Moreno",
    sLink: "sip:abraham.moreno@fabpsa.com.mx",
    alt: null,
  },
  {
    id: 2,
    name: "Plataforma de Gestión",
    icon: "fa-solid fa-clipboard-list",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.12)",
    url: "http://192.168.16.198:3550/PGI_Corporativo/app_Login/",
    support: "Juan Ramírez",
    sLink: "sip:manuel.ramirez@fabpsa.com.mx",
    alt: "http://201.151.218.138:3550/PGI_Corporativo/app_Login/",
  },
  {
    id: 3,
    name: "CIDE",
    icon: "fa-solid fa-chart-simple",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.12)",
    url: "http://10.0.0.3:8080/cidetech/Login",
    support: "Abraham Moreno",
    sLink: "sip:abraham.moreno@fabpsa.com.mx",
    alt: null,
  },
  {
    id: 4,
    name: "Pedidos",
    icon: "fa-solid fa-cart-shopping",
    color: "#34d399",
    bg: "rgba(52,211,153,0.12)",
    url: "http://192.168.16.198:3550/sucursales.php",
    support: "Alberto Manzo",
    sLink: "sip:alberto.manzo@fabpsa.com.mx",
    alt: "http://201.151.218.138:3550/sucursales.php",
  },
  {
    id: 5,
    name: "BSC",
    icon: "fa-solid fa-chart-pie",
    color: "#fbbf24",
    bg: "rgba(251,191,36,0.12)",
    url: "http://10.0.0.3:8080/Bsc/",
    support: "Abraham Moreno",
    sLink: "sip:abraham.moreno@fabpsa.com.mx",
    alt: null,
  },
  {
    id: 6,
    name: "Food Fraud",
    icon: "fa-solid fa-wheat-awn-circle-exclamation",
    color: "#f87171",
    bg: "rgba(248,113,113,0.12)",
    url: "http://10.0.0.3:81/",
    support: "Alberto Manzo",
    sLink: "sip:alberto.manzo@fabpsa.com.mx",
    alt: null,
  },
  {
    id: 7,
    name: "Food Defense",
    icon: "fa-solid fa-shield-halved",
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.12)",
    url: "http://201.151.218.138/fooddefense",
    support: "Alberto Manzo",
    sLink: "sip:alberto.manzo@fabpsa.com.mx",
    alt: null,
  },
  {
    id: 8,
    name: "SGRHEP",
    icon: "fa-solid fa-users-gear",
    color: "#38bdf8",
    bg: "rgba(56,189,248,0.12)",
    url: "http://192.168.16.198:3550/fabp/Auth",
    support: "Abraham Moreno",
    sLink: "sip:abraham.moreno@fabpsa.com.mx",
    alt: "http://201.151.218.138:3550/fabp/Auth",
  },
  {
    id: 9,
    name: "Control de Calidad",
    icon: "fa-solid fa-clipboard-check",
    color: "#2dd4bf",
    bg: "rgba(45,212,191,0.12)",
    url: "http://10.0.0.3:8080/calidad/Auth",
    support: "Abraham Moreno",
    sLink: "sip:abraham.moreno@fabpsa.com.mx",
    alt: null,
  },
  {
    id: 10,
    name: "FABPSYS",
    icon: "fa-solid fa-users",
    color: "#cbd5e1",
    bg: "rgba(203,213,225,0.12)",
    url: "http://192.168.16.198:3550/fabpsys/app_Login/",
    support: "Alberto Manzo",
    sLink: "sip:alberto.manzo@fabpsa.com.mx",
    alt: "http://201.151.218.138:3550/fabpsys/app_Login/",
  },
  {
    id: 11,
    name: "IISI",
    icon: "fa-solid fa-code-branch",
    color: "#60a5fa",
    bg: "rgba(96,165,250,0.12)",
    url: "https://faaplicaciones.azurewebsites.net/Default.aspx",
    support: "Abraham Moreno",
    sLink: "sip:abraham.moreno@fabpsa.com.mx",
    alt: null,
  },
  {
    id: 12,
    name: "Solicitudes de Crédito",
    icon: "fa-solid fa-file-invoice-dollar",
    color: "#34d399",
    bg: "rgba(52,211,153,0.12)",
    url: "http://10.0.0.3:8080/creditodev",
    support: "Abraham Moreno",
    sLink: "sip:abraham.moreno@fabpsa.com.mx",
    alt: null,
  },
  {
    id: 13,
    name: "SISAP",
    icon: "fa-solid fa-flask-vial",
    color: "#60a5fa",
    bg: "rgba(96,165,250,0.12)",
    url: "http://192.168.16.198:3550/sisap",
    support: "Damian Rodríguez",
    sLink: "sip:damian.rodriguez@fabpsa.com.mx",
    alt: "http://201.151.218.138:3550/sisap/app_Login/",
  },
];

/***************** BOLETIN ********************/

export const TICKER_ITEMS = [
  "Burnout laboral: el 52% de trabajadores mexicanos reporta síntomas en 2026 — IMSS",
  "NOM-035: solo el 32% de empresas medianas tiene evaluación de riesgo psicosocial actualizada",
  "Pausas activas de 5 min cada hora aumentan la productividad un 13% — MIT Sloan",
  "El 68% de empresas medianas aún no cumple todos los requisitos NOM-035 — IMSS 2026",
  "Agotamiento laboral reconocido por la OMS como condición médica desde 2019",
  "Empresas que capacitan antes de implementar IA reportan 2.3× mayor adopción exitosa",
];

export const ARTICULOS = [
  {
    tag: "NOM-035 · Factor VI",
    tagColor: "mint",
    titulo: "Qué es la NOM-035 y por qué te afecta directamente",
    cuerpo:
      "La Norma Oficial Mexicana NOM-035-STPS-2018 obliga a todas las empresas a identificar, analizar y prevenir los factores de riesgo psicosocial en el trabajo. No es opcional — es ley. Y no es un trámite administrativo: es una herramienta real para que puedas reportar situaciones de carga excesiva, conflictos o ambiente hostil de forma confidencial.",
    insight:
      "💡 Tienes derecho a reportar condiciones laborales que afecten tu bienestar. El área de RH tiene protocolos confidenciales para recibirte.",
  },
  {
    tag: "Factores de riesgo",
    tagColor: "violet",
    titulo: "Los 6 factores que la NOM-035 te pide identificar en tu trabajo",
    cuerpo:
      "La norma define seis dominios de riesgo: condiciones del ambiente de trabajo, carga y ritmo de trabajo, jornada laboral, interferencia trabajo-familia, liderazgo y relaciones en el trabajo, y violencia laboral. Conocerlos te permite nombrar lo que sientes — y nombrar es el primer paso para actuar.",
    insight:
      "💡 El 74% de los factores de riesgo psicosocial en manufactura son prevenibles con cambios organizacionales — no requieren inversión económica.",
  },
  {
    tag: "Bienestar real",
    tagColor: "amber",
    titulo: "Burnout: cómo saber si lo tienes y qué puedes hacer hoy",
    cuerpo:
      "El burnout tiene tres señales clave: agotamiento persistente que no mejora con descanso, cinismo o desapego hacia el trabajo, y sensación de ineficacia aunque hagas esfuerzo. Si reconoces las tres, no es debilidad — es una condición médica reconocida por la OMS desde 2019 que requiere atención.",
    insight:
      "💡 El primer paso es reconocerlo. El segundo es hablarlo — con tu líder, con RH, o con alguien de confianza. No tienes que cargarlo solo.",
  },
];

export const METRICAS = [
  {
    label: "Burnout en México",
    value: "52%",
    fill: 52,
    color: "rose",
    caption: "Trabajadores con síntomas de agotamiento crónico — IMSS 2026",
  },
  {
    label: "Empresas sin evaluación",
    value: "68%",
    fill: 68,
    color: "amber",
    caption: "Empresas medianas sin evaluación NOM-035 actualizada — IMSS 2026",
  },
  {
    label: "Mejora con pausas",
    value: "+13%",
    fill: 65,
    color: "mint",
    caption:
      "Aumento de productividad con micro-pausas de 5 min cada hora — MIT",
  },
  {
    label: "Factores prevenibles",
    value: "74%",
    fill: 74,
    color: "violet",
    caption:
      "Factores de riesgo psicosocial prevenibles sin inversión económica",
  },
  {
    label: "ROI con capacitación",
    value: "2.3×",
    fill: 77,
    color: "mint",
    caption:
      "Mayor adopción cuando la empresa capacita antes de implementar cambios",
  },
];

export const TRIVIA = [
  {
    pregunta:
      "¿Cuál de estas es una señal de riesgo psicosocial reconocida por la NOM-035?",
    opciones: [
      { texto: "Tener muchas tareas un día específico", correcto: false },
      {
        texto: "Jornadas excesivas de forma sistemática y continua",
        correcto: true,
      },
      {
        texto: "No llevarse bien con un compañero en particular",
        correcto: false,
      },
    ],
    feedback:
      "La NOM-035 distingue entre situaciones puntuales y condiciones sistemáticas. Las jornadas excesivas de forma continua son un factor de riesgo psicosocial que la norma obliga a identificar y atender.",
  },
  {
    pregunta: "¿Cuántas empresas están obligadas a cumplir la NOM-035-STPS?",
    opciones: [
      { texto: "Solo empresas con más de 500 empleados", correcto: false },
      { texto: "Todas las empresas en México, sin excepción", correcto: true },
      { texto: "Solo empresas del sector industrial", correcto: false },
    ],
    feedback:
      "La NOM-035 aplica a todos los centros de trabajo en México, independientemente del tamaño o sector. El nivel de aplicación varía según el número de trabajadores, pero ninguna empresa está exenta.",
  },
  {
    pregunta:
      "Si identificas una condición de riesgo psicosocial en tu trabajo, ¿qué debes hacer?",
    opciones: [
      { texto: "Aguantarlo — es parte del trabajo", correcto: false },
      {
        texto:
          "Reportarlo al área de RH — la norma protege tu confidencialidad",
        correcto: true,
      },
      {
        texto: "Esperar a que la empresa haga su evaluación anual",
        correcto: false,
      },
    ],
    feedback:
      "La NOM-035 establece mecanismos de reporte confidencial. No tienes que esperar: puedes reportar en cualquier momento al área de RH. La norma prohíbe represalias contra quien reporta.",
  },
];

export const ESTADOS_DATA = {
  verde: {
    color: "var(--success)",
    titulo: "Estás en verde — mantén ese ritmo",
    cuerpo:
      "Llegaste con energía y motivación. Eso se nota en la calidad del trabajo y en el ambiente del equipo. Aprovecha este estado para las tareas que requieren más concentración.",
    tips: [
      "Comparte tu energía positiva — el buen estado de ánimo es contagioso.",
      "Usa este momento para avanzar en proyectos importantes o aprender algo nuevo.",
      "Anota cómo llegaste hoy y qué lo hizo posible, para replicarlo.",
    ],
    nom: "NOM-035: El bienestar sostenido es indicador clave del Factor IV — Liderazgo y relaciones en el trabajo.",
  },
  amarillo: {
    color: "var(--warning)",
    titulo: "Estás en amarillo — pon atención a tu energía",
    cuerpo:
      "El cansancio acumulado es la señal más común que el cuerpo envía antes de un desgaste mayor. No es alarma, pero sí es una señal para cuidarte hoy un poco más.",
    tips: [
      "Toma al menos dos pausas activas de 5 minutos: estiramiento o caminata corta.",
      "Hidratación: el cansancio leve muchas veces es deshidratación moderada.",
      "Al terminar la jornada, separa 10 minutos para cerrar pendientes mentalmente.",
    ],
    nom: "NOM-035: El cansancio acumulado puede ser síntoma de jornadas extensas. Si es frecuente, identifica si existe riesgo psicosocial en tu entorno.",
  },
  naranja: {
    color: "#E8833A",
    titulo: "Estás en naranja — gestiona la presión antes de que crezca",
    cuerpo:
      "La presión moderada puede ser útil a corto plazo, pero gestionada mal se convierte en estrés crónico. Hoy es un buen día para ordenar prioridades.",
    tips: [
      "Haz una lista de los 3 pendientes MÁS importantes y enfócate solo en ellos hoy.",
      "Practica la técnica 4-7-8 (inhala 4s, retén 7s, exhala 8s) antes de tareas difíciles.",
      "Si algo te genera presión externamente, habla con tu líder directo.",
    ],
    nom: "NOM-035 Factor VI: Las cargas excesivas son factores de riesgo psicosocial reconocidos. Si es frecuente, repórtalo al área de RH.",
  },
  rojo: {
    color: "var(--danger)",
    titulo: "Estás en rojo — hoy priorizamos tu bienestar",
    cuerpo:
      "El agotamiento sostenido afecta la salud, la concentración y las relaciones laborales. Reconocerlo no es debilidad — es la base para actuar.",
    tips: [
      "Habla hoy mismo con alguien de confianza: tu líder, un compañero o RH.",
      "Reduce al mínimo las decisiones importantes hoy — el cerebro agotado decide peor.",
      "Esta noche: sin pantallas 1 hora antes de dormir. El sueño es la herramienta de recuperación más poderosa.",
    ],
    nom: "NOM-035: El agotamiento severo puede ser un factor de riesgo psicosocial. La norma obliga a la empresa a identificar y atender estas situaciones.",
  },
  azul: {
    color: "var(--secondary)",
    titulo: "Estás en azul — reconecta con tu propósito hoy",
    cuerpo:
      "Sentirse distante o poco motivado es más común de lo que parece. No siempre hay una causa obvia — y no siempre la necesitas para actuar.",
    tips: [
      "Haz una tarea pequeña y concreta: completar algo reactiva el sistema de recompensa.",
      "Busca un momento de conexión social genuina: un café, una plática breve con un compañero.",
      "Si esta sensación lleva varios días, considera hablar con alguien.",
    ],
    nom: "NOM-035 Factor V: El desapego y la falta de sentido son indicadores de riesgo psicosocial. La norma protege tu derecho a un ambiente que favorezca el bienestar emocional.",
  },
};

export const SABIAS = [
  {
    icon: "🧬",
    titulo: "El agotamiento cambia físicamente la estructura del cerebro",
    cuerpo:
      "Estudios de neuroimagen muestran que el estrés crónico reduce el volumen de la corteza prefrontal — la región responsable de la toma de decisiones y el control emocional. El descanso no es un lujo: es mantenimiento neurológico.",
  },
  {
    icon: "😴",
    titulo: "Dormir menos de 7 horas equivale cognitivamente a no dormir",
    cuerpo:
      "Un estudio de la Universidad de Pennsylvania demostró que perder 1.5 horas de sueño por noche durante una semana reduce el rendimiento cognitivo al nivel de llevar 24 horas sin dormir. Y los sujetos no se sentían tan deteriorados como en realidad estaban.",
  },
  {
    icon: "🌿",
    titulo:
      "El ejercicio de 20 minutos tiene el mismo efecto que un antidepresivo leve",
    cuerpo:
      "Un meta-análisis con 14,000 participantes confirmó que 20 minutos de actividad física moderada tienen efecto equivalente a antidepresivos de primera generación para estados de ánimo bajos. No requiere gimnasio: una caminata sirve.",
  },
  {
    icon: "🍅",
    titulo: "La técnica Pomodoro aumenta la concentración hasta un 40%",
    cuerpo:
      "25 minutos de trabajo sin interrupciones seguidos de 5 minutos de pausa. Después de 4 ciclos, descanso de 20 minutos. El cerebro mantiene foco sostenido mejor en sprints que en maratones. Francesco Cirillo la desarrolló en 1980 con un temporizador de cocina.",
  },
];
