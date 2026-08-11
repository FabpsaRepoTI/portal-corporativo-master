# 🗄️ FABPSA Intranet v4 — Manual de Base de Datos

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
└── solicitudHardware    → Solicitudes de equipo y dispositivos
```

---

## 📋 CATÁLOGOS

### `cat_estatusTI` — Estados de un ticket

Contiene todos los estados por los que puede pasar un ticket de incidencia.

| Columna      | Tipo     | Descripción                                                      |
| ------------ | -------- | ---------------------------------------------------------------- |
| `idEstatus`  | int (PK) | Identificador único del estado                                   |
| `estatus`    | varchar  | Nombre del estado que se muestra en pantalla                     |
| `colorHex`   | varchar  | Color en formato hexadecimal para el chip visual                 |
| `esTerminal` | bit      | 1 = el ticket ya no puede cambiar de estado (Cerrado, Cancelado) |

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

> **Nota:** El estado 6 (Pendiente usuario) fue planeado pero no se usa — no hay tickets con ese valor en producción.

---

### `cat_prioridad` — Niveles de urgencia

Define qué tan urgente es un ticket y cuánto tiempo tiene el equipo de Sistemas para atenderlo.

| Columna            | Tipo     | Descripción                                    |
| ------------------ | -------- | ---------------------------------------------- |
| `idPrioridad`      | int (PK) | Identificador único                            |
| `prioridad`        | varchar  | Nombre (Baja, Media, Alta, Crítica)            |
| `colorHex`         | varchar  | Color del chip visual                          |
| `slaRespuestaHrs`  | int      | Horas máximas para dar la primera respuesta    |
| `slaResolucionHrs` | int      | Horas máximas para resolver el ticket completo |

> **SLA** significa _Service Level Agreement_ — el tiempo comprometido de atención. Si el equipo no responde dentro de ese tiempo, el ticket se marca como "Vencido" en el sistema.

---

### `cat_servicioTI` — Catálogo de servicios

Es la tabla más importante de configuración. Define todos los servicios que aparecen en el menú de la Mesa de Servicio y cómo se comporta su formulario.

| Columna            | Tipo     | Descripción                                               |
| ------------------ | -------- | --------------------------------------------------------- |
| `idServicio`       | int (PK) | Identificador único                                       |
| `idServicioPadre`  | int (FK) | Si es una subcategoría, apunta al servicio padre          |
| `nombre`           | varchar  | Nombre del servicio (ej. "Red e Internet")                |
| `slug`             | varchar  | Identificador en la URL (ej. "red-internet")              |
| `icono`            | varchar  | Nombre del ícono visual (ej. "ti-network")                |
| `colorPrimario`    | varchar  | Color del servicio en la interfaz                         |
| `slaRespuestaMin`  | int      | Minutos para primera respuesta (más preciso que horas)    |
| `slaResolucionMin` | int      | Minutos para resolución completa                          |
| `idPrioridad`      | int (FK) | Prioridad por defecto al crear un ticket de este servicio |
| `activo`           | bit      | 1 = aparece en el menú, 0 = oculto                        |

**¿Por qué es importante?**
Esta tabla permite agregar un nuevo servicio a la Mesa de Servicio **sin tocar código**. Solo se hace un INSERT aquí y automáticamente aparece en el menú con su formulario configurado.

Actualmente tiene **17 servicios** configurados con sus tiempos SLA.

---

## 🎫 TICKETS DE INCIDENCIAS

### `solicitudTI` — La tabla principal de tickets

Cada fila es un ticket de soporte. Es la tabla central del sistema.

| Columna              | Tipo     | Descripción                                                      |
| -------------------- | -------- | ---------------------------------------------------------------- |
| `idSolicitud`        | int (PK) | Identificador único interno                                      |
| `folio`              | varchar  | Número visible para el usuario (ej. TI-00055)                    |
| `idUsuario`          | varchar  | Login del colaborador que abrió el ticket                        |
| `nombreUsuario`      | varchar  | Nombre completo del colaborador                                  |
| `areaUsuario`        | varchar  | Departamento del colaborador                                     |
| `sitioUsuario`       | varchar  | Planta o sitio donde trabaja (PFV, IAFSA, FDNC)                  |
| `idServicio`         | int (FK) | Servicio al que pertenece el ticket                              |
| `idPrioridad`        | int (FK) | Nivel de urgencia asignado                                       |
| `idEstatus`          | int (FK) | Estado actual del ticket                                         |
| `titulo`             | varchar  | Título breve del problema                                        |
| `descripcion`        | nvarchar | Descripción detallada del problema                               |
| `tecnicoAsignado`    | varchar  | Login del ingeniero de Sistemas asignado                         |
| `nombreTecnico`      | varchar  | Nombre del ingeniero asignado                                    |
| `escalaA`            | nvarchar | Nombre del proveedor externo si fue escalado (ej. "Multivisión") |
| `slaRespuestaHrs`    | decimal  | Horas SLA de respuesta (copiado del catálogo al crear)           |
| `slaResolucionHrs`   | decimal  | Horas SLA de resolución                                          |
| `fechaLimiteResp`    | datetime | Fecha y hora límite para dar primera respuesta                   |
| `fechaLimiteResol`   | datetime | Fecha y hora límite para resolver                                |
| `fechaCreacion`      | datetime | Cuándo se creó el ticket                                         |
| `fechaActualizacion` | datetime | Última vez que se modificó                                       |
| `fechaResolucion`    | datetime | Cuándo se marcó como resuelto                                    |
| `tiempoAtencionMin`  | int      | Minutos totales que tomó resolver (calculado automáticamente)    |

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

Guarda los archivos que los colaboradores o ingenieros adjuntan como evidencia.

| Columna         | Tipo     | Descripción                                         |
| --------------- | -------- | --------------------------------------------------- |
| `idArchivo`     | int (PK) | Identificador único                                 |
| `idSolicitud`   | int (FK) | A qué ticket pertenece                              |
| `nombreArchivo` | varchar  | Nombre original del archivo                         |
| `rutaServidor`  | varchar  | Ruta donde está guardado físicamente en el servidor |
| `mimeType`      | varchar  | Tipo de archivo (image/jpeg, application/pdf, etc.) |
| `tamanoBytes`   | bigint   | Tamaño del archivo en bytes                         |
| `fechaSubida`   | datetime | Cuándo se subió                                     |

> Los archivos físicos se guardan en `D:\IntranetAPI\uploads\solicitudes\` en el servidor.

---

### `solicitudTI_comentarios` — Mensajes del ticket

Hilo de conversación entre el colaborador y el ingeniero de Sistemas dentro del ticket.

| Columna         | Tipo     | Descripción                                                      |
| --------------- | -------- | ---------------------------------------------------------------- |
| `idComentario`  | int (PK) | Identificador único                                              |
| `idSolicitud`   | int (FK) | A qué ticket pertenece                                           |
| `idUsuario`     | varchar  | Login de quien escribió                                          |
| `nombreUsuario` | varchar  | Nombre de quien escribió                                         |
| `esInterno`     | bit      | 0 = comentario del colaborador · 1 = comentario del ingeniero TI |
| `comentario`    | nvarchar | Texto del mensaje                                                |
| `fecha`         | datetime | Cuándo se escribió                                               |

> En la interfaz, los comentarios del colaborador aparecen a la izquierda y los del ingeniero a la derecha, con colores diferentes.

---

### `solicitudTI_bitacora` — Notas técnicas internas

Notas que solo ve el equipo de Sistemas. El colaborador **no** puede ver esta información.

| Columna         | Tipo     | Descripción                              |
| --------------- | -------- | ---------------------------------------- |
| `idBitacora`    | int (PK) | Identificador único                      |
| `idSolicitud`   | int (FK) | A qué ticket pertenece                   |
| `idUsuario`     | varchar  | Login del ingeniero que escribió la nota |
| `nombreUsuario` | varchar  | Nombre del ingeniero                     |
| `nota`          | nvarchar | Texto de la nota técnica o diagnóstico   |
| `fecha`         | datetime | Cuándo se registró                       |

> Cuando se escala un ticket, el sistema registra automáticamente en esta tabla: _"Escalado a [proveedor]: [motivo]"_

---

### `solicitudTI_evaluacion` — Calificación del servicio

Guardá la evaluación que hace el colaborador después de que su ticket es resuelto.

| Columna         | Tipo     | Descripción                         |
| --------------- | -------- | ----------------------------------- |
| `idEvaluacion`  | int (PK) | Identificador único                 |
| `idSolicitud`   | int (FK) | A qué ticket pertenece              |
| `calificacion`  | tinyint  | Estrellas del 1 al 5                |
| `emoji`         | varchar  | Emoji asociado a la calificación    |
| `comentario`    | nvarchar | Comentario opcional del colaborador |
| `fechaRegistro` | datetime | Cuándo se evaluó                    |

> Si el colaborador reabre un ticket dentro de 48 horas, la evaluación se **elimina** para que pueda calificar nuevamente cuando se resuelva de nuevo.

---

## 💻 SOLICITUDES DE HARDWARE

### `solicitudHardware` — Solicitudes de equipo

Gestiona las solicitudes de dispositivos, periféricos y equipo de cómputo.

| Columna           | Tipo     | Descripción                                                         |
| ----------------- | -------- | ------------------------------------------------------------------- |
| `idSolicitud`     | int (PK) | Identificador único                                                 |
| `loginUsuario`    | varchar  | Login del colaborador solicitante _(columna agregada en migración)_ |
| `idEstatus`       | int      | Estado de la solicitud                                              |
| `motivo`          | nvarchar | Por qué necesita el equipo                                          |
| `fechaCreacion`   | datetime | Cuándo se creó la solicitud                                         |
| `tecnicoAsignado` | varchar  | Ingeniero asignado                                                  |

> Esta tabla tiene su propio sistema de artículos — cada solicitud puede pedir múltiples equipos y cada artículo tiene su propio estado de atención.

---

## 🔗 Relaciones entre tablas

```
cat_servicioTI ──────┐
cat_prioridad  ──────┤──→ solicitudTI ──→ solicitudTI_archivos
cat_estatusTI  ──────┘         │
                               ├──→ solicitudTI_comentarios
                               ├──→ solicitudTI_bitacora
                               └──→ solicitudTI_evaluacion

solicitudHardware (tabla independiente)
```

---

## 📝 Migraciones realizadas

Cambios que se hicieron a la base de datos durante el desarrollo:

```sql
-- 1. Agregar campo de login a solicitudes de hardware
ALTER TABLE solicitudHardware ADD loginUsuario VARCHAR(100) NULL;

-- 2. Agregar campos SLA a los servicios (más preciso en minutos)
ALTER TABLE cat_servicioTI ADD slaRespuestaMin INT NULL;
ALTER TABLE cat_servicioTI ADD slaResolucionMin INT NULL;
ALTER TABLE cat_servicioTI ADD idPrioridad INT NULL;

-- 3. Agregar campo de escalamiento a tickets
ALTER TABLE solicitudTI ADD escalaA NVARCHAR(200) NULL;

-- 4. Insertar estado "En diagnóstico"
INSERT INTO cat_estatusTI VALUES (7, 'En diagnóstico', '#f38ba8', 0);

-- 5. Insertar estado "Escalado"
INSERT INTO cat_estatusTI VALUES (8, 'Escalado', '#f38ba8', 0);

-- 6. Tabla de evaluaciones (creada completa)
CREATE TABLE solicitudTI_evaluacion (
    idEvaluacion  INT IDENTITY(1,1) PRIMARY KEY,
    idSolicitud   INT NOT NULL,
    calificacion  TINYINT NOT NULL,
    emoji         VARCHAR(10) NULL,
    comentario    NVARCHAR(500) NULL,
    fechaRegistro DATETIME DEFAULT GETDATE()
);
```

---

## ⚡ Consultas útiles para administración

```sql
-- Ver todos los tickets abiertos con su ingeniero
SELECT folio, nombreUsuario, areaUsuario, estatus, nombreTecnico, fechaCreacion
FROM solicitudTI s
JOIN cat_estatusTI e ON e.idEstatus = s.idEstatus
WHERE s.idEstatus NOT IN (4, 5)
ORDER BY fechaCreacion DESC;

-- Ver tickets con SLA vencido
SELECT folio, nombreUsuario, nombreTecnico, fechaLimiteResol
FROM solicitudTI
WHERE fechaLimiteResol < GETDATE()
AND idEstatus NOT IN (3, 4, 5);

-- Ver tickets escalados y a quién
SELECT folio, nombreUsuario, escalaA, fechaCreacion
FROM solicitudTI
WHERE idEstatus = 8;

-- Conteo de tickets por estado (para KPIs)
SELECT e.estatus, COUNT(*) as total
FROM solicitudTI s
JOIN cat_estatusTI e ON e.idEstatus = s.idEstatus
GROUP BY e.estatus
ORDER BY total DESC;

-- Ver evaluaciones recibidas
SELECT s.folio, s.nombreUsuario, ev.calificacion, ev.comentario, ev.fechaRegistro
FROM solicitudTI_evaluacion ev
JOIN solicitudTI s ON s.idSolicitud = ev.idSolicitud
ORDER BY ev.fechaRegistro DESC;
```

---

_Manual de Base de Datos — FABPSA Sistemas · Agosto 2026_

---

## 💻 HARDWARE — Tablas completas

### `catalogoHardware` — Catálogo de artículos disponibles

Define qué equipos y dispositivos se pueden solicitar en el sistema.

| Columna                | Tipo     | Descripción                                            |
| ---------------------- | -------- | ------------------------------------------------------ |
| `idArticulo`           | int (PK) | Identificador único del artículo                       |
| `nombreArticulo`       | varchar  | Nombre del equipo (ej. "Laptop", "Mouse", "Teclado")   |
| `categoria`            | varchar  | Agrupación del artículo (ej. "Cómputo", "Periféricos") |
| `activo`               | char     | S/N — si aparece disponible para solicitar             |
| `requiereAutorizacion` | char     | S/N — si necesita aprobación antes de entregarse       |

---

### `solicitudHardware` — Cabecera de la solicitud

Cada fila es una solicitud completa de hardware. Puede contener varios artículos.

| Columna         | Tipo     | Descripción                                                  |
| --------------- | -------- | ------------------------------------------------------------ |
| `idSolicitud`   | int (PK) | Identificador único interno                                  |
| `folio`         | varchar  | Número visible (ej. HW-00012)                                |
| `fechaRegistro` | datetime | Cuándo se creó la solicitud                                  |
| `usuario`       | varchar  | Nombre del colaborador solicitante                           |
| `loginUsuario`  | varchar  | Login del colaborador _(agregado en migración)_              |
| `departamento`  | varchar  | Departamento del solicitante                                 |
| `motivo`        | varchar  | Por qué necesita el equipo                                   |
| `observaciones` | varchar  | Notas adicionales del solicitante                            |
| `estatus`       | varchar  | Estado actual (Pendiente, En proceso, Completada, Rechazada) |

---

### `solicitudHardwareDetalle` — Artículos de cada solicitud

Una solicitud puede pedir varios equipos distintos. Cada artículo es una fila aquí.

| Columna                | Tipo     | Descripción                                                        |
| ---------------------- | -------- | ------------------------------------------------------------------ |
| `idDetalle`            | int (PK) | Identificador único del renglón                                    |
| `idSolicitud`          | int (FK) | A qué solicitud pertenece                                          |
| `idArticulo`           | int (FK) | Qué artículo del catálogo se pidió                                 |
| `folio`                | varchar  | Folio de la solicitud padre                                        |
| `cantidad`             | int      | Cuántas unidades se solicitan                                      |
| `estatusDetalle`       | varchar  | Estado individual del artículo (puede diferir del estatus general) |
| `fechaEstimadaEntrega` | datetime | Cuándo se estima entregar ese artículo                             |
| `observacionAtencion`  | varchar  | Nota del ingeniero sobre ese artículo específico                   |
| `fechaActualizacion`   | datetime | Última vez que se modificó este renglón                            |
| `usuarioAtendio`       | varchar  | Login del ingeniero que atendió este artículo                      |

> Esta tabla es la que genera la **barra de progreso** que ves en la vista del colaborador — cuenta cuántos artículos están en cada estado y lo muestra visualmente.

---

### `solicitudHardwareComentarios` — Mensajes de la solicitud

Hilo de conversación e historial de eventos dentro de cada solicitud de hardware.

| Columna         | Tipo     | Descripción                                                             |
| --------------- | -------- | ----------------------------------------------------------------------- |
| `id`            | int (PK) | Identificador único                                                     |
| `folio`         | varchar  | Folio de la solicitud a la que pertenece                                |
| `login`         | varchar  | Login de quien escribió                                                 |
| `nombre`        | varchar  | Nombre de quien escribió                                                |
| `rol`           | varchar  | "Usuario" o "Ingeniero TI"                                              |
| `mensaje`       | nvarchar | Texto del comentario o evento                                           |
| `esEvento`      | bit      | 0 = comentario real · 1 = evento del sistema (ej. "Solicitud asignada") |
| `fechaCreacion` | datetime | Cuándo se registró                                                      |

> Los eventos del sistema (`esEvento = 1`) se muestran diferentes a los comentarios reales en la interfaz — son entradas automáticas como "Estado cambiado a En proceso" o "Artículo entregado".

---

### `solicitudHardwareEvaluacion` — Calificación del servicio de hardware

Evaluación que hace el colaborador cuando su solicitud de hardware es completada.

| Columna           | Tipo     | Descripción                                             |
| ----------------- | -------- | ------------------------------------------------------- |
| `id`              | int (PK) | Identificador único                                     |
| `folio`           | varchar  | Folio de la solicitud evaluada                          |
| `login`           | varchar  | Login del colaborador que evaluó                        |
| `resuelta`        | bit      | 1 = el colaborador confirma que quedó resuelto          |
| `calificacion`    | tinyint  | Estrellas del 1 al 5                                    |
| `tiempoRespuesta` | varchar  | Percepción del tiempo ("Rápido", "Aceptable", "Lento")  |
| `atencionAmable`  | bit      | 1 = el colaborador considera que la atención fue amable |
| `comentario`      | nvarchar | Comentario libre opcional                               |
| `fechaEval`       | datetime | Cuándo se evaluó                                        |

> Esta evaluación es más detallada que la de incidencias — incluye percepción del tiempo de respuesta y trato del ingeniero, además de las estrellas.

---

## 🔗 Relaciones del módulo Hardware

```
catalogoHardware
      ↓
solicitudHardware ──→ solicitudHardwareDetalle (un artículo por fila)
      │
      ├──→ solicitudHardwareComentarios (mensajes y eventos)
      └──→ solicitudHardwareEvaluacion  (calificación final)
```

---

## 📊 Mapa completo actualizado

```
CATÁLOGOS
├── cat_estatusTI
├── cat_prioridad
├── cat_servicioTI
└── catalogoHardware          ← catálogo de equipos

INCIDENCIAS TI
├── solicitudTI
├── solicitudTI_archivos
├── solicitudTI_comentarios
├── solicitudTI_bitacora
└── solicitudTI_evaluacion

HARDWARE
├── solicitudHardware
├── solicitudHardwareDetalle
├── solicitudHardwareComentarios
└── solicitudHardwareEvaluacion
```

**Total de tablas documentadas: 13**

---

_Actualización: Hardware completo agregado — FABPSA Sistemas · Agosto 2026_
