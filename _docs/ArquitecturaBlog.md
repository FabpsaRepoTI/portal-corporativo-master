# Arquitectura SQL — Módulo Blog Corporativo FABPSA

**Portal Corporativo v4**  
Base de datos: `DB_RHFABPSA` — Azure SQL Server  
Fecha: Agosto 2026  
Responsable: Juanma Ramírez

---

## Visión general

El módulo de blog utiliza **11 tablas** organizadas en cuatro dominios funcionales: ediciones, artículos, interacciones (likes/comentarios) y contenido complementario (encuestas, trivia, tips). Todas las tablas viven en la misma base de datos `DB_RHFABPSA` y comparten el pool de conexión definido en `db.js`.

```
blog_edicion
    └── blog_articulo
            ├── blog_like
            └── blog_comentario
    └── blog_encuesta
            ├── blog_encuesta_opcion
            └── blog_encuesta_voto
    └── blog_trivia
            └── blog_trivia_pregunta
                    └── blog_trivia_opcion
            └── blog_trivia_resultado
                    └── blog_trivia_respuesta

blog_tip  (independiente, sin FK a edición)
```

---

## Tablas

### `blog_edicion`

Representa una edición mensual de la revista. Solo puede existir una edición activa a la vez, garantizado por un índice único filtrado.

| Columna         | Tipo            | Descripción                      |
| --------------- | --------------- | -------------------------------- |
| `idEdicion`     | INT IDENTITY PK | Identificador único              |
| `titulo`        | VARCHAR(100)    | Ej: "Agosto 2026"                |
| `mes`           | TINYINT         | Número de mes (1–12)             |
| `anio`          | SMALLINT        | Año de la edición                |
| `activa`        | BIT DEFAULT 0   | Solo una edición activa a la vez |
| `fechaCreacion` | DATETIME        | Fecha de creación automática     |

**Índice especial:**

```sql
CREATE UNIQUE INDEX UX_blog_edicion_activa
    ON blog_edicion(activa)
    WHERE activa = 1;
```

Este índice filtrado garantiza a nivel de base de datos que nunca haya más de una edición con `activa = 1`. Si se intenta activar una segunda, SQL Server lanza error de unicidad antes de que el código lo maneje.

---

### `blog_articulo`

Artículos publicados dentro de una edición. El campo `destacado` define cuál aparece en el hero de la portada.

| Columna            | Tipo              | Descripción                                                     |
| ------------------ | ----------------- | --------------------------------------------------------------- |
| `idArticulo`       | INT IDENTITY PK   | Identificador único                                             |
| `idEdicion`        | INT FK            | Edición a la que pertenece                                      |
| `titulo`           | VARCHAR(200)      | Título del artículo                                             |
| `extracto`         | VARCHAR(500)      | Texto corto para la card                                        |
| `contenido`        | NVARCHAR(MAX)     | HTML o texto plano completo                                     |
| `categoria`        | VARCHAR(30)       | tecnologia / ciberseguridad / nom35 / vidasana / industria / ia |
| `autor`            | VARCHAR(100)      | Login o nombre libre                                            |
| `fotoUrl`          | VARCHAR(500)      | Ruta relativa `/uploads/blog/archivo.jpg`                       |
| `destacado`        | BIT DEFAULT 0     | Artículo hero de la edición                                     |
| `estatus`          | TINYINT DEFAULT 1 | 1 = borrador, 2 = publicado                                     |
| `tiempoLectura`    | TINYINT           | Minutos estimados                                               |
| `fechaPublicacion` | DATETIME          | Se establece al publicar                                        |
| `fechaCreacion`    | DATETIME          | Automática                                                      |

**Índices:**

```sql
CREATE INDEX IX_blog_articulo_edicion   ON blog_articulo(idEdicion, estatus);
CREATE INDEX IX_blog_articulo_categoria ON blog_articulo(categoria, estatus);
```

**Nota:** El campo `contenido` usa `NVARCHAR(MAX)` para soportar caracteres especiales, emojis y HTML con etiquetas Unicode.

---

### `blog_like`

Registro de likes por usuario por artículo. La restricción UNIQUE evita doble like sin necesidad de lógica extra en el backend.

| Columna        | Tipo                                | Descripción                 |
| -------------- | ----------------------------------- | --------------------------- |
| `idLike`       | INT IDENTITY PK                     | Identificador único         |
| `idArticulo`   | INT FK                              | Artículo al que se dio like |
| `loginUsuario` | VARCHAR(255) FK → `sec_users.login` | Usuario que dio like        |
| `fecha`        | DATETIME                            | Fecha automática            |

```sql
CONSTRAINT UQ_blog_like UNIQUE (idArticulo, loginUsuario)
```

La lógica de toggle (dar/quitar like) se maneja en `toggleLike()` del service: primero verifica existencia, luego hace INSERT o DELETE según el caso.

---

### `blog_comentario`

Comentarios de usuarios en artículos. El campo `activo` permite moderación suave — el comentario se oculta pero no se borra.

| Columna        | Tipo            | Descripción          |
| -------------- | --------------- | -------------------- |
| `idComentario` | INT IDENTITY PK | Identificador único  |
| `idArticulo`   | INT FK          | Artículo comentado   |
| `loginUsuario` | VARCHAR(255) FK | Autor del comentario |
| `comentario`   | NVARCHAR(1000)  | Texto del comentario |
| `activo`       | BIT DEFAULT 1   | 0 = moderado/oculto  |
| `fecha`        | DATETIME        | Automática           |

---

### `blog_encuesta`

Una encuesta por edición. Contiene solo la pregunta; las opciones van en tabla separada.

| Columna         | Tipo            | Descripción            |
| --------------- | --------------- | ---------------------- |
| `idEncuesta`    | INT IDENTITY PK | Identificador único    |
| `idEdicion`     | INT FK          | Edición asociada       |
| `pregunta`      | VARCHAR(300)    | Texto de la pregunta   |
| `activa`        | BIT DEFAULT 1   | Control de visibilidad |
| `fechaCreacion` | DATETIME        | Automática             |

---

### `blog_encuesta_opcion`

Opciones de respuesta para cada encuesta.

| Columna      | Tipo            | Descripción                 |
| ------------ | --------------- | --------------------------- |
| `idOpcion`   | INT IDENTITY PK | Identificador único         |
| `idEncuesta` | INT FK          | Encuesta a la que pertenece |
| `texto`      | VARCHAR(200)    | Texto de la opción          |
| `orden`      | TINYINT         | Orden de presentación       |

---

### `blog_encuesta_voto`

Votos registrados. La restricción UNIQUE garantiza un voto por persona por encuesta.

| Columna        | Tipo            | Descripción         |
| -------------- | --------------- | ------------------- |
| `idVoto`       | INT IDENTITY PK | Identificador único |
| `idEncuesta`   | INT FK          | Encuesta votada     |
| `idOpcion`     | INT FK          | Opción elegida      |
| `loginUsuario` | VARCHAR(255) FK | Quien votó          |
| `fecha`        | DATETIME        | Automática          |

```sql
CONSTRAINT UQ_blog_voto UNIQUE (idEncuesta, loginUsuario)
```

---

### `blog_trivia`

Una trivia por edición. Restricción UNIQUE a nivel de `idEdicion` garantiza que no se creen duplicados.

| Columna         | Tipo            | Descripción              |
| --------------- | --------------- | ------------------------ |
| `idTrivia`      | INT IDENTITY PK | Identificador único      |
| `idEdicion`     | INT FK          | Edición asociada         |
| `titulo`        | VARCHAR(200)    | Ej: "Trivia Agosto 2026" |
| `activa`        | BIT DEFAULT 1   | Control de visibilidad   |
| `fechaCreacion` | DATETIME        | Automática               |

```sql
CONSTRAINT UQ_blog_trivia_edicion UNIQUE (idEdicion)
```

---

### `blog_trivia_pregunta`

Preguntas de la trivia (típicamente 3 por trivia). El campo `explicacion` se muestra al usuario al ver sus resultados.

| Columna       | Tipo            | Descripción                                     |
| ------------- | --------------- | ----------------------------------------------- |
| `idPregunta`  | INT IDENTITY PK | Identificador único                             |
| `idTrivia`    | INT FK          | Trivia a la que pertenece                       |
| `texto`       | NVARCHAR(400)   | Enunciado de la pregunta                        |
| `orden`       | TINYINT         | Orden de presentación                           |
| `explicacion` | NVARCHAR(500)   | Explicación de la respuesta correcta (opcional) |

---

### `blog_trivia_opcion`

Opciones de respuesta por pregunta. Solo una opción tiene `correcta = 1`.

| Columna      | Tipo            | Descripción                      |
| ------------ | --------------- | -------------------------------- |
| `idOpcion`   | INT IDENTITY PK | Identificador único              |
| `idPregunta` | INT FK          | Pregunta a la que pertenece      |
| `texto`      | NVARCHAR(300)   | Texto de la opción               |
| `correcta`   | BIT DEFAULT 0   | Solo una por pregunta debe ser 1 |
| `orden`      | TINYINT         | Orden de presentación            |

---

### `blog_trivia_resultado`

Resultado consolidado del intento de un usuario. La restricción UNIQUE garantiza una sola oportunidad por usuario por trivia.

| Columna          | Tipo            | Descripción                         |
| ---------------- | --------------- | ----------------------------------- |
| `idResultado`    | INT IDENTITY PK | Identificador único                 |
| `idTrivia`       | INT FK          | Trivia respondida                   |
| `loginUsuario`   | VARCHAR(255) FK | Usuario que respondió               |
| `aciertos`       | TINYINT         | Número de respuestas correctas      |
| `totalPreguntas` | TINYINT         | Total de preguntas (generalmente 3) |
| `fechaRegistro`  | DATETIME        | Automática                          |

```sql
CONSTRAINT UQ_blog_trivia_resultado UNIQUE (idTrivia, loginUsuario)
```

---

### `blog_trivia_respuesta`

Detalle de cada respuesta individual para estadísticas en el admin. Permite saber qué opción eligió cada usuario en cada pregunta.

| Columna       | Tipo            | Descripción                  |
| ------------- | --------------- | ---------------------------- |
| `idRespuesta` | INT IDENTITY PK | Identificador único          |
| `idResultado` | INT FK          | Resultado al que pertenece   |
| `idPregunta`  | INT FK          | Pregunta respondida          |
| `idOpcion`    | INT FK          | Opción elegida               |
| `correcta`    | BIT             | Si la respuesta fue correcta |

---

### `blog_tip`

Tips de la semana. Tabla independiente sin FK a edición — el tip activo se determina por `fechaInicio <= HOY` y `activo = 1`, ordenado descendente.

| Columna         | Tipo            | Descripción                   |
| --------------- | --------------- | ----------------------------- |
| `idTip`         | INT IDENTITY PK | Identificador único           |
| `texto`         | NVARCHAR(200)   | Frase corta accionable        |
| `categoria`     | VARCHAR(30)     | Mismas categorías del blog    |
| `icono`         | VARCHAR(10)     | Emoji representativo          |
| `activo`        | BIT DEFAULT 1   | Control de visibilidad        |
| `fechaInicio`   | DATE            | Fecha desde la que es visible |
| `fechaCreacion` | DATETIME        | Automática                    |

**Query de selección del tip activo:**

```sql
SELECT TOP 1 idTip, texto, categoria, icono, fechaInicio
FROM   blog_tip
WHERE  activo = 1
  AND  fechaInicio <= CAST(GETDATE() AS DATE)
ORDER BY fechaInicio DESC
```

---

## Eliminación en cascada

Las tablas no tienen `ON DELETE CASCADE` definido a nivel de FK para mantener control explícito. La eliminación de una edición se maneja en `eliminarEdicion()` del service, borrando en este orden:

```
1. blog_trivia_respuesta
2. blog_trivia_resultado
3. blog_trivia_opcion
4. blog_trivia_pregunta
5. blog_trivia
6. blog_encuesta_voto
7. blog_encuesta_opcion
8. blog_encuesta
9. blog_like
10. blog_comentario
11. blog_articulo
12. blog_edicion
```

**Restricción de seguridad:** No se puede eliminar la edición activa. El service verifica `activa = 1` antes de proceder y lanza error si se intenta.

---

## Índices completos

```sql
-- Edición activa (índice filtrado único)
CREATE UNIQUE INDEX UX_blog_edicion_activa ON blog_edicion(activa) WHERE activa = 1;

-- Artículos
CREATE INDEX IX_blog_articulo_edicion   ON blog_articulo(idEdicion, estatus);
CREATE INDEX IX_blog_articulo_categoria ON blog_articulo(categoria, estatus);

-- Likes
CREATE INDEX IX_blog_like_articulo ON blog_like(idArticulo);

-- Comentarios
CREATE INDEX IX_blog_comentario_articulo ON blog_comentario(idArticulo, activo);

-- Trivia
CREATE INDEX IX_blog_trivia_edicion   ON blog_trivia(idEdicion);
CREATE INDEX IX_blog_trivia_resultado ON blog_trivia_resultado(idTrivia);
CREATE INDEX IX_blog_trivia_respuesta ON blog_trivia_respuesta(idResultado);

-- Tips
CREATE INDEX IX_blog_tip_fecha ON blog_tip(fechaInicio DESC);
```

---

## Relación con tablas existentes

| Tabla del blog          | FK hacia    | Columna                |
| ----------------------- | ----------- | ---------------------- |
| `blog_like`             | `sec_users` | `loginUsuario → login` |
| `blog_comentario`       | `sec_users` | `loginUsuario → login` |
| `blog_encuesta_voto`    | `sec_users` | `loginUsuario → login` |
| `blog_trivia_resultado` | `sec_users` | `loginUsuario → login` |

Todas las referencias a usuarios apuntan a `sec_users.login` (VARCHAR 255), que es la tabla de autenticación existente del portal.
