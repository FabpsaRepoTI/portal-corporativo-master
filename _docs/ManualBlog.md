# Manual del Módulo — Hub de Cultura Digital

**Portal Corporativo v4 — FABPSA**  
Versión: 1.0  
Fecha: Agosto 2026  
Autor: Juanma Ramírez

---

## ¿Qué es este módulo?

El Hub de Cultura Digital es un blog corporativo interno integrado al Portal Corporativo v4 de FABPSA. Permite publicar artículos sobre tecnología, NOM-035, ciberseguridad, vida sana e industria, con interacciones de usuarios (likes, comentarios), encuestas mensuales, trivia y tips semanales.

El modelo editorial funciona como una **revista mensual**: cada mes se activa una nueva edición con contenido fresco, mientras las ediciones anteriores quedan disponibles en el archivo histórico.

---

## Stack tecnológico

| Capa          | Tecnología                                           |
| ------------- | ---------------------------------------------------- |
| Frontend      | React + Vite (puerto 3000 / 3550 producción)         |
| Backend       | Node.js + Express (puerto 3001, PM2 `fabpsa-api`)    |
| Base de datos | Azure SQL Server (`DB_RHFABPSA`)                     |
| Servidor web  | IIS con `web.config` reverse proxy                   |
| Autenticación | JWT almacenado en `localStorage` como `fabpsa_token` |
| Archivos      | Multer → carpeta `/uploads/blog/`                    |

---

## Estructura de archivos

```
server/
  services/
    blog.service.js          — CRUD de ediciones, artículos, likes, comentarios, encuestas
    blog.trivia.service.js   — CRUD de trivia y tips
  routes/
    blog.routes.js           — Endpoints REST del blog principal
    blog.trivia.routes.js    — Endpoints REST de trivia y tips

src/pages/blog/
  BlogPage.jsx               — Vista pública del blog (todos los usuarios)
  BlogAdminPage.jsx          — Panel de administración (solo área SISTEMAS)
```

---

## Rutas del sistema

### Rutas web (React Router)

| Ruta                     | Componente          | Acceso             |
| ------------------------ | ------------------- | ------------------ |
| `/cultura-digital`       | `BlogPage.jsx`      | Todos los usuarios |
| `/cultura-digital/admin` | `BlogAdminPage.jsx` | Solo área SISTEMAS |

### Endpoints API

#### Ediciones

| Método | Endpoint                          | Descripción                  | Acceso   |
| ------ | --------------------------------- | ---------------------------- | -------- |
| GET    | `/api/blog/edicion/activa`        | Edición pública actual       | Todos    |
| GET    | `/api/blog/ediciones`             | Lista de todas las ediciones | Todos    |
| POST   | `/api/blog/ediciones`             | Crear nueva edición          | SISTEMAS |
| PUT    | `/api/blog/ediciones/:id/activar` | Activar edición              | SISTEMAS |
| DELETE | `/api/blog/ediciones/:id`         | Eliminar edición (no activa) | SISTEMAS |

#### Artículos

| Método | Endpoint                                 | Descripción                              | Acceso   |
| ------ | ---------------------------------------- | ---------------------------------------- | -------- |
| GET    | `/api/blog/articulos?idEdicion=1`        | Artículos publicados de una edición      | Todos    |
| GET    | `/api/blog/articulos/:id`                | Detalle completo con likes y comentarios | Todos    |
| GET    | `/api/blog/archivo`                      | Historial de ediciones                   | Todos    |
| GET    | `/api/blog/admin/articulos?idEdicion=1`  | Lista admin (incluye borradores)         | SISTEMAS |
| GET    | `/api/blog/admin/articulos/:id/detalle`  | Detalle completo para editar             | SISTEMAS |
| POST   | `/api/blog/admin/articulos`              | Crear artículo (multipart/form-data)     | SISTEMAS |
| PUT    | `/api/blog/admin/articulos/:id`          | Editar artículo                          | SISTEMAS |
| PUT    | `/api/blog/admin/articulos/:id/publicar` | Cambiar estatus a publicado              | SISTEMAS |

#### Interacciones

| Método | Endpoint                                  | Descripción        | Acceso   |
| ------ | ----------------------------------------- | ------------------ | -------- |
| POST   | `/api/blog/articulos/:id/like`            | Toggle like/unlike | Todos    |
| POST   | `/api/blog/articulos/:id/comentarios`     | Agregar comentario | Todos    |
| PUT    | `/api/blog/admin/comentarios/:id/moderar` | Ocultar comentario | SISTEMAS |

#### Encuestas

| Método | Endpoint                         | Descripción                    | Acceso   |
| ------ | -------------------------------- | ------------------------------ | -------- |
| GET    | `/api/blog/encuesta?idEdicion=1` | Encuesta activa con resultados | Todos    |
| POST   | `/api/blog/encuestas/:id/votar`  | Registrar voto                 | Todos    |
| POST   | `/api/blog/admin/encuestas`      | Crear encuesta                 | SISTEMAS |

#### Trivia

| Método | Endpoint                                  | Descripción                            | Acceso   |
| ------ | ----------------------------------------- | -------------------------------------- | -------- |
| GET    | `/api/blog/trivia?idEdicion=1`            | Trivia activa (con estado del usuario) | Todos    |
| POST   | `/api/blog/trivia/:id/responder`          | Enviar respuestas                      | Todos    |
| GET    | `/api/blog/trivia/:id/ranking`            | Ranking de perfectos                   | Todos    |
| GET    | `/api/blog/admin/trivia?idEdicion=1`      | Lista admin                            | SISTEMAS |
| POST   | `/api/blog/admin/trivia`                  | Crear trivia                           | SISTEMAS |
| GET    | `/api/blog/admin/trivia/:id/estadisticas` | Estadísticas de respuestas             | SISTEMAS |

#### Tips

| Método | Endpoint                          | Descripción                      | Acceso   |
| ------ | --------------------------------- | -------------------------------- | -------- |
| GET    | `/api/blog/tips/activo`           | Tip actual (más reciente activo) | Todos    |
| GET    | `/api/blog/admin/tips`            | Lista de todos los tips          | SISTEMAS |
| POST   | `/api/blog/admin/tips`            | Crear tip                        | SISTEMAS |
| PUT    | `/api/blog/admin/tips/:id/toggle` | Activar/desactivar tip           | SISTEMAS |
| DELETE | `/api/blog/admin/tips/:id`        | Eliminar tip                     | SISTEMAS |

---

## Flujo editorial mensual

El proceso completo para publicar una nueva edición toma aproximadamente 45 minutos:

```
1. PREPARACIÓN (antes del mes)
   ├── Colaborador envía temas por Teams
   ├── Jefe de Sistemas genera borradores con Claude
   └── Se preparan 4–6 artículos y la trivia

2. CREACIÓN (día 1 del mes)
   ├── Entrar a /cultura-digital/admin
   ├── Click en "+ Nueva edición" → seleccionar mes y año
   ├── Crear artículos (tab Artículos → + Artículo)
   │     ├── Pegar título, extracto y contenido HTML
   │     ├── Seleccionar categoría y subir foto
   │     ├── Marcar el artículo principal como "Destacado"
   │     └── Click en "Publicar"
   ├── Crear encuesta (tab Encuesta → + Encuesta)
   ├── Crear trivia (tab Trivia → + Trivia)
   └── Crear tip (tab Tips → + Tip)

3. ACTIVACIÓN
   ├── En el sidebar izquierdo, seleccionar la nueva edición
   ├── Click en "⚡ Activar" → confirmar
   └── La edición anterior pasa al archivo automáticamente

4. VERIFICACIÓN
   └── Entrar a /cultura-digital como usuario normal y confirmar que todo se ve bien
```

---

## Panel de administración — `BlogAdminPage.jsx`

### Acceso

Solo usuarios con `area === 'SISTEMAS'` en el token JWT. Cualquier otro usuario ve pantalla de acceso restringido.

### Estructura visual

```
┌─────────────────┬──────────────────────────────────┐
│  EDICIONES      │  [Tabs: Artículos | Encuesta |   │
│                 │         Trivia | Tips]            │
│  ● Agosto 2026  │                                  │
│    ACTIVA       │  Contenido del tab seleccionado  │
│                 │                                  │
│  ○ Julio 2026   │                                  │
│    [Activar][🗑]│                                  │
└─────────────────┴──────────────────────────────────┘
```

### Tab Artículos

- Tabla con todos los artículos de la edición seleccionada (borradores y publicados)
- Badge de color por estatus: verde = publicado, amarillo = borrador
- ⭐ indica el artículo destacado (hero de portada)
- Botón "Editar" abre el modal con todos los campos pre-cargados
- Botón "Publicar" aparece solo en borradores

### Modal de artículo

Campos disponibles al crear o editar:

- **Título** (obligatorio, máx 200 caracteres)
- **Categoría** (selector con las 6 categorías)
- **Autor** (nombre libre o login)
- **Extracto** (obligatorio, máx 500 caracteres — aparece en la card)
- **Contenido** (obligatorio — HTML básico o texto plano)
- **Tiempo de lectura** (minutos estimados)
- **Foto de portada** (JPG/PNG/WebP, máx 5 MB — preview inmediato)
- **Destacado** (toggle — solo un artículo debería estar activo como destacado)

Dos acciones posibles: **Guardar borrador** o **Publicar**.

### Tab Encuesta

Muestra la encuesta activa de la edición con resultados en barras de progreso y conteo de votos. Si no existe, botón para crear una nueva con pregunta y mínimo 2 opciones.

### Tab Trivia

Muestra la trivia de la edición. Al hacer click en "Ver estadísticas" carga:

- Número total de participantes
- Cuántos sacaron puntaje perfecto
- Promedio de aciertos
- Distribución de respuestas por opción en cada pregunta (con barra de progreso)

### Tab Tips

Lista de todos los tips con:

- Ícono, texto, categoría y fecha de inicio
- Botón de toggle activo/inactivo (color verde/gris)
- Botón eliminar con confirmación nativa del navegador

### Gestión de ediciones

- El sidebar izquierdo lista todas las ediciones ordenadas por fecha descendente
- La edición activa muestra chip verde "ACTIVA" — no puede eliminarse
- Las ediciones inactivas muestran botones "⚡ Activar" y "🗑 Eliminar"
- Al activar: se desactiva la anterior automáticamente (transacción SQL)
- Al eliminar: confirmación con advertencia → borra en cascada todos los datos

---

## Vista pública — `BlogPage.jsx`

### Componentes del layout

```
┌─────────────────────────────────────────────────────┐
│  Logo FABPSA  ¡Hola, [Nombre]! 👋          [Archivo]│
│  Bienvenid@ al Blog · Edición Agosto 2026   [Admin] │
├──────────────────────────────────────────────────────┤
│  ● Todos  ● Tecnología  ● Ciberseguridad  ● NOM-035 │
├─────────────────────────┬────────────────────────────┤
│                         │  💡 Tip de la semana       │
│  🦸 HERO (destacado)    │  🎯 Trivia del mes         │
│                         │  📊 Encuesta               │
│  📝 Grid 2x2            │  🔥 Más leídos             │
│                         │  🏷️ Categorías             │
│  📄 Artículos wide      │                            │
└─────────────────────────┴────────────────────────────┘
```

### Saludo personalizado

El encabezado detecta el primer nombre del usuario desde `user.name` (AuthContext) y determina el género por la última letra:

- Termina en 'a' → "Bienvenida"
- Cualquier otra → "Bienvenido"

El nombre aparece con degradado mint → violeta usando `linear-gradient` con `WebkitBackgroundClip: text`.

### Hero (artículo destacado)

El artículo con `destacado = 1` ocupa el banner principal con overlay gradiente oscuro. Si no hay artículo destacado, se usa el primero de la lista. Incluye botón de like directo sin necesidad de abrir el artículo.

### Filtrado por categoría

El nav superior filtra los artículos en el cliente sin petición al servidor. El filtrado actualiza hero, grilla y artículos wide simultáneamente.

### Modal de artículo

Al hacer click en cualquier card o artículo wide se hace fetch a `/api/blog/articulos/:id` que devuelve el artículo completo con comentarios. El modal incluye:

- Foto de portada (si existe) con overlay
- Contenido renderizado como HTML con `dangerouslySetInnerHTML`
- Botón de like con estado sincronizado entre modal y card de la lista
- Lista de comentarios con avatar generado por iniciales
- Campo de texto para nuevo comentario (Ctrl+Enter para enviar rápido)

### Tip de la semana

Widget en sidebar con borde izquierdo mint, emoji gigante semitransparente de fondo y texto en itálica entre comillas. Carga el tip más reciente con `fechaInicio <= HOY`.

### Trivia

Dos estados según si el usuario ya respondió:

**Sin responder:** Muestra las preguntas con opciones seleccionables. El botón "Enviar respuestas" se activa solo cuando todas las preguntas tienen respuesta. Una vez enviado no se puede repetir.

**Ya respondido:** Muestra puntaje con degradado violeta/rosa, revisión pregunta por pregunta con verde (correcta) y rojo (incorrecta elegida), y explicación de cada respuesta si fue configurada. Si el puntaje es perfecto, aparece botón para ver el ranking Hall of Fame.

### Encuesta

Dos estados: opciones para votar (botones interactivos) o resultados con barras de progreso animadas. La opción elegida por el usuario aparece marcada con ✓ en color mint.

---

## Gestión de archivos (fotos)

Las fotos de portada se suben con `multer` y se guardan en:

```
/uploads/blog/blog_[timestamp].[ext]
```

Se sirven como estáticos desde Express:

```js
app.use(
  "/uploads/blog",
  express.static(path.join(__dirname, "../uploads/blog")),
);
```

En producción (IIS), el `web.config` debe incluir una regla para servir esta ruta directamente o dejarla pasar al proxy de Express.

**Formatos aceptados:** JPG, JPEG, PNG, WebP  
**Tamaño máximo:** 5 MB  
**Nomenclatura:** `blog_1786970164143.jpg` (timestamp Unix en ms)

---

## Sistema de permisos

El módulo usa el campo `area` del token JWT para control de acceso:

```js
// Frontend — guard en BlogAdminPage
if (user?.area !== 'SISTEMAS') → muestra pantalla bloqueada

// Backend — middleware soloAdmin en rutas admin
const soloAdmin = (req, res, next) => {
  if (req.user?.area !== 'SISTEMAS') return res.status(403).json({ error: 'Sin permiso' });
  next();
};
```

El botón "⚙️ Admin" en el header del blog público solo aparece si `user?.area === 'SISTEMAS'`.

---

## Categorías disponibles

| Valor en DB      | Etiqueta                | Color                |
| ---------------- | ----------------------- | -------------------- |
| `tecnologia`     | Tecnología              | `#7c8cf8` violeta    |
| `ciberseguridad` | Ciberseguridad          | `#fb7185` rosa/rojo  |
| `nom35`          | NOM-035                 | `#4ade80` verde      |
| `vidasana`       | Vida Sana               | `#38bdf8` azul cielo |
| `industria`      | Industria               | `#fbbf24` ámbar      |
| `ia`             | Inteligencia Artificial | `#e879f9` fucsia     |

Para agregar una nueva categoría hay que actualizar el array `CATEGORIAS` en ambos componentes (`BlogPage.jsx` y `BlogAdminPage.jsx`). No requiere cambio en la base de datos ya que el campo `categoria` es VARCHAR libre.

---

## Consideraciones de producción

### PM2

```bash
pm2 restart fabpsa-api
```

Reiniciar después de cualquier cambio en archivos del servidor.

### IIS / web.config

Verificar que las siguientes rutas estén proxeadas a Express:

- `/api/blog/*`
- `/uploads/blog/*`

### HTTPS y archivos

En producción con IIS, las fotos se sirven desde Express. Asegurarse de que la carpeta `uploads/blog/` tenga permisos de escritura para el usuario del proceso Node.

### Variables de entorno

No se requieren variables nuevas. El módulo usa el mismo pool de conexión `DB_RHFABPSA` definido en `.env`.

---

## Resolución de problemas comunes

| Problema                       | Causa probable                                                      | Solución                                                                      |
| ------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Foto no carga (404)            | `express.static` no apunta a la carpeta correcta                    | Verificar path en `index.js`                                                  |
| Extracto vacío al editar       | Ruta `/admin/articulos/:id/detalle` mal ordenada en routes          | Asegurar que esté antes de `/:id`                                             |
| Error JSON al eliminar edición | Intento de eliminar edición activa o tablas de trivia sin datos     | La edición activa no se puede eliminar; el service maneja trivia en try/catch |
| Blog muestra "Sin artículos"   | Artículos en estatus borrador o edición no activada                 | Publicar artículos y activar la edición                                       |
| Like muestra NaN               | Error 500 en `getArticuloDetalle`                                   | Revisar query de comentarios, posible JOIN fallido                            |
| Trivia no aparece en sidebar   | Trivia sin `activa = 1` o endpoint `/api/blog/trivia` no registrado | Verificar registro de rutas en `index.js`                                     |
