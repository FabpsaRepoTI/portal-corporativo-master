# 🔔 Centro de Notificaciones FABPSA — Resumen completo
**Módulo:** Centro de Notificaciones · **Estado:** ✅ Funcional  
**Fecha:** Agosto 2026 · **Área:** Sistemas FABPSA

---

## ¿Qué es?

El Centro de Notificaciones es el sistema que avisa a los colaboradores e ingenieros en tiempo real cuando algo relevante ocurre en sus tickets. Aparece como un ícono de campana (🔔) en la barra superior de la Intranet con un badge animado que muestra cuántas notificaciones no leídas hay.

---

## 🗄️ Base de datos — Tablas

### `cat_tipoNotificacion` — Catálogo de tipos de notificación

Define los 13 tipos de eventos que pueden generar una notificación.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `idTipo` | int (PK) | Identificador único del tipo |
| `nombre` | varchar | Nombre del evento (ej. "Ticket asignado") |
| `icono` | varchar | Ícono Tabler que se muestra en la notificación |
| `colorHex` | varchar | Color del ícono según el tipo de evento |
| `activo` | bit | 1 = tipo activo y en uso |

**Los 13 tipos configurados (IDs 1–13):**

| ID | Evento |
|----|--------|
| 1 | Ticket creado |
| 2 | Ticket asignado a ingeniero |
| 3 | Cambio de estado del ticket |
| 4 | Nuevo comentario recibido |
| 5 | SLA próximo a vencer |
| 6 | SLA vencido |
| 7 | Ticket escalado |
| 8 | Cambio de prioridad |
| 9 | Ticket transferido a otro ingeniero |
| 10 | Ticket resuelto |
| 11 | Ticket cerrado |
| 12 | Ticket reabierto |
| 13 | Evaluación recibida |

---

### `notificacionTI` — Notificaciones generadas

Cada fila es una notificación enviada a un usuario específico.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `idNotificacion` | int (PK) | Identificador único |
| `loginDestino` | varchar | Login del usuario que recibe la notificación |
| `loginOrigen` | varchar | Login de quien generó la acción (puede ser null si es automático) |
| `idTipo` | int (FK) | Tipo de notificación del catálogo |
| `idSolicitud` | int (FK) | Ticket relacionado (puede ser null) |
| `titulo` | varchar | Título corto de la notificación |
| `descripcion` | varchar | Texto descriptivo del evento |
| `urlDestino` | varchar | Ruta a la que lleva al hacer clic (ej. `/mesa-de-servicio/mis-solicitudes?folio=TI-00055`) |
| `leida` | bit | 0 = no leída · 1 = leída |
| `fechaCreacion` | datetime | Cuándo se generó |
| `fechaLeida` | datetime | Cuándo la marcó como leída |

**Índices creados para rendimiento:**
- `loginDestino` — para cargar rápido las notificaciones de un usuario
- `idSolicitud` — para relacionar notificaciones con un ticket específico

---

## ⚙️ Arquitectura técnica

### Flujo de una notificación

```
Ingeniero hace una acción en un ticket
(asignar, cambiar estado, escalar, comentar, etc.)
              ↓
solicitudesAdmin.service.js llama crearNotificacion()
              ↓
notificaciones.service.js inserta en notificacionTI
              ↓
sse.manager.js emite el evento por SSE al usuario destino
              ↓
El badge de la campana se actualiza en tiempo real
              ↓
El usuario ve el toast en la esquina inferior derecha
```

---

### Archivos del backend

| Archivo | Ubicación | Qué hace |
|---------|-----------|----------|
| `sse.manager.js` | `server/` | Singleton que mantiene un Map de conexiones SSE activas. Cuando llega una notificación nueva, busca la conexión del usuario destino y emite el evento directamente. |
| `notificaciones.service.js` | `services/` | CRUD completo de notificaciones. Contiene la constante `TIPOS` (1–13) y la función `crearNotificacion()` que insertan en DB y disparan SSE. |
| `notificaciones.routes.js` | `routes/` | Expone los endpoints REST y el endpoint de stream SSE. Incluye headers CORS específicos para SSE. |

**Endpoints disponibles:**

| Método | Ruta | Qué hace |
|--------|------|----------|
| `GET` | `/api/notificaciones` | Lista notificaciones del usuario autenticado |
| `GET` | `/api/notificaciones/stream` | Abre conexión SSE (token por query param) |
| `PUT` | `/api/notificaciones/:id/leida` | Marca una notificación como leída |
| `PUT` | `/api/notificaciones/leer-todas` | Marca todas como leídas |
| `DELETE` | `/api/notificaciones/:id` | Elimina una notificación |

---

### Archivos del frontend

| Archivo | Ubicación | Qué hace |
|---------|-----------|----------|
| `useNotifications.js` | `hooks/` | Hook que gestiona el estado de notificaciones. Hace polling cada 15 segundos como fallback. SSE bloqueado en desarrollo por CORS (pendiente resolver en producción). |
| `NotificationBell.jsx` | `components/` | Ícono de campana con badge animado y dropdown. Usa Portal para renderizar fuera del DOM principal. |
| `NotificationPanel.jsx` | `components/` | Lista agrupada por fecha: Hoy / Ayer / Esta semana. Permite marcar como leída y eliminar individualmente. |
| `NotificationToast.jsx` | `components/` | Toast en esquina inferior derecha con sonido (Web Audio API). Se autocierra en 4.5 segundos. |
| `NotificationBell.css` | `components/` | Estilos del sistema de notificaciones |

---

## 🔗 Integración con Mesa de Servicio

La función `crearNotificacion()` está integrada en `solicitudesAdmin.service.js` y se dispara automáticamente en estas acciones:

| Acción del ingeniero | Notificación generada | Destinatario |
|---------------------|----------------------|--------------|
| Asignar ticket | "Ticket asignado" | Colaborador |
| Cambiar estado | "Estado actualizado" | Colaborador |
| Escalar ticket | "Ticket escalado" | Colaborador |
| Cambiar prioridad | "Prioridad cambiada" | Colaborador |
| Agregar comentario | "Nuevo comentario" | Colaborador |

---

## 🚧 Pendientes identificados

| # | Pendiente | Descripción |
|---|-----------|-------------|
| 1 | **CORS SSE en producción** | El stream SSE está bloqueado en desarrollo. En producción hay que configurar los headers CORS correctamente para reemplazar el polling de 15s por notificaciones en tiempo real. |
| 2 | **Notificaciones usuario → TI** | Cuando el colaborador comenta o reabre un ticket, debería notificar al equipo de Sistemas. Falta integrar `crearNotificacion()` en `solicitudesUsuario.service.js`. |
| 3 | **Job de SLA próximo a vencer** | El tipo 5 ("SLA próximo a vencer") está definido en el catálogo pero no hay ningún job o cron que lo dispare. Requiere un proceso programado que revise tickets próximos a vencer y genere la notificación. |

---

## 🔗 Relación con otras tablas

```
cat_tipoNotificacion
        ↓
notificacionTI ──→ solicitudTI (via idSolicitud)
                └──→ sec_users  (via loginDestino / loginOrigen)
```

---




