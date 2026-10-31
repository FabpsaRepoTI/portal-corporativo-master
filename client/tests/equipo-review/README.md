# Revisión de Mi equipo

Desde `client`, ejecutar `node tests/equipo-review/build.cjs` y `node tests/equipo-review/review.cjs`.

La revisión usa respuestas reales guardadas localmente en `.equipo-review/real.json` (getEquipo) y `.equipo-review/details.json` (mapa por login de getDesarrollador). No se incluyen estos datos en el repositorio. Ambas consultas son de solo lectura. El navegador muestra el componente y las hojas de estilo de producción en un entorno aislado; no verifica la sesión ni la navegación del portal completo.

Comprueba horas comprometidas, bloqueos, proyectos, las tres filas de avance, estados vacío y error, y genera capturas de escritorio y móvil. `compare.cjs` genera una comparación lado a lado con la referencia local suministrada.
