# Verificación del flujo de desarrollo

Desde `client`:

```
node tests/flujo-desarrollo-review/build.cjs
node tests/flujo-desarrollo-review/review.cjs
```

Los datos reales de consulta se cargan de archivos locales ignorados: `.equipo-review/real.json`, `.equipo-review/details.json`, `.flujo-desarrollo-review/finalizados.json` y `.flujo-desarrollo-review/traza.json`. No se incluyen datos reales en el código de producción ni se escriben solicitudes a través de las pruebas de navegador. Las demás respuestas son escenarios simulados.

El navegador comprueba clasificación, fecha automática, envío sin etapas, ausencia de planificación en Portafolio/Registrar Avance, cinco asignaciones de Juan, agenda interactiva, doce filas de cronograma sin paginación, lectura de trazabilidad y bloqueo de solicitudes rechazadas.

Pruebas de servidor desde la raíz:

```
node --test server/tests/desarrolloDetalle.test.js server/tests/desarrolloEtapas.test.js server/tests/devAvanceEtapas.test.js server/tests/portafolio.test.js server/tests/portafolio.service.test.js server/tests/cronogramaEtapas.test.js
```
