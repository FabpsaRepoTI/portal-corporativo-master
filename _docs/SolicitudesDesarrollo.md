# Manual de Arquitectura SQL — Módulo Solicitudes de Desarrollo

## FABPSA Intranet v4 · Mesa de Servicio

## Versión 2 — Arquitectura final (integrada con solicitudTI)

---

## 1. Decisión de Arquitectura

Durante el diseño se identificó que las solicitudes de desarrollo **ya se guardan en `solicitudTI`** con `idServicio = 2` ("Desarrollo de sistemas"). El formulario del usuario ya funcionaba y ya tenía datos.

Por esta razón se descartó crear una tabla `solicitud_desarrollo` independiente y se optó por una **arquitectura integrada**:

- `solicitudTI` sigue siendo la tabla base de todos los tickets
- Se creó `solicitudTI_desarrollo_detalle` con los campos específicos de desarrollo
- Se reutilizan `solicitudTI_comentarios`, `solicitudTI_archivos` y `solicitudTI_bitacora`

Esto evita duplicar lógica y permite que los reportes globales de TI incluyan todos los tickets en una sola tabla.

---

## 2. Diagrama de Relaciones

```
sec_users (existente)
    │
    ├──► solicitudTI.idUsuario          (solicitante)
    └──► solicitudTI.tecnicoAsignado    (responsable TI)

cat_servicioTI (existente)
    └──► solicitudTI.idServicio = 2     (filtra solo desarrollo)

cat_prioridad (existente)
    └──► solicitudTI.idPrioridad
    Columnas: idPrioridad, prioridad, colorHex,
              slaRespuestaHrs, slaResolucionHrs

cat_estatus_desarrollo (NUEVA)
    └──► solicitudTI.idEstatus          (reemplaza cat_estatusTI para este módulo)

cat_tipo_solicitud_dev (NUEVA)
    └──► solicitudTI_desarrollo_detalle.idTipo

desarrollosTI (EXISTENTE — modificada)
    └──► solicitudTI_desarrollo_detalle.idDesarrollo

solicitudTI (existente — tabla base)
    ├──► solicitudTI_desarrollo_detalle  (JOIN por idSolicitud)
    ├──► solicitudTI_comentarios         (reutilizada)
    ├──► solicitudTI_archivos            (reutilizada)
    └──► solicitudTI_bitacora            (reutilizada)
```

---

## 3. Tablas Existentes Reutilizadas

### 3.1 `solicitudTI` — Tabla base

Filtramos siempre con `WHERE idServicio = 2` para aislar las solicitudes de desarrollo.

Columnas relevantes para este módulo:

| Columna              | Tipo      | Descripción                              |
| -------------------- | --------- | ---------------------------------------- |
| `idSolicitud`        | INT PK    | Clave primaria                           |
| `folio`              | VARCHAR   | Folio del ticket: `TI-00017`             |
| `idServicio`         | INT       | Siempre = 2 para desarrollo              |
| `idPrioridad`        | TINYINT   | FK a cat_prioridad                       |
| `titulo`             | NVARCHAR  | Título de la solicitud                   |
| `descripcion`        | NVARCHAR  | Descripción del problema/necesidad       |
| `idUsuario`          | VARCHAR   | Login del solicitante                    |
| `nombreUsuario`      | NVARCHAR  | Nombre del solicitante                   |
| `areaUsuario`        | NVARCHAR  | Área del solicitante                     |
| `sitioUsuario`       | NVARCHAR  | Planta/sitio                             |
| `idEstatus`          | INT       | FK a cat_estatus_desarrollo              |
| `slaRespuestaHrs`    | INT       | Horas SLA de respuesta                   |
| `slaResolucionHrs`   | INT       | Horas SLA de resolución                  |
| `fechaLimiteResp`    | DATETIME2 | Límite de primera respuesta              |
| `fechaLimiteResol`   | DATETIME2 | Límite de resolución                     |
| `camposExtra`        | NVARCHAR  | JSON con correos adicionales al concluir |
| `fechaCreacion`      | DATETIME2 | Fecha de creación                        |
| `fechaActualizacion` | DATETIME2 | Última actualización                     |
| `fechaResolucion`    | DATETIME2 | Cuando se resolvió/concluyó              |
| `tecnicoAsignado`    | VARCHAR   | Login del responsable TI                 |
| `nombreTecnico`      | NVARCHAR  | Nombre del responsable TI                |

### 3.2 `solicitudTI_comentarios` — Chat

| Columna         | Tipo     | Descripción                     |
| --------------- | -------- | ------------------------------- |
| `idComentario`  | INT PK   | Clave primaria                  |
| `idSolicitud`   | INT FK   | Referencia a solicitudTI        |
| `idUsuario`     | VARCHAR  | Login del autor                 |
| `nombreUsuario` | NVARCHAR | Nombre del autor                |
| `comentario`    | NVARCHAR | Contenido del mensaje           |
| `esInterno`     | BIT      | 0=visible para todos, 1=solo TI |
| `fecha`         | DATETIME | Fecha y hora del comentario     |

### 3.3 `solicitudTI_archivos` — Adjuntos

| Columna         | Tipo     | Descripción               |
| --------------- | -------- | ------------------------- |
| `idArchivo`     | INT PK   | Clave primaria            |
| `idSolicitud`   | INT FK   | Referencia a solicitudTI  |
| `nombreArchivo` | VARCHAR  | Nombre original           |
| `rutaServidor`  | VARCHAR  | Ruta relativa en servidor |
| `mimeType`      | VARCHAR  | Tipo MIME                 |
| `tamanoBytes`   | BIGINT   | Tamaño en bytes           |
| `fechaSubida`   | DATETIME | Fecha de subida           |

### 3.4 `solicitudTI_bitacora` — Historial

| Columna         | Tipo     | Descripción                          |
| --------------- | -------- | ------------------------------------ |
| `idBitacora`    | INT PK   | Clave primaria                       |
| `idSolicitud`   | INT FK   | Referencia a solicitudTI             |
| `idUsuario`     | VARCHAR  | Quién hizo el cambio                 |
| `nombreUsuario` | NVARCHAR | Nombre del autor                     |
| `nota`          | NVARCHAR | Descripción del evento (texto libre) |
| `fecha`         | DATETIME | Fecha y hora del evento              |

**Nota importante:** La tabla solo tiene `nota` como campo de texto. El service consolida `descripcion + [valorAnterior -> valorNuevo]` en ese campo para mantener legibilidad.

---

## 4. Tablas Nuevas

### 4.1 `cat_estatus_desarrollo`

Estatus específicos del ciclo de vida de desarrollo. Separado de `cat_estatusTI` porque los flujos son diferentes.

| Columna     | Tipo        | Descripción                    |
| ----------- | ----------- | ------------------------------ |
| `idEstatus` | INT PK      | Identificador                  |
| `nombre`    | VARCHAR(50) | Nombre visible                 |
| `color`     | VARCHAR(10) | Color hex para texto del chip  |
| `colorBg`   | VARCHAR(30) | Color rgba para fondo del chip |
| `orden`     | INT         | Orden lógico del flujo         |
| `activo`    | BIT         | Para desactivar sin borrar     |

**Datos:**

| id  | Nombre                | Color   |
| --- | --------------------- | ------- |
| 1   | Pendiente             | #f59e0b |
| 2   | En revisión           | #7c8cf8 |
| 3   | En proceso            | #3b82f6 |
| 4   | En pruebas            | #8b5cf6 |
| 5   | Esperando información | #f97316 |
| 6   | Rechazado             | #f38ba8 |
| 7   | Concluido             | #10b981 |

**Flujo de transiciones:**

```
Pendiente → En revisión → En proceso → En pruebas → Concluido
                ↓               ↓
         Esperando info   Rechazado (desde cualquier estatus activo)
```

---

### 4.2 `cat_tipo_solicitud_dev`

Clasifica el tipo de trabajo solicitado.

| Columna  | Tipo        | Descripción                |
| -------- | ----------- | -------------------------- |
| `idTipo` | INT PK      | Identificador              |
| `nombre` | VARCHAR(80) | Nombre visible             |
| `icono`  | VARCHAR(50) | Nombre del ícono Tabler    |
| `activo` | BIT         | Para desactivar sin borrar |

**Datos:**

| id  | Nombre                | Ícono               |
| --- | --------------------- | ------------------- |
| 1   | Nuevo sistema         | device-desktop-code |
| 2   | Mejora a sistema      | adjustments-alt     |
| 3   | Nueva funcionalidad   | puzzle              |
| 4   | Automatización        | robot               |
| 5   | Corrección de proceso | tool                |

---

### 4.3 `solicitudTI_desarrollo_detalle`

Extiende `solicitudTI` con los campos específicos de desarrollo. Relación 1:1 con `solicitudTI`.

| Columna             | Tipo          | Nulo | Descripción                       |
| ------------------- | ------------- | ---- | --------------------------------- |
| `idSolicitud`       | INT PK/FK     | NO   | Clave primaria y FK a solicitudTI |
| `idDesarrollo`      | INT FK        | SÍ   | FK a desarrollosTI.id             |
| `idTipo`            | INT FK        | SÍ   | FK a cat_tipo_solicitud_dev       |
| `justificacion`     | NVARCHAR(MAX) | SÍ   | Justificación del negocio         |
| `beneficioEsperado` | NVARCHAR(MAX) | SÍ   | Beneficio esperado                |
| `impacto`           | VARCHAR(10)   | SÍ   | bajo / medio / alto / critico     |
| `fechaCompromiso`   | DATETIME      | SÍ   | Fecha prometida de entrega        |
| `fechaInicio`       | DATETIME      | SÍ   | Cuándo TI comenzó realmente       |
| `motivoRechazo`     | NVARCHAR(MAX) | SÍ   | Obligatorio si idEstatus = 6      |
| `impactaOtrasAreas` | BIT           | NO   | ¿Notificar correos adicionales?   |
| `loginConcluyo`     | VARCHAR(255)  | SÍ   | Quién ejecutó la conclusión       |
| `fechaConclusión`   | DATETIME      | SÍ   | Cuándo se marcó como Concluido    |

**Nota:** El registro de detalle se crea con `MERGE` desde el service — si no existe lo inserta, si ya existe lo actualiza. Esto garantiza compatibilidad con solicitudes antiguas.

---

### 4.4 `desarrollosTI` (modificada)

Tabla existente. Se agregó `loginResponsable` para vincular cada sistema con su responsable en `sec_users` y permitir pre-asignación automática.

| Columna            | Tipo         | Descripción                |
| ------------------ | ------------ | -------------------------- |
| `id`               | INT PK       | Identificador              |
| `desarrollo`       | VARCHAR(255) | Nombre del sistema         |
| `responsable`      | VARCHAR(255) | Nombre en texto (legacy)   |
| `loginResponsable` | VARCHAR(255) | Login en sec_users (nuevo) |

**19 sistemas registrados:** CIDE, PEDIDOS, SISAP, SGRHEP, BSC, INTRANET, PROJECT, FABPSA APLICACIONES, FOOD FRAUD, FOOD DEFENSE, MULTIVISION, SCAN IAFSA, WOM, PAGINA WEB, NUEVO DESARROLLO, PLATAFORMA DE GESTION INTEGRAL, MOVIMIENTO DE INVENTARIO AC, FABPSYS.

---

## 5. Queries Principales del Backend

### Lista con filtros (getLista)

```sql
SELECT s.idSolicitud, s.folio, s.titulo, s.nombreUsuario, s.areaUsuario,
       s.idPrioridad, s.idEstatus, s.tecnicoAsignado, s.nombreTecnico,
       s.fechaCreacion, s.fechaActualizacion, s.fechaLimiteResol,
       dd.idDesarrollo, dd.idTipo, dd.impacto, dd.fechaCompromiso,
       ced.nombre AS estatusNombre, ced.color AS estatusColor, ced.colorBg AS estatusBg,
       ctd.nombre AS tipoNombre, ctd.icono AS tipoIcono,
       cp.prioridad AS prioridadNombre, cp.colorHex AS prioridadColor,
       dt.desarrollo AS sistemaNombre,
       CASE
         WHEN s.idEstatus = 7 THEN 'concluido'
         WHEN s.idEstatus = 6 THEN 'rechazado'
         WHEN s.fechaLimiteResol IS NULL THEN 'sin_sla'
         WHEN GETDATE() > s.fechaLimiteResol THEN 'vencido'
         WHEN DATEDIFF(HOUR,GETDATE(),s.fechaLimiteResol) <= 24 THEN 'proximo'
         ELSE 'en_tiempo'
       END AS slaEstado,
       DATEDIFF(DAY, s.fechaCreacion, GETDATE()) AS diasAbiertos,
       COUNT(*) OVER() AS totalRegistros
FROM solicitudTI s
LEFT JOIN solicitudTI_desarrollo_detalle dd ON s.idSolicitud = dd.idSolicitud
LEFT JOIN cat_estatus_desarrollo ced ON s.idEstatus = ced.idEstatus
LEFT JOIN cat_tipo_solicitud_dev ctd ON dd.idTipo = ctd.idTipo
LEFT JOIN cat_prioridad cp ON s.idPrioridad = cp.idPrioridad
LEFT JOIN desarrollosTI dt ON dd.idDesarrollo = dt.id
WHERE s.idServicio = 2
ORDER BY s.fechaCreacion DESC
OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY;
```

### KPIs

```sql
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN idEstatus = 1 THEN 1 ELSE 0 END) AS pendientes,
  SUM(CASE WHEN idEstatus = 2 THEN 1 ELSE 0 END) AS enRevision,
  SUM(CASE WHEN idEstatus = 3 THEN 1 ELSE 0 END) AS enProceso,
  SUM(CASE WHEN idEstatus = 4 THEN 1 ELSE 0 END) AS enPruebas,
  SUM(CASE WHEN idEstatus = 7 THEN 1 ELSE 0 END) AS concluidas,
  SUM(CASE WHEN idEstatus = 6 THEN 1 ELSE 0 END) AS rechazadas,
  SUM(CASE WHEN idEstatus NOT IN (6,7)
            AND fechaLimiteResol IS NOT NULL
            AND GETDATE() > fechaLimiteResol
       THEN 1 ELSE 0 END) AS vencidas,
  SUM(CASE WHEN tecnicoAsignado = @login
            AND idEstatus NOT IN (6,7)
       THEN 1 ELSE 0 END) AS misAsignadas
FROM solicitudTI
WHERE idServicio = 2;
```

### Detalle completo

```sql
SELECT s.*, dd.*, ced.nombre AS estatusNombre, ced.color AS estatusColor,
       ced.colorBg AS estatusBg, ctd.nombre AS tipoNombre, ctd.icono AS tipoIcono,
       cp.prioridad AS prioridadNombre, cp.colorHex AS prioridadColor,
       dt.desarrollo AS sistemaNombre,
       DATEDIFF(DAY, s.fechaCreacion, GETDATE()) AS diasAbiertos,
       DATEDIFF(MINUTE, GETDATE(), s.fechaLimiteResol) AS slaMinRestantes
FROM solicitudTI s
LEFT JOIN solicitudTI_desarrollo_detalle dd ON s.idSolicitud = dd.idSolicitud
LEFT JOIN cat_estatus_desarrollo ced ON s.idEstatus = ced.idEstatus
LEFT JOIN cat_tipo_solicitud_dev ctd ON dd.idTipo = ctd.idTipo
LEFT JOIN cat_prioridad cp ON s.idPrioridad = cp.idPrioridad
LEFT JOIN desarrollosTI dt ON dd.idDesarrollo = dt.id
WHERE s.idSolicitud = @id AND s.idServicio = 2;
```

---

## 6. Reglas de Negocio

| Regla                                                                 | Dónde se aplica                       |
| --------------------------------------------------------------------- | ------------------------------------- |
| `idServicio = 2` siempre en el WHERE                                  | Service — todas las queries           |
| Rechazo requiere `motivoRechazo`                                      | Routes — validación antes del service |
| Rechazo guarda motivo en `solicitudTI_desarrollo_detalle`             | Service — `cambiarEstatus`            |
| Conclusión registra `fechaConclusión` y `loginConcluyo` en detalle    | Service — `cambiarEstatus`            |
| En proceso registra `fechaInicio` si es null                          | Service — `cambiarEstatus`            |
| Pre-asignación automática desde `desarrollosTI.loginResponsable`      | Service — `crear`                     |
| Correos adicionales al concluir se guardan en `camposExtra` como JSON | Service — `registrarConclusión`       |
| Bitácora consolida todo en campo `nota`                               | Service — `insertarBitacora`          |
| `MERGE` en detalle: crea si no existe, actualiza si existe            | Service — `actualizarDetalle`         |

---

## 7. Catálogos de cat_prioridad (columnas exactas)

```sql
-- Columnas reales de cat_prioridad en DB_RHFABPSA
idPrioridad   TINYINT
prioridad     VARCHAR    -- nombre de la prioridad (NO "nombre")
colorHex      NVARCHAR   -- color hex (NO "color")
slaRespuestaHrs INT      -- horas SLA respuesta (NO slaRespuestaMin)
slaResolucionHrs INT     -- horas SLA resolución (NO slaResolucionMin)
descripcion   NVARCHAR
```

---

## 8. Endpoints del Backend

| Método | Ruta                                         | Descripción                                     |
| ------ | -------------------------------------------- | ----------------------------------------------- |
| GET    | `/api/solicitudes-desarrollo/catalogos`      | Estatus, tipos, sistemas, prioridades, técnicos |
| GET    | `/api/solicitudes-desarrollo/kpis`           | 8 contadores para KPI strip                     |
| GET    | `/api/solicitudes-desarrollo`                | Lista con filtros y paginación                  |
| GET    | `/api/solicitudes-desarrollo/:id`            | Detalle completo                                |
| PUT    | `/api/solicitudes-desarrollo/:id/estatus`    | Cambiar estatus                                 |
| PUT    | `/api/solicitudes-desarrollo/:id/asignar`    | Asignar responsable                             |
| PUT    | `/api/solicitudes-desarrollo/:id/prioridad`  | Cambiar prioridad + recalcular SLA              |
| PUT    | `/api/solicitudes-desarrollo/:id/detalle`    | Actualizar campos de desarrollo                 |
| POST   | `/api/solicitudes-desarrollo/:id/comentario` | Agregar comentario                              |
| POST   | `/api/solicitudes-desarrollo/:id/adjuntos`   | Subir archivos                                  |
| PUT    | `/api/solicitudes-desarrollo/:id/concluir`   | Registrar impacto a otras áreas                 |

**Todos requieren:** `Authorization: Bearer {JWT}`

---

## 9. Archivos del Backend

```
D:\IntranetAPI\
  routes\
    solicitudesDesarrollo.routes.js   ✅ creado
  services\
    solicitudesDesarrollo.service.js  ✅ creado
```

**Registro en index.js:**

```js
const solicitudesDesarrollo = require("./routes/solicitudesDesarrollo.routes");
app.use("/api/solicitudes-desarrollo", solicitudesDesarrollo);
```

---

## 10. Estado Actual del Módulo



| Componente                                   | Estado                |
| -------------------------------------------- | --------------------- |
| BD — catálogos                               | ✅ Completo           |
| BD — tabla detalle                           | ✅ Completo           |
| BD — desarrollosTI modificada                | ✅ Completo           |
| Backend routes                               | ✅ Completo y probado |
| Backend service                              | ✅ Completo y probado |
| Frontend — grid principal                    | ⏳ Pendiente          |
| Frontend — panel detalle                     | ⏳ Pendiente          |
| Integración con MesaDeServicioAdminPage tabs | ⏳ Pendiente          |

---

_Documento actualizado: Agosto 2026 · FABPSA Intranet v4 · Mesa de Servicio_
