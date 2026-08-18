# Sistema de Permisos — Portal Corporativo v4

## Estructura de la base de datos

Dos tablas controlan todo el sistema de permisos:

- **`portal_modulos`** — catálogo de módulos disponibles en el portal
- **`portal_usuario_modulos`** — qué módulos tiene asignado cada usuario

---

## Módulos actuales

| clave             | Nombre                 | Ruta                |
| ----------------- | ---------------------- | ------------------- |
| `portal`          | Portal Corporativo     | `/`                 |
| `cultura_digital` | Cultura Digital        | `/cultura-digital`  |
| `mesa_servicio`   | Mesa de Servicio       | `/mesa-de-servicio` |
| `escaner`         | Escáner CEDIS          | `/cedis/facturas`   |
| `desarrollo`      | Desarrollo de Software | `/desarrollo`       |

---

## Caso 1 — Agregar un usuario nuevo

1. Crear el usuario desde **Administración → Usuarios → Nuevo usuario**
2. Buscar al usuario en la tabla
3. Click en el ícono 🔒 (candado) en la columna Acciones
4. Palomear los módulos que puede ver
5. Click en **Guardar accesos**

La próxima vez que ese usuario haga login verá únicamente los módulos asignados.

---

## Caso 2 — Agregar un módulo nuevo

### Paso 1 — Registrar el módulo en SQL

```sql
INSERT INTO portal_modulos (clave, nombre, icono, ruta, orden) VALUES
('inventarios', 'Inventarios', 'ti-package', '/inventarios', 6)
```

### Paso 2 — Agregar al Sidebar

En `client/src/components/Sidebar.jsx`, dentro del array `NAV_SECTIONS`, agregar el item en la sección que corresponda:

```js
{ to: "/inventarios", icon: "ti-package", label: "Inventarios", modulo: "inventarios" }
```

### Paso 3 — Agregar la ruta en App.jsx

En `client/src/App.jsx`:

```jsx
<Route
  path="/inventarios"
  element={
    <ProtectedRoute modulo="inventarios">
      <InventariosPage />
    </ProtectedRoute>
  }
/>
```

### Paso 4 — Asignar a usuarios

**Opción A — Desde la interfaz:** click en el candado 🔒 de cada usuario y palomear el módulo nuevo.

**Opción B — SQL masivo por área:**

```sql
INSERT INTO portal_usuario_modulos (login, idModulo)
SELECT u.login, m.idModulo
FROM sec_users u
CROSS JOIN portal_modulos m
WHERE m.clave = 'inventarios'
AND u.area = 'ALMACEN'
AND NOT EXISTS (
    SELECT 1 FROM portal_usuario_modulos x
    WHERE x.login = u.login AND x.idModulo = m.idModulo
)
```

---

## Queries útiles

### Ver módulos asignados a un usuario

```sql
SELECT m.clave, m.nombre
FROM portal_modulos m
JOIN portal_usuario_modulos um ON m.idModulo = um.idModulo
WHERE um.login = 'JMRAMIREZ'
AND m.activo = 1
```

### Ver quién tiene acceso a un módulo específico

```sql
SELECT um.login
FROM portal_usuario_modulos um
JOIN portal_modulos m ON m.idModulo = um.idModulo
WHERE m.clave = 'escaner'
```

### Quitar acceso a un módulo para un usuario

```sql
DELETE FROM portal_usuario_modulos
WHERE login = 'GSANTIAGO'
AND idModulo = (SELECT idModulo FROM portal_modulos WHERE clave = 'escaner')
```

### Dar acceso masivo a todos excepto un módulo

```sql
INSERT INTO portal_usuario_modulos (login, idModulo)
SELECT u.login, m.idModulo
FROM sec_users u
CROSS JOIN portal_modulos m
WHERE m.activo = 1
AND m.clave <> 'escaner'
AND NOT EXISTS (
    SELECT 1 FROM portal_usuario_modulos x
    WHERE x.login = u.login AND x.idModulo = m.idModulo
)
```

---

## Flujo de autorización

```
Login
  │
  ▼
Backend consulta portal_usuario_modulos
  │
  ▼
JWT incluye modulos: ['portal', 'mesa_servicio', 'escaner', ...]
  │
  ├─▶ Sidebar filtra items según modulos[]
  ├─▶ ProtectedRoute bloquea rutas sin permiso
  └─▶ Backend rechaza llamadas a la API sin el módulo correcto
```

---

## Archivos clave del sistema

| Archivo                                    | Función                                       |
| ------------------------------------------ | --------------------------------------------- |
| `server/services/permisos.service.js`      | Lógica de DB: leer y guardar módulos          |
| `server/routes/permisos.routes.js`         | Endpoints REST de permisos                    |
| `server/middleware/requireModulo.js`       | Middleware que protege endpoints de API       |
| `server/routes/auth.routes.js`             | Login — incluye módulos en el JWT             |
| `client/src/components/Sidebar.jsx`        | Menú — filtra items según módulos del usuario |
| `client/src/components/ProtectedRoute.jsx` | Bloquea rutas de React sin permiso            |
| `client/src/context/AuthContext.jsx`       | Expone `modulos[]` a toda la app              |
