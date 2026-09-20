# quento-ai-agent

Quento es un asistente conversacional para la gestión de reservas de una cancha de pádel a través de WhatsApp. Un LLM interpreta los mensajes del usuario, decide qué acción tomar y la ejecuta mediante herramientas (tools) expuestas por un **servidor MCP** que a su vez opera sobre una base de datos PostgreSQL.

## Arquitectura

![Arquitectura MCP](docs/mcp-arquitecture/mcp-quento.jpg)

El sistema se divide en dos componentes principales:

- **MCP Client / Host** (`mcp-host/`, Python + FastAPI): corre en Railway. Hoy es un esqueleto (solo expone un health check en `/`); su rol previsto es recibir los mensajes entrantes desde la WhatsApp API, mantener la conversación con el LLM y, cuando el LLM decide usar una herramienta, invocarla contra el MCP Server. También le pasa al LLM la lista de tools disponibles y los datos que las tools devuelven. Se configura con `MCP_SERVER_URL` y `LLM_URL` (ver `mcp-host/.env.example`).
- **MCP Server** (`mcp-server/`): corre como un **Cloudflare Worker**. Expone las herramientas de negocio (reservas, canchas, partidos, etc.) vía el protocolo MCP (Streamable HTTP) y se conecta a la base de datos PostgreSQL a través de **Cloudflare Hyperdrive** (pooling de conexiones y cacheo de queries). La base de datos en producción es un PostgreSQL gestionado en **Supabase**.

Flujo de un mensaje (según el diagrama):

1. El usuario escribe por WhatsApp → llega como `input/query` al MCP Client.
2. El MCP Client pide al MCP Server la lista de `tools` disponibles.
3. El LLM, con el mensaje del usuario y las tools disponibles, decide qué tool usar (`chooses tool`).
4-5. El MCP Client invoca la tool elegida contra el MCP Server (Cloudflare Worker), que resuelve la query contra Postgres vía Hyperdrive.
6-7. El MCP Server devuelve los datos, que el MCP Client le pasa al LLM.
8. El LLM arma la `final response` en base a esos datos.
9. La respuesta se envía de vuelta al usuario por WhatsApp.

### Modelo de datos

![DER](docs/der/DER.jpg)

Entidades principales:

- **account / admin / player / booker**: cuentas de usuario y sus roles (jugador, quien reserva, administrador).
- **courts**, **schedules**, **out_of_services**: canchas, horarios de apertura/cierre por día y períodos fuera de servicio.
- **bookings**: reservas de cancha asociadas a un `booker` y un horario.
- **matchs / match_players**: partidos abiertos a partir de una reserva y los jugadores anotados.
- **penalties**: penalizaciones de puntaje a jugadores.
- **chat_rooms / messages**: chats asociados a un partido.

El esquema vive como código en `mcp-server/src/db/schemas/*.ts` (Drizzle ORM), que es la fuente de verdad sobre el DER. Las tablas se crean con las migraciones de `mcp-server/src/db/migrations/`. Los estados (`courts.court_state`, `bookings.booking_state`, `schedules.day_of_week`, etc.) son columnas `varchar` cuyos valores válidos están en `mcp-server/src/lib/enums/`.

> **Base compartida con la web.** Esta misma base también la consume la web de Quento (`padel-quento`, Next.js + TypeORM). Como el esquema lo gestiona Drizzle, la web debe mapear sus entidades a estas tablas y columnas (con `synchronize: false` y sin correr sus propias migraciones de TypeORM contra esta base).

### Convención de fechas

Los horarios de reservas y partidos se guardan como **hora de pared del club** en columnas `timestamp` sin zona horaria, y las tools los devuelven como ISO con sufijo `Z` que representa esa hora local (por ejemplo `2026-09-19T15:00:00.000Z` = 15:00 en el club). Cuando una tool necesita saber "hoy" usa la zona `America/Argentina/Buenos_Aires` (`CLUB_TIMEZONE` en `mcp-server/src/lib/constants.ts`). Los turnos que ya empezaron no se ofrecen ni se pueden reservar. Los turnos duran 90 minutos (`BOOKING_DURATION_MINUTES`) y forman una grilla fija desde la apertura de cada cancha.

### Tools del MCP Server

| Tool | Descripción |
|---|---|
| `get_available_bookings` | Turnos libres (descuenta reservas y períodos fuera de servicio) para una fecha (`date`, `YYYY-MM-DD`; **si se omite, hoy**) y opcionalmente una cancha (`courtId`) |
| `get_available_times` | Horarios de inicio (`HH:MM`) con al menos una cancha libre en una fecha (hoy por defecto); cada horario aparece una sola vez aunque haya varias canchas |
| `check_time_availability` | Consulta un horario puntual (`time`, `HH:MM`, y `date` opcional): indica si está disponible y qué canchas están libres; si no, devuelve los horarios alternativos del día |
| `get_my_bookings` / `get_booking_details` | Reservas futuras de un teléfono / detalle de una reserva (cancha, hora, estado, partido); solo para su dueño |
| `cancel_booking` / `reschedule_booking` | Cancela o mueve a otro horario (y opcionalmente otra cancha) una reserva futura; validan que el teléfono sea el dueño y que el turno nuevo esté libre |
| `get_club_info` | Cantidad de canchas por estado, horarios de apertura por día, duración del turno y zona horaria (no incluye precios ni política de cancelación) |
| `create_booking` | Reserva un turno futuro para un booker registrado (`courtId`, `bookerPhoneNumber`, `datetime`); valida grilla y disponibilidad |
| `is_booker_registered` / `register_booker` | Consulta / alta de quien reserva, identificado por teléfono |
| `list_courts` / `get_court_status` | Canchas (filtrables por estado) y estado de una cancha puntual |
| `get_open_matches` | Partidos que buscan jugadores, filtrables por fecha, cancha o categoría |
| `create_match_from_booking` | Convierte una reserva futura en un partido abierto que busca jugadores (pasa la reserva a `pending_players`) |
| `join_match` / `leave_match` | Sumar o quitar a un jugador de un partido |

### Estructura del repo

```
.
├── docker-compose.yaml       # Postgres local para desarrollo
├── docs/
│   ├── mcp-arquitecture/     # Diagrama de arquitectura (.drawio / .jpg)
│   └── der/                  # Diagrama entidad-relación (.drawio / .jpg)
├── mcp-host/                  # Cliente/host MCP (FastAPI, Python + uv), desplegado en Railway
└── mcp-server/                 # Servidor MCP (Cloudflare Worker) + acceso a datos
    ├── src/
    │   ├── index.ts           # Entry point del Worker (fetch handler, auth, MCP transport)
    │   ├── server.ts          # Fábrica del McpServer (uno por request) con sus tools registradas
    │   ├── tools/             # Tools MCP agrupadas por dominio (bookings, courts, matches, booker)
    │   ├── db/
    │   │   ├── schemas/       # Esquema Drizzle (fuente de verdad del DER)
    │   │   ├── queries/       # Queries por entidad
    │   │   ├── migrations/    # Migraciones generadas por drizzle-kit
    │   │   └── seeds/         # Seed de canchas y horarios (seed.ts)
    │   ├── schemas/           # Schemas zod de entrada de las tools
    │   └── lib/               # Enums, constantes e interfaces compartidas
    ├── dev-server.ts          # Servidor HTTP plano para probar el Worker en local sin Wrangler
    └── wrangler.jsonc         # Config de Cloudflare Worker + binding de Hyperdrive
```

## Probar en local

Se necesita: Node.js, [pnpm](https://pnpm.io/) y Docker (para levantar Postgres).

### 1. Base de datos

Desde la raíz del repo:

```bash
cp .env.example .env
# completar POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB si se quiere cambiar el default
docker compose up -d
```

Esto levanta un Postgres 16 en `localhost:5432` (contenedor `padel-quento-db`, volumen `padel_quento_pgdata`). El compose de la web (`padel-quento`) usa el mismo nombre de contenedor y de volumen, así que no se pueden levantar los dos a la vez: usá uno solo. Si ya tenías la base de la web levantada con otro esquema, hay que borrar el volumen (`docker compose down -v`) para empezar de cero con el de Drizzle.

### 2. MCP Server

```bash
cd mcp-server
cp .env.example .env
```

Completar `mcp-server/.env`:

```
DATABASE_URL="postgres://<POSTGRES_USER>:<POSTGRES_PASSWORD>@localhost:5432/<POSTGRES_DB>"
MCP_API_KEY="cualquier-string-secreto-para-local"
PORT=8787
```

Instalar dependencias, aplicar las migraciones y cargar los datos iniciales:

```bash
pnpm install
pnpm db:migrate   # crea las tablas a partir de src/db/migrations
pnpm seed         # 8 canchas con horario 09:00-23:00 todos los días (idempotente)
```

Si cambiás los schemas de `src/db/schemas/`, generá una migración nueva con `pnpm db:generate` y aplicala con `pnpm db:migrate`. Evitá `pnpm db:push` sobre una base compartida con la web: modifica el esquema directamente sin dejar migración.

El seed no crea cuentas de usuario: `accounts`, `admins` y `players` se cargan aparte (por ejemplo desde la web).

Levantar el servidor sin depender de Wrangler (recomendado para desarrollo rápido, usa `.env` directamente):

```bash
pnpm dev:local
```

Esto expone el Worker en `http://localhost:8787` mediante un servidor HTTP de Node (`dev-server.ts`) que traduce requests/responses al formato Web estándar que espera el `fetch` handler del Worker.

Alternativa: correrlo con el runtime real de Cloudflare (`workerd`) usando Wrangler:

```bash
pnpm dev
```

En este caso las variables de entorno deben estar en `mcp-server/.dev.vars` (Wrangler no lee `.env`), y la conexión a Postgres usa el `localConnectionString` del binding `hyperdrive` en `wrangler.jsonc`.

### 3. Probar el servidor

Health check:

```bash
curl http://localhost:8787/health
```

El protocolo MCP usa Streamable HTTP: toda request POST necesita los headers `Content-Type: application/json`, `Accept: application/json, text/event-stream` y `x-api-key` con el valor de `MCP_API_KEY`.

Listar herramientas disponibles:

```bash
curl -s -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: <MCP_API_KEY>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Invocar una tool (ejemplo, `get_available_bookings`; sin `date` usa la fecha de hoy):

```bash
curl -s -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: <MCP_API_KEY>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_available_bookings","arguments":{}}}'
```

Para una fecha y cancha puntuales: `"arguments":{"date":"2026-09-22","courtId":1}`.

## Tests

Son unitarios y no necesitan base de datos ni Docker: las queries se mockean y la fecha "actual" se fija con fake timers.

```bash
# MCP Server (Vitest): tools, schemas zod, clubTime y el fetch handler (auth, tools/list, concurrencia)
cd mcp-server
pnpm test          # una corrida; pnpm test:watch para modo watch

# MCP Host (pytest): cliente MCP, config y health check
cd mcp-host
uv run pytest
```

GitHub Actions (`.github/workflows/tests.yml`) corre ambos conjuntos en cada push y pull request.

Los tests del server viven en `mcp-server/test/` y los del host en `mcp-host/tests/`. No prueban contra Postgres real, Wrangler ni el Worker desplegado.

## Probar / desplegar en la nube

El MCP Server se despliega como Cloudflare Worker:

```bash
cd mcp-server
pnpm deploy   # wrangler deploy
```

Requisitos previos en Cloudflare:

- Un binding de **Hyperdrive** (`DB` en `wrangler.jsonc`) apuntando a la base de datos de producción (Supabase Postgres). El `id` del binding se configura desde el dashboard de Cloudflare o `wrangler hyperdrive create`.
- El secreto `MCP_API_KEY` cargado con Wrangler (no se sube al repo):

```bash
wrangler secret put MCP_API_KEY
```

Una vez desplegado, el Worker queda accesible en la URL pública que asigna Cloudflare, y se prueba igual que en local (mismos headers y mismo formato de requests), apuntando a esa URL en vez de `localhost:8787`.

El **MCP Client** se despliega en Railway y es el que efectivamente consume el MCP Server en producción: recibe los webhooks de la WhatsApp API, mantiene la conversación con el LLM y llama al Worker desplegado usando la URL pública y el `MCP_API_KEY` de producción.
