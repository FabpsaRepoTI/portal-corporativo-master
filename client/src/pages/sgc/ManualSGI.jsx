// pages/sgc/ManualSGI.jsx
// Centro de ayuda del SGC: ayuda orientada a tareas, específica de esta aplicación.
// - Buscador local (sin IA): títulos, sinónimos, pasos y preguntas frecuentes.
// - Contextual: el botón de ayuda (?) abre /sgc/manual?s=<módulo> con la ayuda
//   del módulo desde el que se abrió.
// El contenido describe el funcionamiento real (formularios, validaciones,
// estados y permisos). Si cambia una regla, actualiza aquí el texto. Lo que no
// está confirmado en el sistema se marca como «pendiente de validación».
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Encabezado, useMigas } from "./components/ui";

const PENDIENTE = "pendiente de validación";

// ── Contenido ────────────────────────────────────────────────────────────────
// Cada módulo: para (A), puede (B), tareas (C), campos (D), estados (E),
// relaciones (F), problemas (G) y faqs. Las tareas tienen pasos numerados.
const MODULOS = [
  {
    id: "inicio",
    grupo: "Primeros pasos",
    icono: "ti-compass",
    titulo: "Cómo está organizado el SGC",
    palabras: "inicio empezar navegar menu sidebar pestañas roles permisos perfil tema oscuro claro",
    para: "El SGC reúne en un solo lugar las no conformidades, acciones correctivas, auditorías, indicadores, riesgos, documentos y procesos del sistema de gestión. Lo que ves y lo que puedes hacer depende de tu rol.",
    puede: [
      "Moverte entre módulos con el menú lateral; cada módulo abierto queda como pestaña en la parte superior.",
      "Buscar cualquier registro o acción con Ctrl+K.",
      "Ver tus avisos en la campana de notificaciones y tus tareas en «Mis pendientes».",
      "Abrir esta ayuda desde el botón (?) de la barra superior: se abre en el módulo donde estás.",
    ],
    tareas: [],
    campos: [],
    estados: null,
    tablaRoles: [
      ["Coordinador SGI", "Gestiona todo el sistema: crea, cierra, cancela, reasigna y administra el equipo."],
      ["Auditor SGI", "Programa y ejecuta auditorías, registra hallazgos, reasigna NC y verifica la eficacia de acciones."],
      ["Responsable de área", "Registra NC y acciones, y atiende los registros que tiene a su cargo."],
      ["Dirección", "Consulta: ve tableros, indicadores y el desempeño del SGI. Puede crear indicadores."],
    ],
    relaciones: [],
    problemas: [
      ["No veo un módulo en el menú.", "Algunos módulos dependen del rol (por ejemplo, «Desempeño del SGI» es para Coordinador y Dirección). Pide al Coordinador que revise tu rol en Equipo SGI."],
      ["El SGC se ve en claro aunque el portal está en oscuro.", "El SGC sigue el tema del portal. Cambia el tema en el portal; si no se aplica, recarga la página."],
    ],
    faqs: [
      ["¿Quién me da acceso al SGC?", "El Coordinador SGI, desde Equipo SGI → Agregar miembro."],
      ["¿Por qué la primera entrada tarda unos segundos?", "En la primera entrada de la sesión se muestra la presentación del SGI mientras se verifican tu acceso y se cargan los datos. Las siguientes entradas son inmediatas."],
    ],
  },
  {
    id: "dashboard",
    grupo: "Operación",
    icono: "ti-layout-dashboard",
    titulo: "Centro de control",
    ruta: "/sgc/dashboard",
    palabras: "dashboard tablero inicio diagnostico integral prioridades hallazgos objetivos tendencia mis pendientes resumen",
    para: "Muestra el estado del sistema de gestión en una sola pantalla: el diagnóstico integral, lo que requiere atención primero y tus pendientes.",
    puede: [
      "Leer el diagnóstico integral: una síntesis del estado del SGC con sus cifras.",
      "Revisar los hallazgos y las prioridades sugeridas, ordenadas por criticidad (crítica, alta, media).",
      "Abrir cualquier registro en el panel lateral sin salir del tablero.",
      "Consultar objetivos, procesos y tendencia, y hacer una pregunta sobre los datos.",
      "Atender «Mis pendientes»: lo que tienes asignado y está por vencer o vencido.",
    ],
    tareas: [
      {
        id: "dash-diagnostico",
        titulo: "Actualizar el diagnóstico",
        palabras: "actualizar analisis contexto criterios",
        pasos: [
          ["Entra a Centro de control", "Es la primera opción del menú lateral."],
          ["Revisa «Criterios del análisis»", "Explica qué reglas y datos se toman en cuenta."],
          ["Pulsa «Actualizar análisis de contexto»", "El análisis puede tardar hasta un par de minutos. Mientras tanto se sigue mostrando el último guardado."],
        ],
        notas: [["info", "Las prioridades se calculan con reglas fijas sobre los datos reales. El análisis con IA solo redacta la síntesis y recomendaciones; cada afirmación se respalda con registros del sistema."]],
      },
    ],
    campos: [],
    estados: null,
    relaciones: [
      ["nc", "Las NC vencidas o reincidentes aparecen como hallazgos."],
      ["ac", "Las acciones atrasadas suben en prioridad."],
      ["indicadores", "Los indicadores en rojo alimentan el diagnóstico y los objetivos."],
      ["riesgos", "Los riesgos altos sin tratamiento aparecen como prioridad."],
    ],
    problemas: [
      ["El diagnóstico no cambia después de registrar algo.", "El análisis se guarda y no se recalcula solo. Pulsa «Actualizar análisis de contexto»."],
      ["«Mis pendientes» está vacío.", "Solo muestra registros asignados a ti que siguen abiertos."],
    ],
    faqs: [
      ["¿La IA puede modificar registros?", "No. El diagnóstico solo lee datos; no crea ni cambia nada."],
    ],
  },
  {
    id: "notificaciones",
    grupo: "Operación",
    icono: "ti-bell",
    titulo: "Notificaciones y Mis pendientes",
    palabras: "avisos campana alertas vencimiento recordatorio pendientes tareas asignadas",
    para: "Te avisan cuando se te asigna un registro, cuando algo cambia de estado o cuando una fecha compromiso está por vencer o ya venció.",
    puede: [
      "Abrir la campana de la barra superior para ver tus avisos recientes.",
      "Ir directo al registro desde el aviso con su botón de acción.",
      "Ver en «Mis pendientes» (Centro de control) lo que tienes a cargo, ordenado por urgencia.",
    ],
    tareas: [],
    campos: [],
    estados: null,
    relaciones: [["dashboard", "«Mis pendientes» está dentro del Centro de control."]],
    problemas: [
      ["No me llegan avisos de vencimiento.", "La revisión de vencimientos se hace periódicamente (cada pocos minutos), no al instante."],
      ["En modo demostración no veo la campana.", "En la demostración las notificaciones están ocultas a propósito."],
    ],
    faqs: [],
  },
  {
    id: "nc",
    grupo: "Operación",
    icono: "ti-alert-circle",
    titulo: "No conformidades (NC)",
    ruta: "/sgc/no-conformidades",
    palabras: "nc no conformidad incumplimiento desviacion queja reclamo hallazgo problema levantar registrar reportar",
    para: "Registra y da seguimiento a cualquier incumplimiento detectado (en auditoría, en proceso, por queja de cliente, etc.) hasta su cierre.",
    puede: [
      "Registrar una NC nueva (Coordinador y Responsable de área).",
      "Avanzarla por sus estados hasta el cierre, o regresarla con motivo.",
      "Reasignar el responsable (Coordinador o Auditor).",
      "Vincularla a un proceso, adjuntar evidencias y crear acciones correctivas desde ella.",
      "Filtrar la lista y exportarla a CSV.",
    ],
    tareas: [
      {
        id: "nc-registrar",
        titulo: "Registrar una no conformidad",
        palabras: "nueva nc crear levantar alta reportar",
        pasos: [
          ["Abre el formulario", "No conformidades → «Nueva NC», o Ctrl+K → «Nueva NC»."],
          ["Indica origen y clasificación", "Clasificación: Mayor, Menor u Observación. Ambos son obligatorios."],
          ["Describe la NC", "Descripción corta (obligatoria, máx. 300 caracteres) y, si hace falta, la descripción detallada y la afectación."],
          ["Asigna responsable y fecha compromiso", "Ambos obligatorios. La fecha compromiso no puede ser anterior a la fecha de detección."],
          ["Completa lo opcional", "Proceso, sitio, departamento y herramientas de análisis."],
          ["Guarda", "La NC recibe un folio (NC-AAAA-NNN), queda en «Abierta» y el responsable recibe un aviso."],
        ],
        notas: [
          ["tip", "Después de guardar la encuentras en la lista de No conformidades por su folio, o con Ctrl+K escribiendo el folio."],
          ["info", "Fab-i puede redactar un borrador de NC a partir de tu descripción; tú lo revisas y nada se guarda sin tu confirmación."],
        ],
      },
      {
        id: "nc-avanzar",
        titulo: "Avanzar, regresar o cerrar una NC",
        palabras: "cambiar estatus estado avanzar cerrar regresar verificacion",
        pasos: [
          ["Abre la NC", "Desde la lista o con Ctrl+K."],
          ["Usa el panel de estatus", "La acción principal es «Avanzar a «siguiente estado»». También verás «Regresar», «Reasignar» y «Cancelar» si tu rol lo permite."],
          ["Escribe el motivo cuando se pida", "Es obligatorio al regresar, cerrar o cancelar."],
          ["Confirma", "Cerrar y cancelar piden confirmación y son definitivos."],
        ],
        notas: [["aviso", "Solo el Coordinador puede cerrar (desde Verificación) o cancelar una NC. Una NC cerrada o cancelada ya no admite nuevas acciones correctivas."]],
      },
      {
        id: "nc-ac",
        titulo: "Crear una acción correctiva desde la NC",
        palabras: "accion correctiva desde nc plan",
        pasos: [
          ["Abre la NC", "Debe estar abierta (no cerrada ni cancelada)."],
          ["En la sección de acciones pulsa «Nueva»", "El formulario de AC se abre con la NC ya vinculada."],
          ["Completa y guarda la AC", "Ver «Acciones correctivas → Crear una acción correctiva»."],
        ],
      },
    ],
    campos: [
      ["Origen", true, "De dónde surge la NC (auditoría, proceso, cliente, etc.)."],
      ["Clasificación", true, "Mayor, Menor u Observación."],
      ["Afectación", false, "Seguridad alimentaria, Calidad del producto, Legal, Operativa o Cliente."],
      ["Descripción corta", true, "Resumen del incumplimiento, máx. 300 caracteres."],
      ["Descripción detallada", false, "Contexto, evidencia y alcance."],
      ["Responsable", true, "Persona que atiende la NC."],
      ["Fecha de detección", false, "Cuándo se detectó."],
      ["Fecha compromiso", true, "Fecha límite; no puede ser anterior a la detección."],
      ["Proceso / Sitio / Departamento", false, "Ubican la NC en la organización."],
      ["Herramientas de análisis", false, "Métodos usados para el análisis de causa."],
    ],
    estados: {
      flujo: [["Abierta", "warn"], ["En análisis", "info"], ["En ejecución", "brand"], ["Verificación", "orange"], ["Cerrada", "ok"]],
      extra: [["Cancelada", "neutral"]],
      reglas: [
        "Se avanza un estado a la vez; también puede regresarse con motivo.",
        "Cerrar (desde Verificación) y cancelar: solo Coordinador, con motivo y confirmación.",
        "Reasignar una NC abierta: Coordinador o Auditor.",
        "Etiquetas: «Vencida» si pasó la fecha compromiso; «Reincidencia» si se repite.",
      ],
    },
    relaciones: [
      ["ac", "Una NC se atiende con una o varias acciones correctivas."],
      ["auditorias", "Un hallazgo de auditoría tipo NC puede generar la NC automáticamente."],
      ["procesos", "La NC puede vincularse a un proceso del mapa."],
      ["dashboard", "Las NC vencidas aparecen en el diagnóstico y en Mis pendientes."],
    ],
    problemas: [
      ["«Selecciona el origen y la clasificación.»", "Faltan origen o clasificación en el formulario."],
      ["«Escribe la descripción de la no conformidad.»", "La descripción corta está vacía."],
      ["«Asigna un responsable.» / «Captura la fecha compromiso.»", "Ambos campos son obligatorios."],
      ["«La fecha compromiso no puede ser anterior a la detección.»", "Corrige una de las dos fechas."],
      ["«El proceso no existe o fue dado de baja.»", "Elige otro proceso o déjalo vacío; pide al Coordinador revisar el mapa de procesos."],
      ["«El motivo es obligatorio para este cambio.»", "Al regresar, cerrar o cancelar escribe el motivo."],
      ["«Solo el Coordinador o el Auditor SGI pueden reasignar una NC abierta.»", "Pide la reasignación a uno de esos roles."],
    ],
    faqs: [
      ["¿Puedo borrar una NC?", "No se borra: se cancela (solo Coordinador) con motivo, y queda en el historial."],
      ["¿Dónde veo quién cambió la NC?", "En el historial de la NC: cada cambio queda con fecha, usuario y motivo."],
      ["¿Qué archivos puedo adjuntar?", "JPG, PNG, PDF, XLSX o DOCX de hasta 10 MB. Solo quien lo subió o el Coordinador pueden eliminarlo."],
    ],
  },
  {
    id: "ac",
    grupo: "Operación",
    icono: "ti-circle-check",
    titulo: "Acciones correctivas (AC)",
    ruta: "/sgc/acciones-correctivas",
    palabras: "ac accion correctiva mejora plan de accion actividades causa raiz eficacia verificar",
    para: "Elimina la causa de una no conformidad mediante un plan de actividades, y verifica después que la acción fue eficaz. Sin NC vinculada funciona como acción de mejora.",
    puede: [
      "Crear una AC vinculada a una NC o independiente (mejora).",
      "Definir un plan de actividades con responsable y fecha.",
      "Marcar el avance de cada actividad.",
      "Mandar a verificación, verificar eficacia y cerrar según tu rol.",
      "Filtrar y exportar la lista a CSV.",
    ],
    tareas: [
      {
        id: "ac-crear",
        titulo: "Crear una acción correctiva",
        palabras: "nueva ac crear plan",
        pasos: [
          ["Abre el formulario", "Acciones correctivas → «Nueva AC», Ctrl+K → «Nueva AC», o desde una NC con «Nueva»."],
          ["Elige la NC (opcional)", "Si no eliges NC, la acción queda como mejora independiente."],
          ["Escribe título y causa raíz", "El título es obligatorio. Causa raíz, descripción y herramienta de análisis ayudan a justificar la acción."],
          ["Asigna responsable y fecha compromiso", "Ambos obligatorios."],
          ["Agrega las actividades del plan", "Cada actividad necesita actividad, responsable y fecha; la fecha no puede ser posterior a la de la AC."],
          ["Guarda", "La AC queda «Abierta» con su folio."],
        ],
        notas: [["aviso", "Como Responsable de área solo puedes crear acciones para NC a tu cargo, y una acción sin NC debe quedar a tu nombre."]],
      },
      {
        id: "ac-plan",
        titulo: "Dar seguimiento al plan",
        palabras: "actividad avance completar progreso agregar actividad",
        pasos: [
          ["Abre la AC", "Desde la lista o con Ctrl+K."],
          ["Agrega actividades si hace falta", "Botón «Agregar actividad»: Actividad, Responsable, Fecha y Recursos."],
          ["Marca el avance", "Pulsa el estatus de la actividad para pasar de Pendiente → En proceso → Completada."],
          ["Manda a verificación", "Cuando todas las actividades estén completadas, avanza la AC a «Pendiente verificación»."],
        ],
        notas: [["info", "Si faltan actividades verás «Faltan N de M actividades para pasar a verificación». Una vez verificada, el plan ya no admite cambios."]],
      },
      {
        id: "ac-eficacia",
        titulo: "Verificar eficacia y cerrar",
        palabras: "eficaz eficacia verificar cerrar",
        pasos: [
          ["Revisa la evidencia", "Confirma que la causa se eliminó."],
          ["Avanza a «Verificada eficaz»", "Solo Coordinador o Auditor."],
          ["Cierra la AC", "Solo Coordinador, con motivo."],
        ],
      },
    ],
    campos: [
      ["No conformidad", false, "NC que atiende. Vacía = acción de mejora."],
      ["Título", true, "Qué se va a hacer."],
      ["Causa raíz", false, "Por qué ocurrió la NC."],
      ["Descripción / Herramienta de análisis", false, "Detalle y método usado (5 porqués, Ishikawa, etc.)."],
      ["Responsable", true, "Dueño de la acción."],
      ["Fecha compromiso", true, "Fecha límite de la acción completa."],
      ["Actividades del plan", false, "Actividad, Responsable y Fecha (obligatorios por línea) y Recursos."],
    ],
    estados: {
      flujo: [["Abierta", "warn"], ["En ejecución", "brand"], ["Pendiente verificación", "orange"], ["Verificada eficaz", "info"], ["Cerrada", "ok"]],
      extra: [],
      reglas: [
        "Para pasar a «Pendiente verificación» el plan debe estar completo.",
        "«Verificada eficaz»: Coordinador o Auditor. «Cerrada»: solo Coordinador.",
        "Regresar o cerrar requiere motivo.",
        "Actividades: Pendiente → En proceso → Completada.",
        "Etiquetas: «Atrasada N días», «Eficacia verificada».",
      ],
    },
    relaciones: [
      ["nc", "La AC atiende la causa de una NC."],
      ["dashboard", "Las AC atrasadas aparecen como prioridad."],
    ],
    problemas: [
      ["No puedo pasar a verificación.", "Faltan actividades por completar en el plan."],
      ["«La NC … está cerrada/cancelada; no admite nuevas acciones.»", "Elige una NC abierta o crea la acción como mejora."],
      ["«Solo puedes crear acciones para las NCs a tu cargo.»", "Como Responsable de área solo ves y vinculas tus NC."],
      ["«La acción ya fue verificada; el plan no admite cambios.»", "Después de la verificación el plan queda congelado."],
    ],
    faqs: [
      ["¿Cómo se mide la eficacia?", "La verificación la hace el Coordinador o el Auditor revisando la evidencia; el criterio detallado de eficacia está " + PENDIENTE + "."],
      ["¿Dirección puede editar acciones?", "No, Dirección solo consulta."],
    ],
  },
  {
    id: "auditorias",
    grupo: "Operación",
    icono: "ti-clipboard-check",
    titulo: "Auditorías",
    ruta: "/sgc/auditorias",
    palabras: "auditoria programa interna externa certificacion hallazgo observacion oportunidad de mejora auditor plan",
    para: "Programa, ejecuta y documenta auditorías internas, externas y de certificación, con sus hallazgos.",
    puede: [
      "Programar una auditoría (Coordinador y Auditor).",
      "Iniciarla, registrar hallazgos y completarla con conclusiones.",
      "Generar una NC desde un hallazgo.",
      "Adjuntar evidencias y cancelar con motivo.",
    ],
    tareas: [
      {
        id: "aud-programar",
        titulo: "Programar una auditoría",
        palabras: "nueva auditoria programar planear",
        pasos: [
          ["Abre el formulario", "Auditorías → «Programar auditoría», o Ctrl+K."],
          ["Datos generales", "Título, tipo (Interna, Externa o Certificación) y norma aplicable (ISO 9001:2015, ISO 22000:2018, FSSC 22000 v6, ISO 14001:2015, ISO 45001:2018, BRCGS, SQF u otra)."],
          ["Fechas", "Inicio obligatorio; fin opcional, no anterior al inicio."],
          ["Alcance", "Describe qué se audita (obligatorio)."],
          ["Equipo y áreas", "«Agregar auditor»: el primero es el auditor líder; se requiere al menos uno. «Agregar área» para las áreas auditadas."],
          ["Guarda", "Queda «Planeada»."],
        ],
      },
      {
        id: "aud-hallazgo",
        titulo: "Registrar hallazgos y generar NC",
        palabras: "hallazgo registrar generar nc clausula",
        pasos: [
          ["Inicia la auditoría", "Botón «Iniciar auditoría»."],
          ["Pulsa «Registrar hallazgo»", "Descripción, cláusula ISO y tipo: NC, Observación u Oportunidad de mejora."],
          ["Si es NC", "Indica clasificación, responsable y fecha compromiso."],
          ["Genera la NC", "Con «Generar NC» se crea la no conformidad vinculada al hallazgo."],
          ["Completa la auditoría", "«Completar auditoría» exige escribir las conclusiones."],
        ],
        notas: [["aviso", "Para generar la NC de un hallazgo se necesitan responsable y fecha compromiso."]],
      },
    ],
    campos: [
      ["Título", true, "Nombre de la auditoría."],
      ["Tipo", true, "Interna, Externa o Certificación."],
      ["Norma aplicable", false, "Norma de referencia (lista sugerida o texto libre)."],
      ["Inicio / Fin", true, "Inicio obligatorio; fin opcional."],
      ["Alcance", true, "Procesos, sitios o requisitos que cubre."],
      ["Auditores", true, "Al menos uno; el primero es el líder."],
      ["Áreas", false, "Áreas auditadas."],
    ],
    estados: {
      flujo: [["Planeada", "info"], ["En curso", "brand"], ["Completada", "ok"]],
      extra: [["Cancelada", "neutral"]],
      reglas: ["Completar requiere conclusiones.", "Cancelar requiere motivo."],
    },
    relaciones: [
      ["nc", "Los hallazgos tipo NC generan no conformidades."],
      ["documentos", "Las evidencias se adjuntan a la auditoría."],
    ],
    problemas: [
      ["«Asigna al menos un auditor.»", "Agrega un auditor; el primero será el líder."],
      ["«La fecha de fin no puede ser anterior al inicio.»", "Corrige las fechas."],
      ["«Describe el alcance…»", "El alcance es obligatorio."],
    ],
    faqs: [["¿Un Responsable de área puede programar auditorías?", "No, solo Coordinador y Auditor."]],
  },
  {
    id: "indicadores",
    grupo: "Operación",
    icono: "ti-chart-bar",
    titulo: "Indicadores",
    ruta: "/sgc/indicadores",
    palabras: "indicador kpi meta medicion valor semaforo objetivo registrar valor mensual",
    para: "Mide el desempeño de los procesos contra una meta, con semáforo e historial por periodo.",
    puede: [
      "Crear indicadores (Coordinador o Dirección).",
      "Registrar la medición de cada periodo (responsable del indicador o Coordinador).",
      "Ajustar meta, sentido, responsable o desactivar el indicador.",
    ],
    tareas: [
      {
        id: "ind-medicion",
        titulo: "Registrar una medición",
        palabras: "valor medicion registrar periodo capturar",
        pasos: [
          ["Abre el indicador", "Desde la lista de Indicadores."],
          ["Pulsa «Registrar medición»", "Elige el periodo (mes; no se permiten periodos futuros)."],
          ["Captura valor y observaciones", "Las observaciones explican desviaciones."],
          ["Guarda", "El semáforo y la tendencia se actualizan."],
        ],
        notas: [["aviso", "Solo puede haber un valor por periodo. Si te equivocaste, pide al Coordinador la corrección (" + PENDIENTE + ")."]],
      },
      {
        id: "ind-crear",
        titulo: "Crear un indicador",
        palabras: "nuevo indicador crear",
        pasos: [
          ["Pulsa «Nuevo indicador»", "Disponible para Coordinador y Dirección."],
          ["Define el indicador", "Nombre, meta, unidad, frecuencia, sentido (mayor o menor es mejor) y responsable."],
          ["Documenta el cálculo", "Cláusula ISO, fórmula de cálculo y descripción."],
          ["Guarda", "Ya puede recibir mediciones."],
        ],
      },
    ],
    campos: [
      ["Meta", true, "Valor objetivo."],
      ["Sentido", true, "Si es mejor un valor mayor o uno menor."],
      ["Frecuencia / Unidad", true, "Cada cuánto se mide y en qué unidad."],
      ["Responsable", true, "Quien registra las mediciones."],
      ["Fórmula de cálculo", false, "Cómo se obtiene el valor."],
    ],
    estados: {
      flujo: [["Verde", "ok"], ["Amarillo", "warn"], ["Rojo", "danger"]],
      extra: [],
      reglas: [
        "Mayor es mejor: verde si el valor ≥ meta; amarillo si ≥ 80 % de la meta; rojo debajo.",
        "Menor es mejor: verde si el valor ≤ meta; amarillo si ≤ 120 % de la meta; rojo arriba.",
      ],
    },
    relaciones: [["dashboard", "Los indicadores en rojo alimentan el diagnóstico y los objetivos."], ["ejecutivo", "Se resumen en Desempeño del SGI."]],
    problemas: [
      ["«Ya existe un valor registrado para…»", "Ese periodo ya tiene valor."],
      ["«Solo el responsable del indicador o el Coordinador SGI pueden registrar valores.»", "Pide al responsable que capture el valor."],
      ["«El indicador está inactivo.»", "El Coordinador puede reactivarlo con «Ajustar»."],
    ],
    faqs: [],
  },
  {
    id: "riesgos",
    grupo: "Operación",
    icono: "ti-shield-exclamation",
    titulo: "Riesgos",
    ruta: "/sgc/riesgos",
    palabras: "riesgo oportunidad matriz probabilidad impacto nivel tratamiento mitigar aceptar controles",
    para: "Identifica, evalúa y da tratamiento a los riesgos del sistema de gestión con una matriz de probabilidad e impacto.",
    puede: [
      "Registrar riesgos (Coordinador, Auditor y Responsable de área).",
      "Editar evaluación, controles y plan de tratamiento.",
      "Cambiar el estado a Mitigado o Aceptado.",
      "Exportar la lista a CSV.",
    ],
    tareas: [
      {
        id: "riesgo-registrar",
        titulo: "Registrar un riesgo",
        palabras: "nuevo riesgo registrar evaluar",
        pasos: [
          ["Pulsa «Registrar»", "En Riesgos, o Ctrl+K → «Nuevo riesgo»."],
          ["Describe el riesgo", "Nombre, descripción y categoría."],
          ["Evalúa", "Probabilidad e impacto de 1 a 5; el nivel se calcula solo. Opcional: impacto económico."],
          ["Asigna y planea", "Responsable, próxima revisión, cláusula ISO, controles existentes y plan de tratamiento."],
          ["Guarda", "Queda «Activo». La nota para el historial explica el cambio."],
        ],
      },
    ],
    campos: [
      ["Probabilidad / Impacto", true, "Escala 1–5; su combinación da el nivel de riesgo."],
      ["Controles existentes", false, "Lo que ya se hace para reducir el riesgo."],
      ["Plan de tratamiento", false, "Lo que se hará para reducirlo."],
      ["Próxima revisión", false, "Cuándo se vuelve a evaluar."],
    ],
    estados: {
      flujo: [["Activo", "danger"], ["Mitigado", "ok"]],
      extra: [["Aceptado", "neutral"]],
      reglas: ["Aceptar un riesgo exige justificación.", "Solo el Coordinador o el responsable del riesgo pueden actualizarlo."],
    },
    relaciones: [["dashboard", "Los riesgos altos sin tratamiento aparecen como prioridad."], ["procesos", "Relación con procesos: " + PENDIENTE + "."]],
    problemas: [
      ["«Justifica por qué se acepta el riesgo.»", "Escribe la justificación al pasar a Aceptado."],
      ["«Solo el Coordinador o el responsable pueden actualizar este riesgo.»", "Pide el cambio al responsable."],
    ],
    faqs: [],
  },
  {
    id: "ejecutivo",
    grupo: "Gestión",
    icono: "ti-presentation-analytics",
    titulo: "Desempeño del SGI",
    ruta: "/sgc/ejecutivo",
    palabras: "ejecutivo direccion revision por la direccion desempeño resumen reporte",
    para: "Vista ejecutiva para Coordinador y Dirección con el resumen del desempeño del sistema de gestión.",
    puede: ["Consultar el resumen de NC, acciones, auditorías, indicadores y riesgos.", "Detalle de secciones y exportación: " + PENDIENTE + "."],
    tareas: [],
    campos: [],
    estados: null,
    relaciones: [["indicadores", "Usa las mediciones de indicadores."], ["dashboard", "Comparte datos con el Centro de control."]],
    problemas: [["No veo el módulo.", "Solo está disponible para Coordinador y Dirección."]],
    faqs: [],
  },
  {
    id: "documentos",
    grupo: "Gestión",
    icono: "ti-files",
    titulo: "Gestión documental",
    ruta: "/sgc/documentos",
    palabras: "documento procedimiento manual formato instructivo version vigencia vencimiento control documental archivo",
    para: "Consulta y controla los documentos del sistema de gestión (procedimientos, manuales, formatos) con su versión y vigencia.",
    puede: [
      "Buscar por título o código y filtrar.",
      "Ver la información del documento en el panel lateral.",
      "Registrar una nueva versión con descripción de cambios.",
    ],
    tareas: [
      {
        id: "doc-version",
        titulo: "Registrar una nueva versión",
        palabras: "version actualizar documento cambios",
        pasos: [
          ["Busca el documento", "Por título o código."],
          ["Abre la opción de nueva versión", "Ubicación exacta del botón: " + PENDIENTE + "."],
          ["Captura la versión", "Nueva versión (obligatoria, ej. 2.0) y descripción de cambios."],
          ["Guarda", "La versión anterior queda en el historial (" + PENDIENTE + ")."],
        ],
      },
    ],
    campos: [
      ["Tipo", true, "Clase de documento (procedimiento, manual, formato…)."],
      ["Fecha vencimiento", false, "Cuándo debe revisarse."],
      ["Nueva versión", true, "Número de la versión."],
      ["Descripción de cambios", false, "Qué cambió."],
    ],
    estados: null,
    relaciones: [["procesos", "Vinculación con procesos: " + PENDIENTE + "."]],
    problemas: [["El documento no abre.", "Los archivos se sirven a través del portal; si falla, reintenta o avisa al Coordinador."]],
    faqs: [["¿Quién puede subir documentos?", PENDIENTE.charAt(0).toUpperCase() + PENDIENTE.slice(1) + "."]],
  },
  {
    id: "procesos",
    grupo: "Gestión",
    icono: "ti-hierarchy-3",
    titulo: "Mapa de procesos",
    ruta: "/sgc/procesos",
    palabras: "proceso mapa interaccion estrategico operativo apoyo conexion diagrama",
    para: "Representa los procesos de la organización y cómo se relacionan entre sí.",
    puede: [
      "Ver el mapa y abrirlo en pantalla completa.",
      "Agregar o editar procesos (nombre, tipo, responsable, cláusula y descripción).",
      "Crear conexiones entre procesos: Alimenta, Controla o Apoya.",
      "Imprimir el mapa.",
    ],
    tareas: [
      {
        id: "proc-conexion",
        titulo: "Conectar dos procesos",
        palabras: "conexion relacion alimenta controla apoya",
        pasos: [
          ["Abre «Conexión»", "Desde el mapa de procesos."],
          ["Elige origen y destino", "Desde → Hacia."],
          ["Indica la relación", "Alimenta, Controla o Apoya, con descripción opcional."],
          ["Guarda", "La flecha aparece en el mapa."],
        ],
      },
    ],
    campos: [["Tipo de proceso", true, "Estratégico, operativo o de apoyo (" + PENDIENTE + ")."], ["Responsable", false, "Dueño del proceso."]],
    estados: null,
    relaciones: [["nc", "Las NC pueden vincularse a un proceso."]],
    problemas: [],
    faqs: [],
  },
  {
    id: "mesa",
    grupo: "Gestión",
    icono: "ti-lifebuoy",
    titulo: "Mesa de Servicio SGI",
    ruta: "/mesa-sgi",
    palabras: "mesa ticket solicitud servicio sla pedir ayuda soporte",
    para: "Cualquier colaborador puede pedir algo al departamento SGI (alta de procedimientos, actualización de documentos, capacitación, consultas) sin correo.",
    puede: [
      "Crear una solicitud eligiendo el servicio.",
      "Seguir tus solicitudes y conversar en el hilo.",
      "Equipo SGI: asignarse o asignar solicitudes, comentarios internos, cambiar estado y exportar.",
      "Administrador: gestionar servicios y su SLA.",
    ],
    tareas: [
      {
        id: "mesa-nueva",
        titulo: "Crear una solicitud",
        palabras: "nueva solicitud ticket pedir",
        pasos: [
          ["Entra a Mesa SGI → «Nueva solicitud»", "O elige un servicio desde la portada."],
          ["Elige el servicio", "Cada servicio muestra su plazo (SLA)."],
          ["Escribe título, descripción y prioridad", "La prioridad por defecto es media."],
          ["Envía", "Recibes un folio; síguelo en «Mis solicitudes»."],
        ],
      },
    ],
    campos: [["Servicio", true, "Tipo de solicitud; define el SLA."], ["Prioridad", false, "Baja, media o alta."]],
    estados: {
      flujo: [["Recibida", "info"], ["En atención", "brand"], ["Resuelta", "ok"]],
      extra: [["En espera", "warn"], ["Cancelada", "neutral"]],
      reglas: ["El SLA se mide en horas desde la creación; al resolverse se marca «En SLA» o «Fuera de SLA».", "Los comentarios internos solo los ve el equipo SGI."],
    },
    relaciones: [["equipo", "Atienden los integrantes del Equipo SGI."]],
    problemas: [],
    faqs: [],
  },
  {
    id: "equipo",
    grupo: "Gestión",
    icono: "ti-users",
    titulo: "Equipo SGI",
    ruta: "/sgc/equipo",
    palabras: "equipo usuarios miembros acceso rol permisos agregar desactivar",
    para: "Administra quién usa el SGC, con qué rol y a qué módulos accede.",
    puede: ["Agregar miembros con su rol y módulos.", "Dar «Acceso completo».", "Desactivar miembros."],
    tareas: [
      {
        id: "eq-agregar",
        titulo: "Dar acceso a una persona",
        palabras: "agregar miembro alta usuario acceso",
        pasos: [
          ["Pulsa «Agregar miembro»", "En Equipo SGI (Coordinador)."],
          ["Elige persona y rol", "Coordinador, Auditor, Responsable de área o Dirección."],
          ["Elige los módulos", "O marca «Acceso completo»."],
          ["Guarda", "El cambio de permisos se aplica en alrededor de un minuto."],
        ],
      },
    ],
    campos: [],
    estados: null,
    relaciones: [["inicio", "El rol define qué puede hacer cada persona."]],
    problemas: [["La persona sigue sin ver un módulo.", "Espera un minuto y que recargue la página."]],
    faqs: [["¿Qué significa «Auto-SGI»?", "Miembro con acceso asignado automáticamente por pertenecer al departamento SGI (" + PENDIENTE + ")."]],
  },
  {
    id: "fabi",
    grupo: "Herramientas",
    icono: "ti-sparkles",
    titulo: "Fab-i, asistente del SGC",
    palabras: "fabi asistente ia chat borrador redactar causa raiz buscar folio",
    para: "Asistente que te ayuda a redactar y consultar. Nunca guarda nada sin tu confirmación.",
    puede: [
      "Consultar un registro escribiendo su folio (ej. NC-2026-001).",
      "Redactar borradores de NC, acción correctiva, auditoría o riesgo.",
      "Ayudar con el análisis de causa raíz.",
      "Buscar documentos.",
    ],
    tareas: [
      {
        id: "fabi-borrador",
        titulo: "Pedir un borrador a Fab-i",
        palabras: "borrador redactar prellenar",
        pasos: [
          ["Abre Fab-i", "Botón del asistente en el SGC."],
          ["Describe lo que pasó", "Ej. «redacta una NC: lote sin etiqueta en línea 2»."],
          ["Revisa el borrador", "Corrige lo que haga falta."],
          ["Confirma", "Se abre el formulario prellenado; tú decides si guardas."],
        ],
      },
    ],
    campos: [],
    estados: null,
    relaciones: [["nc", "Prellena el formulario de NC."], ["ac", "Prellena acciones correctivas."]],
    problemas: [],
    faqs: [["¿Fab-i puede inventar datos?", "Las consultas por folio leen directamente la base de datos. Los borradores son propuestas que debes revisar."]],
  },
  {
    id: "busqueda",
    grupo: "Herramientas",
    icono: "ti-command",
    titulo: "Búsqueda rápida (Ctrl+K) y panel lateral",
    palabras: "buscar ctrl k paleta comandos atajo folio panel lateral",
    para: "Encuentra cualquier registro o acción sin navegar por los menús, y consulta registros sin perder la pantalla en la que estás.",
    puede: [
      "Pulsar Ctrl+K y escribir un folio, título o acción (ej. «Nueva NC»).",
      "Abrir NC, AC, auditorías, indicadores, documentos y riesgos en el panel lateral, y desde ahí pasar a la vista completa.",
    ],
    tareas: [],
    campos: [],
    estados: null,
    relaciones: [],
    problemas: [["No aparece una acción en Ctrl+K.", "Las acciones dependen de tu rol."]],
    faqs: [],
  },
];

const POR_ID = Object.fromEntries(MODULOS.map((m) => [m.id, m]));
const GRUPOS = [...new Set(MODULOS.map((m) => m.grupo))];

const RAPIDAS = [
  ["nc", "nc-registrar", "ti-alert-circle", "Registrar una NC"],
  ["nc", "nc-avanzar", "ti-arrow-right-circle", "Avanzar o cerrar una NC"],
  ["ac", "ac-crear", "ti-circle-check", "Crear una acción correctiva"],
  ["ac", "ac-plan", "ti-list-check", "Seguir el plan de una AC"],
  ["auditorias", "aud-hallazgo", "ti-clipboard-check", "Registrar un hallazgo"],
  ["indicadores", "ind-medicion", "ti-chart-bar", "Registrar una medición"],
  ["riesgos", "riesgo-registrar", "ti-shield-plus", "Registrar un riesgo"],
  ["mesa", "mesa-nueva", "ti-lifebuoy", "Pedir algo al SGI"],
];

// ── Búsqueda local ──────────────────────────────────────────────────────────
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const plano = (v) => (Array.isArray(v) ? v.map(plano).join(" ") : typeof v === "boolean" ? "" : String(v ?? ""));

const INDICE = MODULOS.flatMap((m) => [
  { m, titulo: m.titulo, tipo: "Módulo", clave: norm(`${m.titulo} ${m.palabras}`), texto: norm(plano([m.para, m.puede, m.campos, m.estados?.reglas || []])) },
  ...m.tareas.map((t) => ({ m, t, titulo: t.titulo, tipo: "Cómo hacerlo", clave: norm(`${t.titulo} ${t.palabras} ${m.palabras}`), texto: norm(plano([t.pasos, t.notas || []])) })),
  ...m.problemas.map(([p, s]) => ({ m, titulo: p, detalle: s, tipo: "Problema", clave: norm(p), texto: norm(s) })),
  ...m.faqs.map(([q, a]) => ({ m, titulo: q, detalle: a, tipo: "Pregunta", clave: norm(q), texto: norm(a) })),
]);

function buscar(q) {
  const tokens = norm(q).split(/\s+/).filter((w) => w.length > 1);
  if (!tokens.length) return [];
  return INDICE.map((e) => {
    let puntos = 0;
    for (const w of tokens) {
      if (e.clave.includes(w)) puntos += 4;
      else if (e.texto.includes(w)) puntos += 1;
      else return null;
    }
    if (e.t) puntos += 1;
    return { ...e, puntos };
  })
    .filter(Boolean)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, 12);
}

// ── Piezas ──────────────────────────────────────────────────────────────────
function Pasos({ items }) {
  return (
    <ol className="man-pasos">
      {items.map(([t, d], i) => (
        <li key={t}>
          <span className="man-pasos__num">{i + 1}</span>
          <div>
            <b>{t}</b>
            <span>{d}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

const Nota = ({ tipo = "info", children }) => (
  <div className={`man-nota man-nota--${tipo}`}>
    <i className={`ti ${tipo === "aviso" ? "ti-alert-triangle" : tipo === "tip" ? "ti-bulb" : "ti-info-circle"}`} />
    <div>{children}</div>
  </div>
);

// Resalta «pendiente de validación» dentro de cualquier texto
function Texto({ children }) {
  const s = String(children);
  if (!s.includes(PENDIENTE)) return s;
  return s.split(PENDIENTE).map((p, i) => (
    <Fragment key={i}>
      {i > 0 && <span className="ca-pend">{PENDIENTE}</span>}
      {p}
    </Fragment>
  ));
}

function Seccion({ letra, titulo, abierta, children }) {
  return (
    <details className="ca-sec" open={abierta}>
      <summary>
        <span className="ca-sec__letra">{letra}</span>
        {titulo}
        <i className="ti ti-chevron-down ca-sec__flecha" aria-hidden="true" />
      </summary>
      <div className="ca-sec__cuerpo">{children}</div>
    </details>
  );
}

function Tarea({ t, abierta }) {
  return (
    <details className="ca-tarea" id={`t-${t.id}`} open={abierta}>
      <summary>
        <i className="ti ti-player-play" aria-hidden="true" />
        {t.titulo}
      </summary>
      <div className="ca-tarea__cuerpo">
        <Pasos items={t.pasos.map(([a, b]) => [a, <Texto key={a}>{b}</Texto>])} />
        {t.notas?.map(([tipo, txt]) => (
          <Nota key={txt} tipo={tipo}><Texto>{txt}</Texto></Nota>
        ))}
      </div>
    </details>
  );
}

function Modulo({ m, tarea }) {
  const letras = "ABCDEFGH";
  let n = 0;
  const L = () => letras[n++];
  return (
    <article className="pnl man-contenido">
      <header className="man-contenido__head">
        <span className="man-contenido__ico"><i className={`ti ${m.icono}`} /></span>
        <div>
          <span className="man-contenido__grupo">{m.grupo}</span>
          <h2>{m.titulo}</h2>
          <p>{m.para}</p>
        </div>
        {m.ruta && (
          <Link to={m.ruta} className="btn btn--sec man-contenido__ir">
            Ir al módulo <i className="ti ti-arrow-right" />
          </Link>
        )}
      </header>
      <div className="man-contenido__cuerpo">
        <Seccion letra={L()} titulo="¿Qué puedo hacer?" abierta>
          <ul className="ca-lista">{m.puede.map((p) => <li key={p}><Texto>{p}</Texto></li>)}</ul>
          {m.tablaRoles && (
            <div className="tabla-wrap">
              <table className="tabla man-tabla">
                <thead><tr><th>Rol</th><th>Qué puede hacer</th></tr></thead>
                <tbody>{m.tablaRoles.map(([r, d]) => <tr key={r}><td>{r}</td><td>{d}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Seccion>
        {m.tareas.length > 0 && (
          <Seccion letra={L()} titulo="¿Cómo se utiliza?" abierta>
            {m.tareas.map((t, i) => <Tarea key={t.id} t={t} abierta={tarea ? tarea === t.id : i === 0} />)}
          </Seccion>
        )}
        {m.campos.length > 0 && (
          <Seccion letra={L()} titulo="Qué significa cada campo">
            <div className="tabla-wrap">
              <table className="tabla man-tabla">
                <thead><tr><th>Campo</th><th>Obligatorio</th><th>Significado</th></tr></thead>
                <tbody>
                  {m.campos.map(([c, ob, d]) => (
                    <tr key={c}><td>{c}</td><td>{ob ? <span className="tag t-brand">Sí</span> : "No"}</td><td><Texto>{d}</Texto></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccion>
        )}
        {m.estados && (
          <Seccion letra={L()} titulo={m.id === "indicadores" ? "Semáforo" : "Estados y transiciones"}>
            <div className="man-estados">
              {m.estados.flujo.map(([t, tono], i) => (
                <span key={t} className="man-estados__item">
                  {i > 0 && <i className="ti ti-chevron-right" aria-hidden="true" />}
                  <span className={`tag t-${tono}`}>{t}</span>
                </span>
              ))}
              {m.estados.extra.map(([t, tono]) => (
                <span key={t} className="man-estados__item ca-estado-extra"><span className={`tag t-${tono}`}>{t}</span></span>
              ))}
            </div>
            <ul className="ca-lista">{m.estados.reglas.map((r) => <li key={r}>{r}</li>)}</ul>
          </Seccion>
        )}
        {m.relaciones.length > 0 && (
          <Seccion letra={L()} titulo="Relación con otros módulos">
            <ul className="ca-rel">
              {m.relaciones.map(([id, txt]) => (
                <li key={id + txt}>
                  <Link to={`/sgc/manual?s=${id}`}><i className={`ti ${POR_ID[id].icono}`} /> {POR_ID[id].titulo}</Link>
                  <span><Texto>{txt}</Texto></span>
                </li>
              ))}
            </ul>
          </Seccion>
        )}
        {m.problemas.length > 0 && (
          <Seccion letra={L()} titulo="Problemas frecuentes">
            <dl className="ca-prob">
              {m.problemas.map(([p, s]) => (
                <div key={p}><dt><i className="ti ti-alert-triangle" /> {p}</dt><dd>{s}</dd></div>
              ))}
            </dl>
          </Seccion>
        )}
        {m.faqs.length > 0 && (
          <Seccion letra={L()} titulo="Preguntas frecuentes">
            {m.faqs.map(([q, a]) => (
              <details key={q} className="ca-faq"><summary>{q}</summary><p><Texto>{a}</Texto></p></details>
            ))}
          </Seccion>
        )}
      </div>
    </article>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────
export default function ManualSGI() {
  useMigas([{ label: "Centro de ayuda" }]);
  const [params, setParams] = useSearchParams();
  const actual = POR_ID[params.get("s")] ? params.get("s") : "inicio";
  const tarea = params.get("t");
  const [q, setQ] = useState("");
  const resultados = useMemo(() => buscar(q), [q]);
  const contenido = useRef(null);

  const abrir = (s, t) => {
    setQ("");
    setParams(t ? { s, t } : { s });
  };

  useEffect(() => {
    if (tarea) document.getElementById(`t-${tarea}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    else contenido.current?.scrollIntoView({ block: "start" });
  }, [actual, tarea]);

  return (
    <div className="sg-page">
      <Encabezado titulo="Centro de ayuda del SGC" />

      <section className="pnl ca-buscador">
        <label className="ca-buscador__campo">
          <i className="ti ti-search" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="¿Qué necesitas hacer en el SGC? Ej. cerrar una NC, registrar medición…"
            aria-label="Buscar en el centro de ayuda"
          />
        </label>
        {q.trim() ? (
          resultados.length ? (
            <ul className="ca-res">
              {resultados.map((r, i) => (
                <li key={i}>
                  <button type="button" onClick={() => abrir(r.m.id, r.t?.id)}>
                    <i className={`ti ${r.m.icono}`} />
                    <span>
                      <b>{r.titulo}</b>
                      <small>{r.tipo} · {r.m.titulo}{r.detalle ? ` — ${r.detalle}` : ""}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ca-res__vacio muted">No encontramos ayuda para «{q}». Prueba con otra palabra (ej. «acción», «folio», «auditoría»).</p>
          )
        ) : (
          <div className="ca-rapidas">
            <span className="ca-rapidas__tit">Tareas frecuentes</span>
            {RAPIDAS.map(([s, t, ico, txt]) => (
              <button key={t} type="button" className="ca-rapida" onClick={() => abrir(s, t)}>
                <i className={`ti ${ico}`} /> {txt}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="man" ref={contenido}>
        <nav className="man-indice" aria-label="Módulos">
          {GRUPOS.map((g) => (
            <div key={g}>
              <div className="man-indice__grupo">{g}</div>
              {MODULOS.filter((m) => m.grupo === g).map((m) => (
                <button key={m.id} type="button" className={`man-indice__item${m.id === actual ? " is-on" : ""}`} onClick={() => abrir(m.id)}>
                  <i className={`ti ${m.icono}`} /> {m.titulo}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <Modulo key={actual} m={POR_ID[actual]} tarea={tarea} />
      </div>
    </div>
  );
}
