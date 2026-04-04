# Sweet Home POS

Sistema de punto de venta para **Sweet Home — Repostería**.

Aplicacion web movil, offline-first, para registrar ventas diarias de forma rapida desde el celular.

| | URL |
|---|---|
| **App (Frontend)** | https://sweet-home-pos.vercel.app |
| **API (Backend)** | https://sweet-home-pos.onrender.com |
| **API Docs** | https://sweet-home-pos.onrender.com/docs |

---

## Funcionalidades

- Registro de ventas rapido en 3-4 toques
- Descuento automatico de inventario al vender
- Funciona sin internet (offline-first con sincronizacion automatica)
- Sistema de autenticacion con roles: **admin** y **empleado**
- Gestion de usuarios (crear, activar/desactivar empleados)
- Gestion de productos y precios desde la app (crear, editar, desactivar)
- Resumen diario con totales, productos mas vendidos, desglose por pago (admin)
- Historial de ventas: admin ve todas, empleado ve solo las suyas
- Gestion de inventario con alertas de stock bajo
- Correo automatico con resumen diario a las 9:00 PM hora Mexico

---

## Roles de Usuario

| Funcion | Admin | Empleado |
|---------|-------|----------|
| Registrar ventas | ✓ | ✓ |
| Ver inventario | ✓ | ✓ (solo lectura) |
| Ver historial de ventas | ✓ (todas) | ✓ (solo las propias) |
| Resumen del dia | ✓ | — |
| Crear/editar productos y precios | ✓ | — |
| Gestionar usuarios | ✓ | — |

---

## Arquitectura General

```mermaid
graph TD
    subgraph Celular["Celular (PWA)"]
        UI["React + TypeScript"]
        SW["Service Worker (Workbox)"]
        IDB["IndexedDB (Dexie.js)"]
        UI --> IDB
        SW --> IDB
    end

    subgraph Backend["Servidor (FastAPI)"]
        API["FastAPI + Uvicorn"]
        AUTH["JWT Auth (python-jose)"]
        ORM["SQLAlchemy Async"]
        SCH["APScheduler"]
        EMAIL["Gmail SMTP"]
        API --> AUTH
        API --> ORM
        SCH --> EMAIL
        SCH --> ORM
    end

    subgraph DB["Base de Datos"]
        PG["PostgreSQL (Neon)"]
    end

    UI -- "Bearer JWT\nPOST /api/sync\n(ventas pendientes)" --> API
    API -- "productos actualizados" --> UI
    ORM --> PG
    SW -- "Cache assets + API" --> UI

    style Celular fill:#fef3e2,stroke:#d4845a,color:#333
    style Backend fill:#e8f4e8,stroke:#4a9e4a,color:#333
    style DB fill:#e2ecf6,stroke:#4a7eb5,color:#333
```

**Flujo principal:**
1. El usuario abre la PWA e inicia sesion con usuario + contrasena
2. Registra ventas que se guardan localmente en IndexedDB
3. Cuando hay internet, la app sincroniza automaticamente con el backend
4. El backend persiste en PostgreSQL y envia correos diarios

---

## Arquitectura de Deployment

```mermaid
graph LR
    subgraph Vercel["Vercel (Gratis)"]
        FE["Frontend React\nStatic + PWA"]
    end

    subgraph Render["Render (Gratis)"]
        BE["Backend FastAPI\n+ Scheduler\nPython 3.12"]
    end

    subgraph Neon["Neon (Gratis)"]
        PG["PostgreSQL\n0.5 GB"]
    end

    subgraph Cron["cron-job.org (Gratis)"]
        CJ["Cron Job\n9PM Mexico"]
    end

    FE -- "HTTPS /api/*" --> BE
    BE -- "asyncpg" --> PG
    CJ -- "POST /api/cron/daily-report\n(Bearer token)" --> BE

    style Vercel fill:#000,stroke:#fff,color:#fff
    style Render fill:#4a154b,stroke:#fff,color:#fff
    style Neon fill:#0a2540,stroke:#00e599,color:#00e599
    style Cron fill:#1a1a2e,stroke:#e94560,color:#e94560
```

| Servicio | Uso | Limite Free |
|----------|-----|-------------|
| **Vercel** | Frontend estatico + PWA | 100 GB bandwidth/mes |
| **Render** | Backend FastAPI (Python 3.12) | 750 hrs/mes, duerme tras 15 min inactivo |
| **Neon** | PostgreSQL | 0.5 GB storage, 100 compute-hrs/mes |
| **cron-job.org** | Dispara email diario | Ilimitado |

> **Nota:** Render free se duerme tras 15 min sin uso. El cold start tarda ~30-50s. Esto NO afecta el registro de ventas porque la PWA es offline-first. Solo afecta la sincronizacion inicial.

---

## Flujo Offline / Sincronizacion

```mermaid
sequenceDiagram
    actor U as Usuario
    participant PWA as PWA (Celular)
    participant IDB as IndexedDB
    participant API as Backend API
    participant DB as PostgreSQL

    U->>PWA: Registra venta
    PWA->>IDB: Guarda venta (synced=false)
    PWA-->>U: Confirmacion instantanea

    Note over PWA: Detecta conexion a internet

    PWA->>IDB: Lee ventas con synced=false
    IDB-->>PWA: [{venta1}, {venta2}, ...]
    PWA->>API: POST /api/sync {sales: [...]}
    API->>DB: INSERT ventas (ignora UUIDs duplicados)
    API->>DB: UPDATE stock de productos
    DB-->>API: OK
    API-->>PWA: {synced_uuids: [...], products: [...]}
    PWA->>IDB: Marca synced=true
    PWA->>IDB: Actualiza productos locales
```

**Puntos clave:**
- Las ventas se guardan SIEMPRE primero en IndexedDB. Nunca se pierde una venta.
- Cada venta tiene un UUID unico generado en el cliente para evitar duplicados.
- La sync se dispara: al abrir la app, al recuperar conexion, o con boton manual.
- El catalogo de productos se refresca en cada sincronizacion.

---

## Modelo de Datos

```mermaid
erDiagram
    User {
        int id PK
        string username
        string password_hash
        string role
        bool active
        datetime created_at
    }

    Product {
        int id PK
        string name
        float price
        int stock
        int low_stock_threshold
        bool active
        datetime created_at
        datetime updated_at
    }

    Sale {
        int id PK
        string client_uuid UK
        float total
        string payment_method
        datetime created_at
        datetime synced_at
        int user_id FK
    }

    SaleItem {
        int id PK
        int sale_id FK
        int product_id FK
        string product_name
        int quantity
        float unit_price
        float subtotal
    }

    User ||--o{ Sale : "registra"
    Product ||--o{ SaleItem : "se vende en"
    Sale ||--|{ SaleItem : "contiene"
```

### User

| Campo | Tipo | Default | Descripcion |
|-------|------|---------|-------------|
| id | Integer PK | auto | ID unico |
| username | String(50) UNIQUE | requerido | Nombre de usuario |
| password_hash | String | requerido | Contrasena hasheada con bcrypt |
| role | String(20) | requerido | `"admin"` o `"employee"` |
| active | Boolean | true | Si puede iniciar sesion |
| created_at | DateTime | UTC now | Fecha de creacion |

### Product

| Campo | Tipo | Default | Descripcion |
|-------|------|---------|-------------|
| id | Integer PK | auto | ID unico |
| name | String(100) | requerido | Nombre del producto |
| price | Float | requerido | Precio en MXN |
| stock | Integer | 0 | Unidades disponibles |
| low_stock_threshold | Integer | 5 | Umbral de alerta de stock bajo |
| active | Boolean | true | Si aparece en el catalogo |
| created_at | DateTime | UTC now | Fecha de creacion |
| updated_at | DateTime | UTC now | Ultima actualizacion |

### Sale

| Campo | Tipo | Default | Descripcion |
|-------|------|---------|-------------|
| id | Integer PK | auto | ID unico |
| client_uuid | String(36) UNIQUE | requerido | UUID del cliente (deduplicacion) |
| total | Float | requerido | Total de la venta |
| payment_method | String(20) | requerido | `"efectivo"` o `"transferencia"` |
| created_at | DateTime | requerido | Hora de la venta (UTC, zona Mexico al mostrar) |
| synced_at | DateTime | UTC now | Cuando se sincronizo |
| user_id | Integer FK | nullable | Empleado que registro la venta |

### SaleItem

| Campo | Tipo | Default | Descripcion |
|-------|------|---------|-------------|
| id | Integer PK | auto | ID unico |
| sale_id | Integer FK | requerido | Referencia a Sale |
| product_id | Integer FK | requerido | Referencia a Product |
| product_name | String(100) | requerido | Nombre snapshot (por si cambia) |
| quantity | Integer | requerido | Cantidad vendida |
| unit_price | Float | requerido | Precio al momento de la venta |
| subtotal | Float | requerido | quantity * unit_price |

---

## Stack Tecnologico

| Componente | Tecnologia | Justificacion |
|------------|-----------|---------------|
| **Backend** | Python 3.12 + FastAPI | Async, rapido, validacion con Pydantic |
| **Autenticacion** | JWT (python-jose) + bcrypt (passlib) | Tokens sin estado, contrasenas seguras |
| **Frontend** | React 18 + Vite + TypeScript | Ecosistema maduro, vite-plugin-pwa para offline |
| **BD Produccion** | PostgreSQL (Neon) | Free tier, compatible con SQLAlchemy async |
| **BD Local Dev** | SQLite + aiosqlite | Cero infraestructura, un archivo |
| **BD Offline** | IndexedDB (Dexie.js) | Queries tipo SQL sobre IndexedDB, sync queue |
| **PWA/Offline** | vite-plugin-pwa + Workbox | Service Worker automatico, cache de assets |
| **Email** | smtplib + Gmail App Password | Stdlib Python, 1 correo/dia, cero costo |
| **Scheduler** | APScheduler (in-process) | Cron interno en FastAPI |
| **CSS** | CSS custom mobile-first | Sin frameworks pesados, touch targets grandes |

---

## Estructura de Carpetas

```
sweet_home_pos/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, lifespan, CORS, routers, seed admin
│   │   ├── config.py               # Settings con pydantic-settings (.env)
│   │   ├── database.py             # SQLAlchemy async engine (SQLite o PostgreSQL)
│   │   ├── seed.py                 # Seed del catalogo de productos
│   │   ├── models/
│   │   │   ├── user.py             # Modelo User (auth)
│   │   │   ├── product.py          # Modelo Product
│   │   │   └── sale.py             # Modelos Sale + SaleItem
│   │   ├── schemas/
│   │   │   ├── auth.py             # LoginRequest, TokenResponse, UserCreate, UserResponse
│   │   │   ├── product.py          # ProductCreate, ProductUpdate, ProductResponse
│   │   │   ├── sale.py             # Schemas de ventas
│   │   │   └── sync.py             # Schemas del payload de sincronizacion
│   │   ├── routers/
│   │   │   ├── auth.py             # POST /login, GET /me, GET/POST /users, dependencias JWT
│   │   │   ├── products.py         # GET lista, POST crear, PUT editar, PUT stock
│   │   │   ├── sales.py            # GET historial (filtrado por rol)
│   │   │   ├── reports.py          # GET resumen diario (solo admin)
│   │   │   └── sync.py             # POST sync batch de ventas offline
│   │   └── services/
│   │       ├── auth_service.py     # hash_password, verify_password, create_token, decode_token
│   │       ├── email_service.py    # Gmail SMTP + template HTML
│   │       ├── report_service.py   # Generacion de datos del resumen diario
│   │       └── scheduler.py        # APScheduler cron (9PM Mexico)
│   ├── .python-version             # Fija Python 3.12 en Render
│   └── requirements.txt
├── frontend/
│   ├── public/
│   │   └── icons/
│   │       ├── logo.png            # Logo Sweet Home (login page)
│   │       ├── icon-192.svg        # Icono PWA 192x192
│   │       └── icon-512.svg        # Icono PWA 512x512
│   ├── src/
│   │   ├── App.tsx                 # Router + AuthProvider + roles
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx     # Auth state, login/logout, token en localStorage
│   │   ├── db/
│   │   │   ├── database.ts         # Schema Dexie.js (products, sales, saleItems)
│   │   │   └── sync.ts             # Logica de sincronizacion con backend
│   │   ├── hooks/
│   │   │   ├── useOnlineStatus.ts  # Detecta online/offline + auto-sync (solo autenticado)
│   │   │   └── useProducts.ts      # Hook para obtener productos
│   │   ├── services/
│   │   │   └── api.ts              # Fetch wrapper con JWT + manejo 401
│   │   ├── pages/
│   │   │   ├── Login.tsx           # Pantalla de inicio de sesion
│   │   │   ├── RegisterSale.tsx    # Pantalla principal: registrar venta rapido
│   │   │   ├── Inventory.tsx       # Gestionar stock + crear/editar productos (admin)
│   │   │   ├── SalesHistory.tsx    # "Mis Ventas" (empleado) / "Historial" (admin)
│   │   │   ├── DailySummary.tsx    # Resumen del dia (admin)
│   │   │   ├── Users.tsx           # Gestion de usuarios (admin)
│   │   │   └── Catalog.tsx         # Ver catalogo de productos
│   │   ├── components/
│   │   │   ├── BottomNav.tsx       # Navegacion inferior (tabs segun rol)
│   │   │   ├── ProductGrid.tsx     # Grid de productos (touch targets grandes)
│   │   │   ├── SyncIndicator.tsx   # Indicador de estado online/sync
│   │   │   └── Toast.tsx           # Notificaciones toast
│   │   └── styles/
│   │       ├── global.css          # Reset + variables CSS + tema
│   │       ├── pages.css           # Estilos por pagina (login, product sheet, etc.)
│   │       └── components.css      # Estilos de componentes
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── .gitignore
└── README.md
```

---

## API Endpoints

Base URL: `https://sweet-home-pos.onrender.com` (produccion) o `http://localhost:8000` (local)

Todos los endpoints (excepto `/api/health` y `/api/auth/login`) requieren header:
```
Authorization: Bearer <token>
```

### Health

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| GET | `/api/health` | — | Health check |

### Autenticacion

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| POST | `/api/auth/login` | — | Login. Body: `{"username": "", "password": ""}`. Retorna `{token, user_id, username, role}` |
| GET | `/api/auth/me` | Usuario | Datos del usuario autenticado |
| GET | `/api/auth/users` | Admin | Listar todos los usuarios |
| POST | `/api/auth/users` | Admin | Crear usuario. Body: `{username, password, role}` |
| PUT | `/api/auth/users/{id}/active` | Admin | Activar/desactivar usuario. Query: `?active=true/false` |

### Productos

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| GET | `/api/products` | Usuario | Listar productos. Query: `?active_only=true` |
| POST | `/api/products` | Admin | Crear producto. Body: `{name, price, stock, low_stock_threshold}` |
| PUT | `/api/products/{id}` | Admin | Editar producto. Body: `{name?, price?, low_stock_threshold?, active?}` |
| PUT | `/api/products/{id}/stock` | Admin | Actualizar stock. Body: `{"stock": 10}` |
| GET | `/api/products/low-stock` | Usuario | Productos con stock bajo el umbral |

### Ventas

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| GET | `/api/sales` | Usuario | Historial. Admin ve todas, empleado solo las suyas. Query: `?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&limit=50` |

### Sincronizacion

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| POST | `/api/sync` | Usuario | Enviar batch de ventas offline. Retorna UUIDs sincronizados + productos actualizados |

### Reportes (Admin)

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| GET | `/api/reports/daily` | Admin | Resumen del dia. Query: `?date=YYYY-MM-DD` |
| POST | `/api/reports/send-test` | Admin | Enviar correo de prueba con datos de hoy |

### Cron Externo

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| POST | `/api/cron/daily-report` | Header `Authorization: Bearer {CRON_SECRET}` | Dispara envio de email diario |

---

## Variables de Entorno

### Backend (`backend/.env`)

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./sweet_home.db` | SQLite para local, `postgresql+asyncpg://...` para produccion |
| `JWT_SECRET` | `changeme-...` | Secret para firmar tokens JWT. **Cambiar en produccion.** |
| `JWT_EXPIRE_HOURS` | `8` | Duracion del token en horas |
| `ADMIN_USERNAME` | `admin` | Usuario del administrador creado al iniciar |
| `ADMIN_PASSWORD` | `""` | Contrasena del admin. Si esta vacia, no se crea el admin. |
| `GMAIL_USER` | `""` | Cuenta Gmail para enviar correos |
| `GMAIL_APP_PASSWORD` | `""` | App Password de Gmail (16 caracteres, sin espacios) |
| `EMAIL_RECIPIENT` | `""` | Email que recibe el resumen diario |
| `TIMEZONE` | `America/Mexico_City` | Zona horaria para reportes |
| `DAILY_REPORT_HOUR` | `21` | Hora del correo diario (9 PM) |
| `DAILY_REPORT_MINUTE` | `0` | Minuto del correo diario |
| `CORS_ORIGINS` | `http://localhost:5173` | URLs permitidas (separadas por coma) |
| `CRON_SECRET` | `""` | Token Bearer para el endpoint de cron externo |

**Generar JWT_SECRET seguro:**
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### Frontend (`frontend/.env`)

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:8000` | URL del backend |

---

## Setup Local (Desarrollo)

### Requisitos

- Python 3.12
- Node.js 18+
- npm 9+

### 1. Clonar el repositorio

```bash
git clone https://github.com/ArturoFrancoMozqueda/sweet_home_pos.git
cd sweet_home_pos
```

### 2. Backend

```bash
cd backend

# Crear entorno virtual con Python 3.12
python -m venv venv

# Activar (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# Activar (Linux/Mac)
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Crear archivo de variables de entorno
cp .env.example .env
```

Editar `backend/.env` — para desarrollo local lo minimo es poner `ADMIN_PASSWORD`:
```
ADMIN_PASSWORD=tupassword
```

### 3. Frontend

```bash
cd frontend
npm install
```

### 4. Ejecutar

**Terminal 1 — Backend:**
```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

### 5. Acceder

- **App:** http://localhost:5173 → login con usuario `admin` y la contrasena que pusiste en `.env`
- **API Docs:** http://localhost:8000/docs

---

## Setup Produccion (Deploy Gratuito)

### Paso 1: Neon PostgreSQL (Base de datos)

1. Crea cuenta en **https://neon.tech**
2. Nuevo proyecto → conectar → copia el connection string
3. Convierte al formato asyncpg:
   ```
   postgresql+asyncpg://usuario:password@host/db?ssl=require
   ```

### Paso 2: Render.com (Backend)

1. Crea cuenta en **https://render.com** → conecta GitHub
2. **New → Web Service** → selecciona el repo

   | Campo | Valor |
   |-------|-------|
   | Root Directory | `backend` |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
   | Instance Type | Free |

3. Variables de entorno en Render:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | URL de Neon |
   | `JWT_SECRET` | string aleatorio largo (genera con python secrets) |
   | `ADMIN_USERNAME` | `admin` |
   | `ADMIN_PASSWORD` | tu contrasena segura |
   | `GMAIL_USER` | tu correo Gmail |
   | `GMAIL_APP_PASSWORD` | app password de Gmail |
   | `EMAIL_RECIPIENT` | correo que recibe el reporte |
   | `CORS_ORIGINS` | URL de Vercel (se agrega en paso 4) |
   | `CRON_SECRET` | string aleatorio para el cron |

4. Deploy → verifica: `https://tu-api.onrender.com/api/health`

### Paso 3: Vercel (Frontend)

1. Crea cuenta en **https://vercel.com** → conecta GitHub
2. **Add New → Project** → importa el repo
3. Root Directory: `frontend`
4. Variable de entorno: `VITE_API_URL = https://tu-api.onrender.com`
5. Deploy

### Paso 4: Conectar CORS

En Render → Environment → `CORS_ORIGINS = https://tu-app.vercel.app`

### Paso 5: cron-job.org (Correo diario)

1. Crea cuenta en **https://cron-job.org**
2. Nuevo cron job:
   - URL: `https://tu-api.onrender.com/api/cron/daily-report`
   - Metodo: POST
   - Schedule: 21:00 `America/Mexico_City`
   - Header: `Authorization: Bearer TU_CRON_SECRET`

---

## Como Usar la App

### Iniciar sesion
1. Abre la app → pantalla de login
2. Ingresa usuario y contrasena
3. El admin ve todas las secciones; el empleado ve Venta, Inventario y Mis Ventas
4. Para cerrar sesion: ir a "Mis Ventas" (o "Historial") → boton "Cerrar sesion"

### Registrar una venta
1. Pantalla "Venta" (principal)
2. Toca un producto para agregarlo al carrito
3. Toca de nuevo para aumentar cantidad (o usa +/-)
4. Selecciona metodo de pago (Efectivo o Transferencia)
5. Toca "Registrar $XX"

### Gestionar productos (admin)
1. Ve a "Inventario"
2. **Nuevo producto:** boton "+ Nuevo" arriba a la derecha
3. **Editar producto:** icono de lapiz en cada fila → cambia nombre, precio, umbral o desactivalo
4. Ajusta stock con los botones +/- o editando el numero directamente

### Ver resumen del dia (admin)
- Pantalla "Resumen" → total vendido, numero de ventas, top productos, desglose por metodo de pago

### Ver historial
- Empleado: "Mis Ventas" → solo sus propias ventas
- Admin: "Historial" → todas las ventas, filtrables por fecha

### Gestionar usuarios (admin)
1. Pantalla "Usuarios"
2. Crear empleado con usuario + contrasena
3. Activar/desactivar empleados existentes

### Instalar como app (PWA)
- **Android (Chrome):** Menu → "Agregar a pantalla de inicio"
- **iPhone (Safari):** Boton compartir → "Agregar a inicio"

---

## Proximos Pasos

- Sistema de descuentos (porcentaje o monto fijo por venta)
- Reportes semanales y mensuales
- Categorias de productos
- Exportacion a CSV/Excel de ventas e inventario
- Cancelacion/devolucion de ventas
- Cambio de contrasena desde la app
- Alembic para migraciones de BD formales
- Backup automatico de BD
