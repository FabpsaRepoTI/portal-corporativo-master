# Etapas de desarrollo

Flujo implementado:

1. Desde el detalle del desarrollo, Planificación de etapas permite guardar inicio y término previsto de Análisis, Desarrollo, Pruebas y Liberación. Los registros existentes de Revisión también se conservan.
2. Registrar avance exige etapa, inicio y término. Precarga el plan o la etapa activa y guarda los datos en el avance publicado. Los borradores pueden permanecer incompletos.
3. Al publicar otra etapa, la activa anterior se cierra con la fecha de inicio indicada para la nueva. Se conserva una auditoría con los datos anteriores y nuevos. Las etapas cerradas no se sobreescriben.
4. El seguimiento de Mesa de Servicio usa el mismo almacenamiento de etapas y guarda el avance en la misma transacción.
5. Cronograma resuelve idSolicitudOrigen para compartir etapas y porcentajes. Incluye también solicitudes con etapas planificadas que aún no tengan un proyecto dev asociado. No vincula por nombre ni inventa periodos.

Persistencia: dbo.desarrollo_etapas y dbo.desarrollo_etapas_historial. Las tablas y las columnas adicionales de los avances se crean de forma aditiva al usar los servicios. El backend actualizado debe estar ejecutándose y su usuario SQL necesita los permisos de creación/alteración correspondientes. No se modifican los datos anteriores para simular fechas.

Verificación desde client:

- node tests/stages-review/build.cjs
- node tests/stages-review/review.cjs
- node tests/cronograma-review/build.cjs
- node tests/cronograma-review/review.cjs
- node --test tests/cronograma-review/dates.test.cjs

Desde la raíz:

- node --test server/tests/desarrolloEtapas.test.js server/tests/cronogramaEtapas.test.js server/tests/devAvanceEtapas.test.js server/tests/portafolio.service.test.js server/tests/portafolio.test.js

Las pruebas del navegador interceptan respuestas para verificar campos obligatorios, planificación, precarga, payload publicado y cuatro barras. Las pruebas del servidor usan adaptadores SQL controlados para verificar validaciones, identidad, cierre, auditoría y transacciones. No sustituyen una prueba de integración contra SQL Server real.

La prueba visual antigua de Portafolio (portafolio-review/review.cjs) falla en su condición inicial de documento sin scroll, antes de abrir el modal. Se conserva ese fallo para revisión de esa pantalla; el flujo nuevo se verifica por separado en stages-review.
