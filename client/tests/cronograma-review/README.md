# Verificación de Cronograma

Desde client:

- node --test tests/cronograma-review/dates.test.cjs
- node tests/cronograma-review/build.cjs
- node tests/cronograma-review/review.cjs

Las respuestas interceptadas en estas pruebas son fixtures del contrato de GET /api/dev/cronograma. No se incluyen en el código de producción ni se escriben en la base de datos.

Se verifican etapas con inicio solamente, compromiso solamente, intervalos completos, fechas inválidas, intervalos fuera de pantalla, filtros, detalle y conservación del contenedor de navegación. Las capturas se guardan en _docs/gestion-desarrollo-revision.

Causa identificada en código: crearProyecto, promoverSolicitud y cambiarEstatus insertan etapas con fechaInicio y sin fecha final. El render anterior exigía ambas fechas y las clasificaba incorrectamente como vacías. Los intervalos parciales ahora muestran un marcador en la fecha real, sin inferir una fecha final del proyecto ni inventar etapas. El endpoint y su contrato permanecen intactos.

La conexión de lectura a la base de datos del entorno falló (ESOCKET); estas pruebas no certifican el contenido de esa base de datos.
