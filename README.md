# FABPSA Intranet v1 — React + Node.js + SQL Server

· Node.js API · React Frontend

---

## 📁 Estructura

```
fabpsa-v4/
├── client/          ← React (frontend)
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Navbar.jsx
│   │   │   ├── Hero.jsx
│   │   │   ├── QuickAccess.jsx    ←
│   │   │   └── Footer.jsx
│   │   ├── pages/
│   │   │   ├── HomePage.jsx
│   │   │   ├── AplicativosPage.jsx
│   │   │   └── CulturaDigitalPage.jsx
│   │   ├── context/ThemeContext.jsx
│   │   ├── data/staticData.js
│   │   ├── hooks/useReveal.js
│   │   ├── hooks/useCounter.js
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── index.js
│   └── package.json
├── server/
│   ├── index.js     ← Node + Express + mssql
│   └── package.json
└── README.md
```

---

## 🚀 Desarrollo local

### 1. Instalar y correr el servidor Node

```bash
cd server
npm install
node index.js
# ✅ Corre en http://localhost:3001
```

### 2. Instalar y correr React

```bash
cd client
npm install
npm start
# ✅ Abre http://localhost:3000
# El proxy en package.json redirige /api → localhost:3001
```

Los cumpleaños se cargarán automáticamente desde tu SQL Server Azure.

---

## 🏭 Deploy en Windows Server + IIS

### Paso 1 — Instalar Node.js en el servidor

Descarga Node.js LTS de https://nodejs.org e instala en el servidor Windows.

### Paso 2 — Instalar PM2 (gestor de procesos)

```bash
npm install -g pm2
npm install -g pm2-windows-startup
pm2-startup install
```

PM2 mantiene el servidor Node corriendo aunque reinicies Windows.

### Paso 3 — Copiar y configurar el servidor

```bash
# Copia la carpeta /server al servidor, por ejemplo:
# C:\inetpub\fabpsa-api\

cd C:\inetpub\fabpsa-api
npm install
pm2 start index.js --name fabpsa-api
pm2 save
```

El servidor Node corre en el puerto 3001 internamente.

### Paso 4 — Compilar React

En tu PC de desarrollo:

```bash
cd client
npm run build
```

Esto genera la carpeta `/client/build`.

### Paso 5 — Subir el build a IIS

Copia el contenido de `/client/build` a:

```
C:\inetpub\wwwroot\intranet\
```

### Paso 6 — web.config para IIS

Crea `C:\inetpub\wwwroot\intranet\web.config`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <!-- Proxy /api/* → Node.js en puerto 3001 -->
        <rule name="API Proxy" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://localhost:3001/api/{R:1}" />
        </rule>
        <!-- React Router — todas las demás rutas van al index.html -->
        <rule name="React Routes" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile"      negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/intranet/index.html" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

> **Importante:** Para que el proxy funcione necesitas el módulo
> **URL Rewrite** y **Application Request Routing (ARR)** instalados en IIS.
> Descárgalos gratis desde https://www.iis.net/downloads

---

## 💡 Poner tu logo

1. Pon tu imagen `logo.png` en `/client/public/`
2. En `client/src/components/Navbar.jsx` cambia:
   ```jsx
   <i className="ti ti-building-factory-2" />
   ```
   por:
   ```jsx
   <img src="/logo.png" alt="FABPSA" />
   ```

---

## ✏️ Personalizar contenido

| Qué             | Dónde                                        |
| --------------- | -------------------------------------------- |
| Aplicativos     | `src/data/staticData.js` → `APPS`            |
| Acceso rápido   | `src/data/staticData.js` → `QUICK_APPS`      |
| Números boletín | `src/data/staticData.js` → `BOLETIN_STATS`   |
| Efemérides      | `src/data/staticData.js` → `EFEMERIDES`      |
| Colores dark    | `src/App.css` → `:root, [data-theme="dark"]` |
| Colores light   | `src/App.css` → `[data-theme="light"]`       |
| DB conexión     | `server/index.js` → `dbConfig`               |
