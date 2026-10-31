# Revisión de Portafolio

Desde `client`:

```powershell
node tests/portafolio-review/build.cjs
node tests/portafolio-review/review.cjs
```

Usa Chromium de Playwright y las dependencias del proyecto. Las solicitudes se interceptan con datos de prueba; no consulta ni modifica la base real. Comprueba actualizaciones de Mesa de Servicio, publicación sobre el id original, filtros, paginación, ausencia de scroll a 1536×1024 y 1366×768, y ancho móvil. Guarda capturas en `_docs/gestion-desarrollo-revision`.

La API y las reglas se prueban desde la raíz con:

```powershell
node --test server/tests/portafolio.test.js server/tests/portafolio.service.test.js
```
