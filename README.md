# Sweet Home POS

Sistema de punto de venta para **Sweet Home — Galletas y Postres**.

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
- Funciona sin internet (offline-first con sincronizacion)
- Resumen diario con totales, productos mas vendidos, desglose por pago
- Historial de ventas con filtro por fecha
- Gestion de inventario con alertas de stock bajo
- Correo automatico con resumen diario a las 9:00 PM hora Mexico

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
        ORM["SQLAlchemy Async"]
        SCH["APScheduler"]
        EMAIL["Gmail SMTP"]
        API --> ORM
        SCH --> EMAIL
        SCH --> ORM
    end

    subgraph DB["Base de Datos"]
        PG["PostgreSQL (Neon)"]
    end

    UI -- "POST /api/sync\n(ventas pendientes)" --> API
    API -- "productos actualizados" --> UI
    ORM --> PG
    SW -- "Cache assets + API" --> UI

    style Celular fill:#fef3e2,stroke:#d4845a,color:#333
    style Backend fill:#e8f4e8,stroke:#4a9e4a,color:#333
    style DB fill:#e2ecf6,stroke:#4a7eb5,color:#333
```

**Flujo principal:**
1. El usuario abre la PWA en su celular
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
        BE["Backend FastAPI\n+ Scheduler"]
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
| **Render** | Backend FastAPI | 750 hrs/mes, duerme tras 15 min inactivo |
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

    Product ||--o{ SaleItem : "se vende en"
    Sale ||--|{ SaleItem : "contiene"
```

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
| payment_method | String(20) | requerido | "efectivo" o "transferencia" |
| created_at | DateTime | requerido | Hora de la venta (zona Mexico) |
| synced_at | DateTime | UTC now | Cuando se sincronizo |

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

## Flujo UX — Registrar Venta

```mermaid
flowchart TD
    A["Abrir app"] --> B["Pantalla Registrar Venta"]
    B --> C["Tap en producto\n(se agrega al carrito)"]
    C --> D{"Mas productos?"}
    D -- Si --> C
    D -- No --> E["Seleccionar metodo de pago\n(Efectivo / Transferencia)"]
    E --> F["Tap en 'Registrar $XX'"]
    F --> G["Venta guardada en IndexedDB"]
    G --> H{"Hay internet?"}
    H -- Si --> I["Sync automatico al backend"]
    H -- No --> J["Se sincroniza despues"]

    style A fill:#d4845a,stroke:#333,color:#fff
    style F fill:#4a9e4a,stroke:#333,color:#fff
    style G fill:#4a7eb5,stroke:#333,color:#fff
```

**Minimo 3 toques:**
1. Tap en producto (se agrega con cantidad 1)
2. Seleccionar metodo de pago
3. Tap en "Registrar"

---

## Stack Tecnologico

| Componente | Tecnologia | Justificacion |
|------------|-----------|---------------|
| **Backend** | Python + FastAPI | Async, rapido, validacion con Pydantic |
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
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI app, lifespan, CORS, routers, cron endpoint
│   │   ├── config.py               # Settings con pydantic-settings (.env)
│   │   ├── database.py             # SQLAlchemy async engine (SQLite o PostgreSQL)
│   │   ├── seed.py                 # Seed del catalogo (18 productos)
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── product.py          # Modelo Product
│   │   │   └── sale.py             # Modelos Sale + SaleItem
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── product.py          # Schemas Pydantic de productos
│   │   │   ├── sale.py             # Schemas de ventas
│   │   │   └── sync.py             # Schemas del payload de sincronizacion
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── products.py         # GET productos, POST crear, PUT stock
│   │   │   ├── sales.py            # POST venta, GET historial con filtros
│   │   │   ├── reports.py          # GET resumen diario, POST enviar correo test
│   │   │   └── sync.py             # POST sync batch de ventas offline
│   │   └── services/
│   │       ├── __init__.py
│   │       ├── email_service.py    # Gmail SMTP + template HTML bonito
│   │       ├── report_service.py   # Generacion de datos del resumen diario
│   │       └── scheduler.py        # APScheduler cron (9PM Mexico)
│   ├── requirements.txt
│   ├── .env                        # Variables de entorno (NO se sube a git)
│   └── .env.example                # Template de variables
├── frontend/
│   ├── public/
│   │   └── icons/
│   │       ├── icon-192.svg        # Icono PWA 192x192
│   │       └── icon-512.svg        # Icono PWA 512x512
│   ├── src/
│   │   ├── main.tsx                # Entry point React
│   │   ├── App.tsx                 # Router + Layout con BottomNav
│   │   ├── vite-env.d.ts           # Tipos Vite
│   │   ├── types/
│   │   │   └── index.ts            # Interfaces TypeScript compartidas
│   │   ├── db/
│   │   │   ├── database.ts         # Schema Dexie.js (products, sales, saleItems)
│   │   │   └── sync.ts             # Logica de sincronizacion con backend
│   │   ├── hooks/
│   │   │   ├── useOnlineStatus.ts  # Detecta online/offline + auto-sync
│   │   │   └── useProducts.ts      # Hook para obtener productos
│   │   ├── services/
│   │   │   └── api.ts              # Fetch wrapper con VITE_API_URL
│   │   ├── pages/
│   │   │   ├── RegisterSale.tsx    # Pantalla principal: registrar venta rapido
│   │   │   ├── Catalog.tsx         # Ver catalogo de productos
│   │   │   ├── Inventory.tsx       # Gestionar stock, alertas de bajo inventario
│   │   │   ├── DailySummary.tsx    # Resumen del dia
│   │   │   └── SalesHistory.tsx    # Historial con filtro por fecha
│   │   ├── components/
│   │   │   ├── BottomNav.tsx       # Navegacion inferior (5 tabs)
│   │   │   ├── ProductGrid.tsx     # Grid de productos (touch targets grandes)
│   │   │   ├── SyncIndicator.tsx   # Indicador de estado online/sync
│   │   │   └── Toast.tsx           # Notificaciones
│   │   └── styles/
│   │       ├── global.css          # Reset + variables CSS + tema
│   │       ├── pages.css           # Estilos por pagina
│   │       └── components.css      # Estilos de componentes
│   ├── index.html                  # HTML base con meta tags moviles
│   ├── vite.config.ts              # Vite + PWA plugin config
│   ├── tsconfig.json               # TypeScript config
│   └── package.json                # Dependencias npm
├── .env.example                    # Template de variables global
├── .gitignore
└── README.md                       # Esta documentacion
```

---

## API Endpoints

Base URL: `https://sweet-home-pos.onrender.com` (produccion) o `http://localhost:8000` (local)

### Health

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/api/health` | Health check. Responde `{"status": "ok"}` |

### Productos

| Metodo | Ruta | Params | Descripcion |
|--------|------|--------|-------------|
| GET | `/api/products` | `?active_only=true` | Listar productos (activos por default) |
| POST | `/api/products` | Body: ProductCreate | Crear producto nuevo |
| PUT | `/api/products/{id}/stock` | Body: `{"stock": 10}` | Actualizar stock de un producto |
| GET | `/api/products/low-stock` | — | Productos con stock bajo el umbral |

### Ventas

| Metodo | Ruta | Params | Descripcion |
|--------|------|--------|-------------|
| POST | `/api/sales` | Body: SaleCreate | Registrar venta (descuenta stock) |
| GET | `/api/sales` | `?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&limit=50&offset=0` | Historial de ventas |
| GET | `/api/sales/count` | `?date_from=&date_to=` | Contar ventas en rango de fechas |

### Reportes

| Metodo | Ruta | Params | Descripcion |
|--------|------|--------|-------------|
| GET | `/api/reports/daily` | `?date=YYYY-MM-DD` | Resumen del dia (hoy si no se pasa fecha) |
| POST | `/api/reports/send-test` | — | Enviar correo de prueba con datos de hoy |

### Sincronizacion

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | `/api/sync` | Enviar batch de ventas offline. Retorna UUIDs sincronizados + productos actualizados |

### Cron Externo

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| POST | `/api/cron/daily-report` | Header `Authorization: Bearer {CRON_SECRET}` | Dispara envio de email diario |

---

## Variables de Entorno

### Backend (`backend/.env`)

| Variable | Tipo | Default | Descripcion |
|----------|------|---------|-------------|
| `DATABASE_URL` | string | `sqlite+aiosqlite:///./sweet_home.db` | URL de conexion. SQLite para local, PostgreSQL para produccion |
| `GMAIL_USER` | string | `""` | Cuenta Gmail para enviar correos |
| `GMAIL_APP_PASSWORD` | string | `""` | App Password de Gmail (16 caracteres) |
| `EMAIL_RECIPIENT` | string | `""` | Email que recibe el resumen diario |
| `TIMEZONE` | string | `America/Mexico_City` | Zona horaria para reportes |
| `DAILY_REPORT_HOUR` | int | `21` | Hora del correo diario (9 PM) |
| `DAILY_REPORT_MINUTE` | int | `0` | Minuto del correo diario |
| `CORS_ORIGINS` | string | `http://localhost:5173` | URLs permitidas (separadas por coma) |
| `CRON_SECRET` | string | `""` | Token Bearer para el endpoint de cron externo |

### Frontend (`frontend/.env`)

| Variable | Tipo | Default | Descripcion |
|----------|------|---------|-------------|
| `VITE_API_URL` | string | `http://localhost:8000` | URL del backend |

---

## Catalogo de Productos (Seed)

18 productos sembrados automaticamente al iniciar el backend:

| # | Producto | Precio (MXN) |
|---|----------|-------------|
| 1 | Galletas tipo New York | $45 |
| 2 | Galletas de canela | $3 |
| 3 | Galletas nuez | $3 |
| 4 | Galletas de chispas de chocolate | $20 |
| 5 | Galletas de arandano con avena | $20 |
| 6 | Alfajores | $15 |
| 7 | Empanadas de mermelada | $15 |
| 8 | Empanadas de hojaldre | $25 |
| 9 | Pan de elote | $25 |
| 10 | Pastel de zanahoria (rebanada) | $45 |
| 11 | Pastel de chocolate (rebanada) | $45 |
| 12 | Pay de limon (rebanada) | $25 |
| 13 | Pay de queso (rebanada) | $25 |
| 14 | Flan (rebanada) | $25 |
| 15 | Galletas decoradas (grandes) | $45 |
| 16 | Galletas decoradas (chicas) | $30 |
| 17 | Paquetes chicos de galletas (nuez o canela) | $50 |
| 18 | Paquete grande de galletas (nuez o canela) | $75 |

Todos inician con `stock=0` y `low_stock_threshold=5`. El stock se ajusta manualmente desde la pantalla de Inventario.

---

## Setup Local (Desarrollo)

### Requisitos

- Python 3.11+
- Node.js 18+
- npm 9+
- Git

### 1. Clonar el repositorio

```bash
git clone https://github.com/ArturoFrancoMozqueda/sweet_home_pos.git
cd sweet_home_pos
```

### 2. Backend

```bash
cd backend

# Crear entorno virtual
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

Editar `backend/.env` con tus datos (para desarrollo local solo necesitas los defaults).

### 3. Frontend

```bash
cd frontend
npm install
```

### 4. Ejecutar

Necesitas **dos terminales**:

**Terminal 1 — Backend:**
```bash
cd backend
# Activar venv si no esta activo
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

### 5. Abrir la app

- **Navegador:** http://localhost:5173
- **API Docs:** http://localhost:8000/docs
- **Modo movil:** En Chrome DevTools (F12) activar modo responsive

### 6. Acceder desde celular (misma red WiFi)

1. Busca la IP de tu computadora (ej: `192.168.1.100`)
2. En `backend/.env`: `CORS_ORIGINS=http://192.168.1.100:5173`
3. En `frontend/.env`: `VITE_API_URL=http://192.168.1.100:8000`
4. Reinicia ambos servicios
5. Abre `http://192.168.1.100:5173` en el celular

---

## Setup Produccion (Deploy Gratuito)

Guia paso a paso para desplegar en servicios 100% gratuitos. Ningun servicio pide tarjeta de credito.

### Paso 1: Neon PostgreSQL (Base de datos)

1. Ve a **https://neon.tech** y crea cuenta
2. Crea un nuevo proyecto llamado `sweet-home-pos`
3. Haz clic en **Connect** (boton azul arriba a la derecha)
4. **Desactiva "Connection pooling"** (toggle verde)
5. En el dropdown de la izquierda selecciona **SQLAlchemy** (o copia el string directo)
6. Copia el connection string, se ve asi:
   ```
   postgresql://neondb_owner:tu_password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```
7. Convierte al formato asyncpg:
   - Cambia `postgresql://` por `postgresql+asyncpg://`
   - Cambia `sslmode=require` por `ssl=require`
   - Elimina `&channel_binding=require` si aparece

   Resultado:
   ```
   postgresql+asyncpg://neondb_owner:tu_password@ep-xxx.region.aws.neon.tech/neondb?ssl=require
   ```
8. Guarda este string, lo necesitas en el siguiente paso

### Paso 2: Render.com (Backend)

1. Ve a **https://render.com** y crea cuenta (conecta tu GitHub)
2. Click **New** → **Web Service**
3. Selecciona el repositorio `sweet_home_pos`
4. Configura:

   | Campo | Valor |
   |-------|-------|
   | Name | `sweet-home-pos-api` (o el que quieras) |
   | Language | Python 3 |
   | Branch | main |
   | Root Directory | `backend` |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
   | Instance Type | **Free** |

5. En la seccion **Environment Variables**, agrega:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | (tu URL de Neon del paso 1) |
   | `GMAIL_USER` | `galletasweethome@gmail.com` |
   | `GMAIL_APP_PASSWORD` | (tu app password, o dejalo vacio por ahora) |
   | `EMAIL_RECIPIENT` | `galletasweethome@gmail.com` |
   | `TIMEZONE` | `America/Mexico_City` |
   | `CORS_ORIGINS` | `http://localhost:5173` (se actualiza en el paso 4) |
   | `CRON_SECRET` | (inventa un string largo aleatorio) |

6. Click **Deploy**
7. Espera a que el status cambie a **Live** (~2-3 min)
8. Verifica: abre `https://tu-servicio.onrender.com/api/health`
   - Debe responder: `{"status": "ok", "app": "Sweet Home POS"}`

### Paso 3: Vercel (Frontend)

1. Ve a **https://vercel.com** y crea cuenta (conecta tu GitHub)
2. Click **Add New** → **Project**
3. Selecciona el repositorio `sweet_home_pos` → **Import**
4. Configura:

   | Campo | Valor |
   |-------|-------|
   | Root Directory | `frontend` |
   | Framework Preset | Vite (auto-detectado) |

5. En **Environment Variables**:

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://tu-servicio.onrender.com` (la URL de Render) |

6. Click **Deploy**
7. Espera a que termine (~1-2 min)
8. Anota la URL que te da Vercel (ej: `https://sweet-home-pos.vercel.app`)

### Paso 4: Conectar CORS

1. Ve a **Render** → tu servicio → **Environment**
2. Edita `CORS_ORIGINS` y pon la URL de Vercel:
   ```
   https://sweet-home-pos.vercel.app
   ```
3. Render re-deploya automaticamente
4. Ahora abre la URL de Vercel → los productos deben cargar

> **Nota:** Si dice "No hay productos", puede ser que Render este dormido. Abre primero `https://tu-servicio.onrender.com/api/health` en otra pestaña, espera ~30-50 seg a que responda, y luego recarga la app.

### Paso 5: cron-job.org (Correo diario)

1. Ve a **https://cron-job.org** y crea cuenta gratuita
2. Crea un nuevo cron job:

   | Campo | Valor |
   |-------|-------|
   | Title | `Sweet Home Daily Report` |
   | URL | `https://tu-servicio.onrender.com/api/cron/daily-report` |
   | Request Method | POST |
   | Schedule | Custom: timezone `America/Mexico_City`, hora `21:00` |
   | Request Header | `Authorization: Bearer TU_CRON_SECRET` |
   | Request Timeout | 60 segundos |

3. Activa el cron job

---

## Configurar Gmail App Password

Para que el correo diario funcione, necesitas una App Password de Gmail:

1. Ve a https://myaccount.google.com/security
2. Activa **Verificacion en 2 pasos** si no esta activa
3. Ve a https://myaccount.google.com/apppasswords
4. En "Selecciona la app", elige **Correo**
5. En "Selecciona el dispositivo", elige **Otro** → escribe "Sweet Home POS"
6. Click **Generar**
7. Copia la contrasena de 16 caracteres (sin espacios)
8. En **Render** → Environment → agrega/actualiza `GMAIL_APP_PASSWORD` con ese valor

Para probar que funcione:
```bash
curl -X POST https://tu-servicio.onrender.com/api/reports/send-test
```

---

## Como Usar la App

### Registrar una venta
1. Abre la app (pantalla "Venta" es la principal)
2. Toca un producto para agregarlo al carrito
3. Toca de nuevo para aumentar cantidad (o usa +/-)
4. Selecciona metodo de pago (Efectivo o Transferencia)
5. Toca "Registrar $XX"

### Gestionar inventario
1. Ve a la pantalla "Inventario"
2. Edita el stock de cada producto
3. Los productos con stock en 0 aparecen como "Agotado" y no se pueden vender

### Ver resumen del dia
1. Ve a la pantalla "Resumen"
2. Muestra: total vendido, numero de ventas, top productos, desglose por pago

### Ver historial
1. Ve a la pantalla "Historial"
2. Filtra por rango de fechas
3. Toca una venta para ver el detalle

### Instalar como app (PWA)
- **Android (Chrome):** Menu (3 puntos) → "Agregar a pantalla de inicio"
- **iPhone (Safari):** Boton compartir → "Agregar a inicio"

---

## Preguntas Frecuentes

### El backend esta dormido, afecta mi uso?
No. La app es offline-first. Registras ventas instantaneamente y se sincronizan cuando el backend despierte (~30-50 seg). No necesitas hacer nada manual.

### Puedo usar la app sin internet?
Si. Las ventas se guardan localmente. Cuando vuelva la conexion, se sincronizan automaticamente.

### Como evito ventas duplicadas?
Cada venta tiene un UUID unico. Si la app intenta sincronizar la misma venta dos veces, el servidor la ignora.

### El servicio me va a cobrar?
No. Todos los servicios (Vercel, Render, Neon, cron-job.org) tienen free tier permanente sin tarjeta de credito. Si llegas al limite, dejan de funcionar pero no cobran.

### Como agrego un producto nuevo?
Por ahora via API: `POST /api/products` con el nombre, precio y stock. En una v2 se puede agregar desde la app.

### Como cambio un precio?
Actualmente los precios se definen en el seed. Para v2 se planea edicion desde la app. Mientras tanto se puede hacer via API o directamente en la base de datos.

---

## Proximos Pasos (v2)

- Autenticacion con PIN simple
- Edicion de precios y productos desde la app
- Graficas de ventas (semana/mes)
- Alembic para migraciones de BD
- Categorias de productos
- Notas por venta
- Cancelacion/devolucion de ventas
- Backup automatico de BD
- Docker Compose para deploy en VPS propio
