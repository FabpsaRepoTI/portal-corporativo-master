# 🗄️ FABPSA Intranet v1 — Manual de Base de Datos

**Base de datos:** Azure SQL Server · `DB_RHFABPSA`
**Fecha:** Agosto 2026 · **Área:** Sistemas FABPSA

---

## ¿Qué es esta base de datos?

Es el almacén central de toda la información de la Intranet FABPSA. Cada vez que un colaborador llena un formulario, sube un archivo, escribe un comentario o califica un servicio — todo queda guardado aquí. La aplicación web consulta y modifica esta base de datos a través del servidor backend.

---

## 📊 Mapa general de tablas

```
CATÁLOGOS (datos fijos de configuración)
├── cat_estatusTI        → Los posibles estados de un ticket
├── cat_prioridad        → Niveles de urgencia (Baja, Media, Alta, Crítica)
└── cat_servicioTI       → Servicios disponibles (Red, Software, Hardware, etc.)

TICKETS DE INCIDENCIAS (el núcleo del sistema)
├── solicitudTI              → El ticket principal
├── solicitudTI_archivos     → Archivos adjuntos del ticket
├── solicitudTI_comentarios  → Mensajes entre usuario e ingeniero
├── solicitudTI_bitacora     → Notas internas del equipo de Sistemas
└── solicitudTI_evaluacion   → Calificación que da el usuario al servicio

SOLICITUDES DE HARDWARE
├── solicitudHardware              → Cabecera de la solicitud
├── solicitudHardwareDetalle       → Artículos de cada solicitud
├── solicitudHardwareComentarios   → Mensajes y eventos
└── solicitudHardwareEvaluacion    → Calificación final

NOTIFICACIONES
├── cat_tipoNotificacion   → Catálogo de 13 tipos de eventos
└── notificacionTI         → Notificaciones generadas por el sistema
```

---

## 📋 CATÁLOGOS

### `cat_estatusTI` — Estados de un ticket

| Columna      | Tipo     | Descripción                              |
| ------------ | -------- | ---------------------------------------- |
| `idEstatus`  | int (PK) | Identificador único del estado           |
| `estatus`    | varchar  | Nombre del estado en pantalla            |
| `colorHex`   | varchar  | Color hexadecimal para el chip visual    |
| `esTerminal` | bit      | 1 = ticket ya no puede cambiar de estado |

**Datos actuales:**

| idEstatus | estatus        | color             | ¿Terminal? |
| --------- | -------------- | ----------------- | ---------- |
| 1         | Abierto        | #7c3aed (violeta) | No         |
| 2         | En progreso    | #f59e0b (ámbar)   | No         |
| 3         | Resuelto       | #10b981 (verde)   | No         |
| 4         | Cerrado        | #6b7280 (gris)    | Sí         |
| 5         | Cancelado      | #ef4444 (rojo)    | Sí         |
| 7         | En diagnóstico | #f38ba8 (rosa)    | No         |
| 8         | Escalado       | #f38ba8 (rosa)    | No         |

> El estado 6 (Pendiente usuario) fue planeado pero no se usa.

---

### `cat_prioridad` — Niveles de urgencia

| Columna            | Tipo     | Descripción                          |
| ------------------ | -------- | ------------------------------------ |
| `idPrioridad`      | int (PK) | Identificador único                  |
| `prioridad`        | varchar  | Nombre (Baja, Media, Alta, Crítica)  |
| `colorHex`         | varchar  | Color del chip visual                |
| `slaRespuestaHrs`  | int      | Horas máximas para primera respuesta |
| `slaResolucionHrs` | int      | Horas máximas para resolución        |

---

### `cat_servicioTI` — Catálogo de servicios

| Columna            | Tipo     | Descripción                         |
| ------------------ | -------- | ----------------------------------- |
| `idServicio`       | int (PK) | Identificador único                 |
| `idServicioPadre`  | int (FK) | Si es subcategoría, apunta al padre |
| `nombre`           | varchar  | Nombre del servicio                 |
| `slug`             | varchar  | Identificador en la URL             |
| `icono`            | varchar  | Nombre del ícono Tabler             |
| `colorPrimario`    | varchar  | Color en la interfaz                |
| `slaRespuestaMin`  | int      | Minutos para primera respuesta      |
| `slaResolucionMin` | int      | Minutos para resolución             |
| `idPrioridad`      | int (FK) | Prioridad por defecto               |
| `activo`           | bit      | 1 = visible en el menú              |

> Actualmente tiene **17 servicios** configurados. Agregar un nuevo servicio solo requiere un INSERT — sin tocar código.

---

## 🎫 TICKETS DE INCIDENCIAS

### `solicitudTI` — Tabla principal de tickets

| Columna              | Tipo     | Descripción                               |
| -------------------- | -------- | ----------------------------------------- |
| `idSolicitud`        | int (PK) | Identificador único interno               |
| `folio`              | varchar  | Número visible (ej. TI-00055)             |
| `idUsuario`          | varchar  | Login del colaborador que abrió el ticket |
| `nombreUsuario`      | varchar  | Nombre completo del colaborador           |
| `areaUsuario`        | varchar  | Departamento del colaborador              |
| `sitioUsuario`       | varchar  | Planta (PFV, IAFSA, FDNC)                 |
| `idServicio`         | int (FK) | Servicio al que pertenece                 |
| `idPrioridad`        | int (FK) | Nivel de urgencia                         |
| `idEstatus`          | int (FK) | Estado actual                             |
| `titulo`             | varchar  | Título breve del problema                 |
| `descripcion`        | nvarchar | Descripción detallada                     |
| `tecnicoAsignado`    | varchar  | Login del ingeniero asignado              |
| `nombreTecnico`      | varchar  | Nombre del ingeniero asignado             |
| `escalaA`            | nvarchar | Proveedor externo si fue escalado         |
| `slaRespuestaHrs`    | decimal  | Horas SLA de respuesta                    |
| `slaResolucionHrs`   | decimal  | Horas SLA de resolución                   |
| `fechaLimiteResp`    | datetime | Límite para primera respuesta             |
| `fechaLimiteResol`   | datetime | Límite para resolución                    |
| `fechaCreacion`      | datetime | Cuándo se creó                            |
| `fechaActualizacion` | datetime | Última modificación                       |
| `fechaResolucion`    | datetime | Cuándo se resolvió                        |
| `tiempoAtencionMin`  | int      | Minutos totales para resolver             |

**Tickets actuales por estado:**

| Estado         | Cantidad |
| -------------- | -------- |
| Abierto        | 13       |
| En progreso    | 1        |
| Resuelto       | 21       |
| Cerrado        | 6        |
| Cancelado      | 2        |
| En diagnóstico | 6        |
| Escalado       | 19       |
| **Total**      | **68**   |

---

### `solicitudTI_archivos` — Archivos adjuntos

| Columna         | Tipo     | Descripción                 |
| --------------- | -------- | --------------------------- |
| `idArchivo`     | int (PK) | Identificador único         |
| `idSolicitud`   | int (FK) | A qué ticket pertenece      |
| `nombreArchivo` | varchar  | Nombre original del archivo |
| `rutaServidor`  | varchar  | Ruta física en el servidor  |
| `mimeType`      | varchar  | Tipo de archivo             |
| `tamanoBytes`   | bigint   | Tamaño en bytes             |
| `fechaSubida`   | datetime | Cuándo se subió             |

> Archivos físicos en `D:\IntranetAPI\uploads\solicitudes\`

---

### `solicitudTI_comentarios` — Mensajes del ticket

| Columna         | Tipo     | Descripción                        |
| --------------- | -------- | ---------------------------------- |
| `idComentario`  | int (PK) | Identificador único                |
| `idSolicitud`   | int (FK) | A qué ticket pertenece             |
| `idUsuario`     | varchar  | Login de quien escribió            |
| `nombreUsuario` | varchar  | Nombre de quien escribió           |
| `esInterno`     | bit      | 0 = colaborador · 1 = ingeniero TI |
| `comentario`    | nvarchar | Texto del mensaje                  |
| `fecha`         | datetime | Cuándo se escribió                 |

---

### `solicitudTI_bitacora` — Notas técnicas internas

| Columna         | Tipo     | Descripción              |
| --------------- | -------- | ------------------------ |
| `idBitacora`    | int (PK) | Identificador único      |
| `idSolicitud`   | int (FK) | A qué ticket pertenece   |
| `idUsuario`     | varchar  | Login del ingeniero      |
| `nombreUsuario` | varchar  | Nombre del ingeniero     |
| `nota`          | nvarchar | Texto de la nota técnica |
| `fecha`         | datetime | Cuándo se registró       |

> El colaborador **no** puede ver esta información. Al escalar, el sistema registra automáticamente: _"Escalado a [proveedor]: [motivo]"_

---

### `solicitudTI_evaluacion` — Calificación del servicio

| Columna         | Tipo     | Descripción            |
| --------------- | -------- | ---------------------- |
| `idEvaluacion`  | int (PK) | Identificador único    |
| `idSolicitud`   | int (FK) | A qué ticket pertenece |
| `calificacion`  | tinyint  | Estrellas del 1 al 5   |
| `emoji`         | varchar  | Emoji asociado         |
| `comentario`    | nvarchar | Comentario opcional    |
| `fechaRegistro` | datetime | Cuándo se evaluó       |

> Si el colaborador reabre dentro de 48h, la evaluación se elimina para calificar de nuevo.

---

## 💻 HARDWARE

### `catalogoHardware` — Artículos disponibles

| Columna                | Tipo     | Descripción                             |
| ---------------------- | -------- | --------------------------------------- |
| `idArticulo`           | int (PK) | Identificador único                     |
| `nombreArticulo`       | varchar  | Nombre del equipo                       |
| `categoria`            | varchar  | Agrupación (Cómputo, Periféricos, etc.) |
| `activo`               | char     | S/N — disponible para solicitar         |
| `requiereAutorizacion` | char     | S/N — necesita aprobación previa        |

---

### `solicitudHardware` — Cabecera de solicitud

| Columna         | Tipo     | Descripción                                     |
| --------------- | -------- | ----------------------------------------------- |
| `idSolicitud`   | int (PK) | Identificador único                             |
| `folio`         | varchar  | Número visible (ej. HW-00012)                   |
| `fechaRegistro` | datetime | Cuándo se creó                                  |
| `usuario`       | varchar  | Nombre del colaborador                          |
| `loginUsuario`  | varchar  | Login del colaborador _(agregado en migración)_ |
| `departamento`  | varchar  | Departamento del solicitante                    |
| `motivo`        | varchar  | Por qué necesita el equipo                      |
| `observaciones` | varchar  | Notas adicionales                               |
| `estatus`       | varchar  | Pendiente / En proceso / Completada / Rechazada |

---

### `solicitudHardwareDetalle` — Artículos por solicitud

| Columna                | Tipo     | Descripción                     |
| ---------------------- | -------- | ------------------------------- |
| `idDetalle`            | int (PK) | Identificador único del renglón |
| `idSolicitud`          | int (FK) | A qué solicitud pertenece       |
| `idArticulo`           | int (FK) | Artículo del catálogo           |
| `folio`                | varchar  | Folio de la solicitud padre     |
| `cantidad`             | int      | Unidades solicitadas            |
| `estatusDetalle`       | varchar  | Estado individual del artículo  |
| `fechaEstimadaEntrega` | datetime | Estimado de entrega             |
| `observacionAtencion`  | varchar  | Nota del ingeniero              |
| `fechaActualizacion`   | datetime | Última modificación             |
| `usuarioAtendio`       | varchar  | Login del ingeniero que atendió |

> Esta tabla genera la **barra de progreso** visible para el colaborador.

---

### `solicitudHardwareComentarios` — Mensajes y eventos

| Columna         | Tipo     | Descripción                             |
| --------------- | -------- | --------------------------------------- |
| `id`            | int (PK) | Identificador único                     |
| `folio`         | varchar  | Folio de la solicitud                   |
| `login`         | varchar  | Login de quien escribió                 |
| `nombre`        | varchar  | Nombre de quien escribió                |
| `rol`           | varchar  | "Usuario" o "Ingeniero TI"              |
| `mensaje`       | nvarchar | Texto del comentario o evento           |
| `esEvento`      | bit      | 0 = comentario · 1 = evento del sistema |
| `fechaCreacion` | datetime | Cuándo se registró                      |

---

### `solicitudHardwareEvaluacion` — Calificación de hardware

| Columna           | Tipo     | Descripción                            |
| ----------------- | -------- | -------------------------------------- |
| `id`              | int (PK) | Identificador único                    |
| `folio`           | varchar  | Folio evaluado                         |
| `login`           | varchar  | Login del colaborador                  |
| `resuelta`        | bit      | 1 = confirma que quedó resuelto        |
| `calificacion`    | tinyint  | Estrellas del 1 al 5                   |
| `tiempoRespuesta` | varchar  | Percepción: Rápido / Aceptable / Lento |
| `atencionAmable`  | bit      | 1 = atención amable                    |
| `comentario`      | nvarchar | Comentario libre                       |
| `fechaEval`       | datetime | Cuándo se evaluó                       |

---

## 🔔 NOTIFICACIONES

### `cat_tipoNotificacion` — Tipos de eventos

| Columna    | Tipo        | Descripción                        |
| ---------- | ----------- | ---------------------------------- |
| `idTipo`   | int (PK)    | Identificador único                |
| `nombre`   | varchar(60) | Clave del tipo (ej. ticket_creado) |
| `icono`    | varchar(40) | Nombre Tabler (ej. circle-plus)    |
| `colorHex` | varchar(7)  | Color del ícono en el panel        |
| `activo`   | bit         | 1 = activo                         |

**13 tipos configurados:**

| idTipo | nombre           | icono             | color   |
| ------ | ---------------- | ----------------- | ------- |
| 1      | ticket_creado    | circle-plus       | #7c8cf8 |
| 2      | ticket_asignado  | user-check        | #4cc9a6 |
| 3      | estatus_cambio   | refresh           | #f59e0b |
| 4      | comentario_nuevo | message           | #7c8cf8 |
| 5      | sla_vencimiento  | clock-exclamation | #ef4444 |
| 6      | ticket_cerrado   | circle-check      | #4cc9a6 |
| 7      | ticket_reabierto | rotate            | #f38ba8 |
| 8      | escalado         | arrow-up-right    | #f38ba8 |
| 9      | aprobado         | thumb-up          | #4cc9a6 |
| 10     | rechazado        | thumb-down        | #ef4444 |
| 11     | prioridad_cambio | flag              | #f59e0b |
| 12     | info_solicitada  | help-circle       | #7c8cf8 |
| 13     | fecha_compromiso | calendar-event    | #f59e0b |

---

### `notificacionTI` — Notificaciones del sistema

| Columna          | Tipo            | Descripción                             |
| ---------------- | --------------- | --------------------------------------- |
| `idNotificacion` | int (PK)        | Identificador único                     |
| `loginDestino`   | varchar(255) FK | Usuario que recibe la notificación      |
| `loginOrigen`    | varchar(255) FK | Usuario que generó la acción (nullable) |
| `idTipo`         | int (FK)        | Tipo de evento                          |
| `idSolicitud`    | int (FK)        | Ticket relacionado (nullable)           |
| `titulo`         | varchar(120)    | Título corto de la notificación         |
| `descripcion`    | varchar(300)    | Descripción del evento                  |
| `urlDestino`     | varchar(200)    | Ruta de navegación al hacer click       |
| `leida`          | bit             | 0 = no leída · 1 = leída                |
| `fechaCreacion`  | datetime        | Cuándo se generó                        |
| `fechaLeida`     | datetime        | Cuándo se marcó como leída              |

---

## 🔗 Relaciones completas

```
cat_servicioTI ──────┐
cat_prioridad  ──────┤──→ solicitudTI ──→ solicitudTI_archivos
cat_estatusTI  ──────┘         │
                               ├──→ solicitudTI_comentarios
                               ├──→ solicitudTI_bitacora
                               ├──→ solicitudTI_evaluacion
                               └──→ notificacionTI

catalogoHardware ──→ solicitudHardwareDetalle
solicitudHardware ──→ solicitudHardwareDetalle
solicitudHardware ──→ solicitudHardwareComentarios
solicitudHardware ──→ solicitudHardwareEvaluacion

sec_users ──→ notificacionTI (loginDestino / loginOrigen)
```

---

## 📝 Migraciones realizadas

```sql
-- 1. Login en hardware
ALTER TABLE solicitudHardware ADD loginUsuario VARCHAR(100) NULL;

-- 2. SLA en minutos para servicios
ALTER TABLE cat_servicioTI ADD slaRespuestaMin INT NULL;
ALTER TABLE cat_servicioTI ADD slaResolucionMin INT NULL;
ALTER TABLE cat_servicioTI ADD idPrioridad INT NULL;

-- 3. Campo escalamiento en tickets
ALTER TABLE solicitudTI ADD escalaA NVARCHAR(200) NULL;

-- 4. Estado En diagnóstico
INSERT INTO cat_estatusTI VALUES (7, 'En diagnóstico', '#f38ba8', 0);

-- 5. Estado Escalado
INSERT INTO cat_estatusTI VALUES (8, 'Escalado', '#f38ba8', 0);

-- 6. Tabla de evaluaciones
CREATE TABLE solicitudTI_evaluacion (
    idEvaluacion  INT IDENTITY(1,1) PRIMARY KEY,
    idSolicitud   INT NOT NULL,
    calificacion  TINYINT NOT NULL,
    emoji         VARCHAR(10) NULL,
    comentario    NVARCHAR(500) NULL,
    fechaRegistro DATETIME DEFAULT GETDATE()
);

-- 7. Tablas de notificaciones
CREATE TABLE cat_tipoNotificacion (
  idTipo INT IDENTITY(1,1) PRIMARY KEY,
  nombre VARCHAR(60) NOT NULL,
  icono VARCHAR(40) NOT NULL,
  colorHex VARCHAR(7) NOT NULL,
  activo BIT DEFAULT 1
);

CREATE TABLE notificacionTI (
  idNotificacion INT IDENTITY(1,1) PRIMARY KEY,
  loginDestino VARCHAR(255) NOT NULL REFERENCES sec_users(login),
  loginOrigen VARCHAR(255) NULL REFERENCES sec_users(login),
  idTipo INT NOT NULL REFERENCES cat_tipoNotificacion(idTipo),
  idSolicitud INT NULL REFERENCES solicitudTI(idSolicitud),
  titulo VARCHAR(120) NOT NULL,
  descripcion VARCHAR(300) NOT NULL,
  urlDestino VARCHAR(200) NOT NULL,
  leida BIT DEFAULT 0,
  fechaCreacion DATETIME DEFAULT GETDATE(),
  fechaLeida DATETIME NULL
);

CREATE INDEX IX_notif_login ON notificacionTI (loginDestino, leida, fechaCreacion DESC);
CREATE INDEX IX_notif_solicitud ON notificacionTI (idSolicitud);
```

---

## ⚡ Consultas útiles

```sql
-- Tickets abiertos con ingeniero asignado
SELECT folio, nombreUsuario, areaUsuario, estatus, nombreTecnico, fechaCreacion
FROM solicitudTI s
JOIN cat_estatusTI e ON e.idEstatus = s.idEstatus
WHERE s.idEstatus NOT IN (4, 5)
ORDER BY fechaCreacion DESC;

-- Tickets con SLA vencido
SELECT folio, nombreUsuario, nombreTecnico, fechaLimiteResol
FROM solicitudTI
WHERE fechaLimiteResol < GETDATE()
AND idEstatus NOT IN (3, 4, 5);

-- Tickets escalados
SELECT folio, nombreUsuario, escalaA, fechaCreacion
FROM solicitudTI WHERE idEstatus = 8;

-- KPIs por estado
SELECT e.estatus, COUNT(*) as total
FROM solicitudTI s
JOIN cat_estatusTI e ON e.idEstatus = s.idEstatus
GROUP BY e.estatus ORDER BY total DESC;

-- Evaluaciones recibidas
SELECT s.folio, s.nombreUsuario, ev.calificacion, ev.comentario, ev.fechaRegistro
FROM solicitudTI_evaluacion ev
JOIN solicitudTI s ON s.idSolicitud = ev.idSolicitud
ORDER BY ev.fechaRegistro DESC;

-- Notificaciones no leídas por usuario
SELECT loginDestino, COUNT(*) as pendientes
FROM notificacionTI WHERE leida = 0
GROUP BY loginDestino ORDER BY pendientes DESC;
```

---

**Total de tablas documentadas: 15**

_Manual de Base de Datos — FABPSA Sistemas · Agosto 2026_
