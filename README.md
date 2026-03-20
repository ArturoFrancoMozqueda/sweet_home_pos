# Sweet Home POS

Sistema de punto de venta para Sweet Home - Galletas y Postres.

Aplicacion web movil, offline-first, para registrar ventas diarias de forma rapida desde el celular.

## Funcionalidades

- **Registro de ventas** rapido en 3-4 toques
- **Descuento automatico** de inventario al vender
- **Funciona sin internet** (offline-first con sincronizacion)
- **Resumen diario** con totales, productos mas vendidos, desglose por pago
- **Historial de ventas** con filtro por fecha
- **Gestion de inventario** con alertas de stock bajo
- **Correo automatico** con resumen diario a las 9:00 PM hora Mexico

## Stack

- **Backend**: Python + FastAPI + SQLite + SQLAlchemy
- **Frontend**: React + TypeScript + Vite + PWA
- **Offline**: IndexedDB via Dexie.js + Service Worker
- **Email**: Gmail SMTP con App Password
- **Scheduler**: APScheduler (in-process)

## Requisitos

- Python 3.11+
- Node.js 18+
- npm 9+

## Instalacion

### 1. Clonar el repositorio

```bash
git clone <repo-url>
cd sweet_home_pos
```

### 2. Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Frontend

```bash
cd frontend
npm install
```

### 4. Variables de entorno

```bash
# En la carpeta backend/, crear archivo .env
cp .env.example .env
```

Editar `backend/.env` con tus credenciales:

```env
DATABASE_URL=sqlite+aiosqlite:///./sweet_home.db
GMAIL_USER=galletasweethome@gmail.com
GMAIL_APP_PASSWORD=tu-app-password-aqui
EMAIL_RECIPIENT=galletasweethome@gmail.com
TIMEZONE=America/Mexico_City
DAILY_REPORT_HOUR=21
DAILY_REPORT_MINUTE=0
CORS_ORIGINS=http://localhost:5173
```

## Ejecucion

### Backend (terminal 1)

```bash
cd backend
# Activar venv si no esta activo
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

El backend inicia en http://localhost:8000

- Documentacion API: http://localhost:8000/docs
- Al iniciar, crea la base de datos y siembra el catalogo de 18 productos

### Frontend (terminal 2)

```bash
cd frontend
npm run dev
```

El frontend inicia en http://localhost:5173

### Acceder desde celular

Para acceder desde tu celular en la misma red WiFi:

1. Encuentra la IP de tu computadora (ej: `192.168.1.100`)
2. En `backend/.env`, actualiza: `CORS_ORIGINS=http://192.168.1.100:5173`
3. En `frontend/.env`, actualiza: `VITE_API_URL=http://192.168.1.100:8000`
4. Abre `http://192.168.1.100:5173` en el navegador del celular
5. Chrome mostrara opcion "Agregar a pantalla de inicio" para instalar como app

## Configurar Gmail App Password

Para que el correo diario funcione, necesitas una App Password de Gmail:

1. Ve a https://myaccount.google.com/security
2. Activa **Verificacion en 2 pasos** si no esta activa
3. Ve a https://myaccount.google.com/apppasswords
4. En "Selecciona la app", elige **Correo**
5. En "Selecciona el dispositivo", elige **Otro** y escribe "Sweet Home POS"
6. Haz clic en **Generar**
7. Copia la contrasena de 16 caracteres (sin espacios)
8. Pegala en `backend/.env` como `GMAIL_APP_PASSWORD`

## Estrategia Offline

La app funciona offline de la siguiente manera:

1. **PWA**: La app se instala como Progressive Web App. Todos los archivos se cachean con un Service Worker.
2. **IndexedDB**: Las ventas se guardan primero en IndexedDB (via Dexie.js) con un UUID unico.
3. **Sync**: Cuando hay internet, las ventas pendientes se envian al servidor en batch.
4. **Deduplicacion**: El servidor usa el UUID de cada venta para evitar duplicados.
5. **Triggers de sync**: Al abrir la app, al recuperar conexion, o con el boton manual.

## Probar el correo

Para enviar un correo de prueba sin esperar a las 9PM:

```bash
curl -X POST http://localhost:8000/api/reports/send-test
```

## Endpoints API

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | /api/health | Health check |
| GET | /api/products | Listar productos |
| PUT | /api/products/{id}/stock | Actualizar stock |
| GET | /api/products/low-stock | Productos con stock bajo |
| POST | /api/sales | Registrar venta |
| GET | /api/sales | Historial de ventas |
| GET | /api/reports/daily | Resumen del dia |
| POST | /api/reports/send-test | Enviar correo de prueba |
| POST | /api/sync | Sincronizar ventas offline |

## Estructura del Proyecto

```
sweet_home_pos/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app
│   │   ├── config.py         # Settings
│   │   ├── database.py       # SQLAlchemy
│   │   ├── seed.py           # Catalogo inicial
│   │   ├── models/           # Modelos DB
│   │   ├── schemas/          # Schemas Pydantic
│   │   ├── routers/          # Endpoints API
│   │   └── services/         # Email, reportes, scheduler
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── db/               # Dexie.js + sync
│   │   ├── hooks/            # React hooks
│   │   ├── pages/            # 5 pantallas
│   │   ├── components/       # Componentes UI
│   │   ├── services/         # API client
│   │   └── styles/           # CSS mobile-first
│   ├── vite.config.ts        # PWA config
│   └── package.json
└── README.md
```
