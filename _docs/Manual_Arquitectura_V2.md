# 🏗️ FABPSA Intranet v4 — Manual de Arquitectura
**Versión:** 2.0 · **Fecha:** Agosto 2026 · **Desarrollador:** Juanma Ramírez · **Área:** Sistemas FABPSA

---

## 📁 Estructura general del proyecto

El proyecto está dividido en dos carpetas principales dentro del repositorio:

| Carpeta | Qué es |
|---------|--------|
| `client/` | La aplicación web que ve el usuario (React) |
| `server/` | El servidor que procesa datos y se conecta a la base de datos (Node.js) |

---

## 🖥️ FRONTEND — `client/src/`

Todo lo que el usuario ve en pantalla vive aquí.

---

### 📦 `components/` — Piezas reutilizables

Componentes que se usan en múltiples páginas. No son páginas completas, son bloques.

| Archivo | Qué hace |
|---------|----------|
| `Navbar.jsx` | Barra superior de navegación con nombre del usuario, logo y accesos rápidos |
| `Sidebar.jsx` | Menú lateral colapsable con navegación principal, toggle dark/light y popovers de contacto de Sistemas |
| `Footer.jsx` | Pie de página con versión, año y links legales |
| `ProtectedRoute.jsx` | Guardia de rutas — si el usuario no tiene sesión, lo redirige al login |
| `PageLoader.jsx` | Pantalla de carga animada que aparece mientras se obtienen datos |
| `QuickAccess.jsx` | Panel de accesos rápidos en el inicio |
| `Hero.jsx` | Banner de bienvenida en la página de inicio |
| `Birthdays.jsx` | Widget de cumpleaños de colaboradores |

---

### 🔐 `context/`

| Archivo | Qué hace |
|---------|----------|
| `AuthContext.jsx` | Maneja la sesión del usuario. Guarda el token JWT en `localStorage` bajo la clave `fabpsa_token`. Provee `user` (nombre, área, sitio, rol) a toda la app mediante `AuthProvider` |

> **Nota:** No existe un hook `useAuth`. Se accede con `useContext(AuthContext)` directamente.

---

### 🪝 `hooks/`

| Archivo | Qué hace |
|---------|----------|
| `useServicioConfig.js` | Hook que consulta la configuración de un servicio de TI por su `slug`. Devuelve colores, íconos, campos del formulario, prioridades y textos de ayuda. Permite que agregar un nuevo servicio solo requiera un INSERT en la base de datos |

---

### 📄 `pages/` — Páginas de la aplicación

Cada carpeta es una sección de la intranet.

---

#### 🏠 Página de inicio
| Archivo | Qué hace |
|---------|----------|
| `HomePage.jsx` | Página de bienvenida con widgets (cumpleaños, accesos rápidos, noticias) |

---

#### 🎫 `mesaServicio/` — Módulo Mesa de Servicio TI

El corazón de la aplicación. Gestión completa de tickets de soporte.

---

##### 📋 `paginaPrincipal/`
| Archivo | Qué hace |
|---------|----------|
| `MesaDeServicioPag...jsx` | Página de entrada al módulo. Muestra las categorías de servicios disponibles (Incidencias, Hardware, Desarrollo, etc.) con sus íconos y colores. Cada categoría lleva a su formulario correspondiente |

---

##### 📝 `solicitudServicio/` — Formulario de nueva solicitud
| Archivo | Qué hace |
|---------|----------|
| `MesaDeServicioAdm...jsx` | Formulario dinámico para crear tickets. Lee la configuración del servicio via `useServicioConfig`. Tiene 3 pasos (Stepper): Categoría → Detalle → Confirmación. Incluye upload de evidencias, selección de prioridad y validación. Al enviar muestra pantalla de éxito con folio |

---

##### 👤 `solicitudesUsuario/` — Vista del colaborador
| Archivo | Qué hace |
|---------|----------|
| `MisSolicitudesPage.jsx` | Vista principal del colaborador. Muestra todos sus tickets en dos tabs: **Incidencias** y **Hardware**. Incluye KPIs dinámicos, panel expandible con 4 tabs (Información, Evidencias, SLA con anillos animados, Comentarios), upload de evidencias adicionales, flujo de evaluación con estrellas, modal de cierre y botón de reapertura dentro de 48h |
| `HardwareMisSolicitudes.jsx` | Subcomponente para la tab de Hardware. Muestra solicitudes de equipo con barra de progreso por artículo, hilo de actividad y evaluación al completarse |

---

##### 🔧 `atencionIncidencias/` — Vista del equipo de Sistemas TI
| Archivo | Qué hace |
|---------|----------|
| `AtencionIncidenciasPage.jsx` | Panel de administración de tickets. **Es el módulo más completo del sistema.** Incluye: KPIs en tiempo real (Abiertas, En proceso, Sin asignar, Por vencer, Vencidas, Resueltas hoy), grid de tickets con acciones rápidas, panel expandible con 5 tabs (Información general, Evidencias, SLA, Comentarios, Evaluación del usuario), barra de acciones (Asignarme, Cambiar estado, Cambiar prioridad, Transferir, Escalar, Marcar resuelto), modal de escalamiento con campo de proveedor y motivo, bloqueo de acciones en tickets cerrados +48h, exportación a Excel, filtros por estado/prioridad/ingeniero/fechas, paginación sticky |

---

##### 💻 `hardware/` — Gestión de solicitudes de hardware
| Archivo | Qué hace |
|---------|----------|
| `HardwareSolicitudesPage.jsx` | Panel admin para gestionar solicitudes de hardware. Muestra artículos solicitados con estado individual, paginación sticky optimizada (query única en lugar de N+1) |

---

#### 📰 `CulturaDigitalPage.jsx`
Página editorial con contenido de cultura digital y tecnología para colaboradores, con estructura similar al newsletter Insight FABPSA.

#### 🎂 `AplicativosPage.jsx`
Catálogo de aplicativos y herramientas disponibles para los colaboradores.

---

## ⚙️ BACKEND — `server/`

El servidor que recibe peticiones del frontend, valida permisos y consulta la base de datos Azure SQL.

**Puerto:** `3001`  
**Gestor de procesos:** PM2 (`pm2 restart fabpsa-api`)  
**Base de datos:** Azure SQL Server — `DB_RHFABPSA`  
**Conexión:** `getPool()` + `sql` exportados desde `db.js`

---

### 🛣️ `routes/` — Rutas de la API

Define qué URLs existen y qué función las atiende.

| Archivo | Prefijo de ruta | Qué maneja |
|---------|----------------|------------|
| `solicitudes.routes.js` | `/api/solicitudes` | Creación de tickets por el usuario (POST con FormData + archivos) |
| `solicitudesAdmin.routes.js` | `/api/mesa-admin` | Todo el panel de administración de TI: KPIs, listado, detalle, asignar, cambiar estado, prioridad, transferir, escalar, comentarios, bitácora, técnicos |
| `solicitudesUsuario.routes.js` | `/api/solicitudes-usuario` | Endpoints del colaborador: mis tickets, detalle, evidencias, evaluación, cerrar, reabrir, comentarios |
| `hardwareUsuario.routes.js` | `/api/solicitudes-usuario/hardware` | KPIs de hardware del usuario, listado, detalle, comentarios |
| `hardware.routes.js` | `/api/hardware` | Panel admin de hardware: listado, detalle, cambio de estado por artículo |
| `servicios.routes.js` | `/api/servicios` | Catálogo de servicios TI con su configuración para el formulario dinámico |
| `sistemasAdmin.routes.js` | `/api/sistemas-admin` | Endpoints administrativos generales |

---

### 🧠 `services/` — Lógica de negocio

Aquí vive toda la lógica: queries SQL, cálculos, validaciones.

| Archivo | Qué hace |
|---------|----------|
| `solicitudesAdmin.service.js` | Lógica del panel TI. Funciones: `getKPIs`, `getSolicitudes` (con filtros + paginación), `getSolicitudDetalle` (con archivos, comentarios, bitácora y evaluación), `asignar`, `cambiarEstatus` (valida que el ingeniero esté asignado antes de resolver), `cambiarPrioridad`, `agregarComentario`, `agregarBitacora`, `getTecnicosSistemas`, `transferir`, `escalar` (cambia a estatus 8 + guarda `escalaA` + registra en bitácora) |
| `solicitudesUsuario.service.js` | Lógica del colaborador. Funciones: mis tickets, detalle (con JOIN a evaluación), subir evidencias, guardar evaluación, cerrar ticket, reabrir ticket (borra evaluación previa) |
| `solicitudes.service.js` | Creación de nuevos tickets. Calcula SLA según `cat_servicioTI`, genera folio, guarda archivos en `D:\IntranetAPI\uploads\solicitudes\` |
| `servicios.service.js` | Devuelve la configuración completa de un servicio por slug para el formulario dinámico |
| `mailer.js` | Configuración de envío de correos (notificaciones) |

---

### 🎮 `controllers/` — Puente entre rutas y servicios

Reciben la petición HTTP, extraen parámetros, llaman al service y devuelven la respuesta.

| Archivo | Qué controla |
|---------|-------------|
| `solicitudesAdmin.controller.js` | Panel TI — valida parámetros, pasa `req.user` (ingeniero autenticado) al service |
| `solicitudesUsuario.controller.js` | Vista colaborador |
| `solicitudes.controller.js` | Creación de tickets |
| `servicios.controller.js` | Catálogo de servicios |

---

### 🔒 `middleware/`

| Archivo | Qué hace |
|---------|----------|
| `auth.js` | Valida el token JWT en cada petición. Lee `fabpsa_token` del header `Authorization: Bearer`. Si el token es inválido o expiró devuelve 401. Inyecta `req.user` con `{ login, name, email, role, sitio, area }` |

---

### 🗄️ `db.js`

Configura y exporta el pool de conexiones a Azure SQL Server usando `mssql/tedious`. Exporta `{ getPool, sql }` para usar en los services.

---

## 🗃️ Base de datos — Tablas principales

| Tabla | Qué guarda |
|-------|-----------|
| `solicitudTI` | Todos los tickets de incidencias. Columnas clave: `idSolicitud`, `folio`, `idEstatus`, `tecnicoAsignado`, `nombreTecnico`, `escalaA`, `slaRespuestaHrs`, `slaResolucionHrs`, `fechaLimiteResp`, `fechaLimiteResol`, `tiempoAtencionMin` |
| `solicitudTI_archivos` | Archivos adjuntos a los tickets |
| `solicitudTI_comentarios` | Hilo de mensajes entre usuario e ingeniero. Campo `esInterno` diferencia usuario (0) de TI (1) |
| `solicitudTI_bitacora` | Notas técnicas internas del equipo de Sistemas |
| `solicitudTI_evaluacion` | Calificación del usuario al servicio. Columnas: `idEvaluacion`, `idSolicitud`, `calificacion`, `emoji`, `comentario`, `fechaRegistro` |
| `solicitudHardware` | Solicitudes de equipo. Incluye `loginUsuario` |
| `cat_estatusTI` | Catálogo de estados. IDs activos: 1 Abierto, 2 En progreso, 3 Resuelto, 4 Cerrado, 5 Cancelado, 7 En diagnóstico, 8 Escalado |
| `cat_servicioTI` | Catálogo de servicios con `slug`, `slaRespuestaMin`, `slaResolucionMin`, `idPrioridad`, `icono`, `colorPrimario` |
| `cat_prioridad` | Baja, Media, Alta, Crítica con colores y tiempos SLA |

---

## 🔑 Constantes técnicas clave

| Dato | Valor |
|------|-------|
| Token JWT | `localStorage.getItem("fabpsa_token")` |
| Backend en local | `http://localhost:3001` |
| Backend en red interna | `http://192.168.16.198:3001` |
| Backend en acceso externo | `http://201.151.218.138:3001` |
| Archivos subidos | `D:\IntranetAPI\uploads\solicitudes\` |
| Colores del sistema | `--primary`: #4cc9a6 (mint) · `--secondary`: #7c8cf8 (violet) |
| Iconos | Tabler Icons exclusivamente (`ti-*`) |
| Comando de reinicio | `pm2 restart fabpsa-api` |

---

## 🚦 Flujo de un ticket — De principio a fin

```
Colaborador abre formulario
        ↓
Selecciona servicio → useServicioConfig carga config
        ↓
Llena título, descripción, prioridad, adjunta evidencias
        ↓
POST /api/solicitudes → se crea ticket con folio TI-XXXXX
        ↓
Ingeniero ve ticket en AtencionIncidenciasPage
        ↓
Se asigna → Cambia estado → Agrega notas en bitácora
        ↓
Si requiere proveedor externo → Escala (estatus 8 + escalaA)
        ↓
Marca como Resuelto (requiere estar asignado)
        ↓
Colaborador evalúa con estrellas (1-5) + comentario opcional
        ↓
Colaborador confirma cierre → estatus 4 (Cerrado)
        ↓
Si el problema regresa → Reabre dentro de 48h → ciclo reinicia
```

---

*Manual generado automáticamente — FABPSA Sistemas · 2026*
