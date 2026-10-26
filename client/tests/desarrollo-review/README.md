# Regresión: solicitud de desarrollo

Desde `client`: `node tests/desarrollo-review/build.cjs` y `node tests/desarrollo-review/review.cjs`.

Compila el alta y la administración. La prueba de navegador usa respuestas simuladas locales, verifica que los tres campos se envíen de forma independiente y que se limpien al iniciar otra solicitud. No crea solicitudes reales.

Desde la raíz: `node --test server/tests/desarrolloDetalle.test.js server/tests/desarrolloEtapas.test.js server/tests/devAvanceEtapas.test.js`.

El seguimiento resuelve el estatus por nombre del catálogo. Análisis prefiere Análisis/Evaluación y admite En revisión; Desarrollo utiliza En desarrollo/En proceso; Pruebas utiliza En pruebas; Liberación permanece activa hasta que se utilice el flujo Concluir. No se cambian los catálogos ni se corrigen registros históricos automáticamente.
