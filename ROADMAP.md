# Roadmap: agente de WhatsApp

Objetivo: un agente que atienda clientes por WhatsApp y les permita reservar o cancelar turnos, unirse o salir de partidos abiertos y consultar información del club, usando Gemini y el MCP server existente.

## Arquitectura

```
WhatsApp (Meta Cloud API) ──webhook──▶ mcp-host (FastAPI)
                                          │  1. valida firma y deduplica el mensaje
                                          │  2. carga el historial de la conversación
                                          │  3. loop del agente con Gemini (function calling)
                                          │  4. responde por la API de WhatsApp
                                          ▼
                                    MCP server (Worker) ──▶ Postgres
```

`mcp-host` es el cerebro del agente. Solo habla con WhatsApp y con el MCP server.

## Decisiones de diseño

- **El teléfono lo inyecta el host, no el modelo.** El número real viene del webhook. Se sobreescribe `phoneNumber` en los argumentos antes de llamar al MCP (mejor aún: se quita del schema que ve Gemini). Así el LLM no puede operar sobre reservas de otra persona.
- **Confirmación explícita** del cliente antes de `create_booking`, `cancel_booking` y `reschedule_booking`.
- **Registro perezoso:** el booker se busca o crea recién cuando el cliente confirma que quiere reservar, no al empezar la conversación. Las consultas (horarios, info del club, partidos abiertos) no lo necesitan. En ese momento el agente llama a `is_booker_registered`; si da `false`, pide nombre y apellido, llama a `register_booker` y recién entonces `create_booking`. Evita pedir datos a quien solo consulta y no crea bookers innecesarios. A verificar: `join_match` y `leave_match` usan `playerId`, así que unirse a un partido puede requerir registro también.
- **Nombre del usuario:** WhatsApp solo entrega `wa_id` (el teléfono) y `profile.name` (nombre de perfil, texto libre que puede ser un apodo, un emoji o faltar). No hay forma de obtener nombre y apellido reales por la API. El host pasa `profile.name` al agente como contexto y como sugerencia ("¿Te registro como Fran? Pasame también tu apellido"). El nombre y apellido definitivos se piden en la conversación, solo la primera vez, y el LLM los extrae de la respuesta libre para llamar a `register_booker`.
- **Modelo:** `gemini-2.5-flash` (tool calling, barato). El free tier tiene límites de rate para producción.
- **Sin frameworks de orquestación al inicio:** loop propio con el SDK `google-genai` (ver "Preguntas abiertas").

## Fases

### Fase 1 · Cliente MCP ✅
- [x] Agregar `MCP_API_KEY` a `config.py` y `.env.example`.
- [x] Enviar el header `x-api-key` en `client.py`.
- [x] Agregar `list_tools()` al cliente.
- [x] Reutilizar la sesión MCP (una sola conexión, se reabre y reintenta una vez si se cae).
- [x] Los errores de las tools (`isError`) se lanzan como `ToolError` con el mensaje del server.
- [x] Conexión abierta/cerrada en el `lifespan` de FastAPI.
- [x] Tests con pytest (25) y prueba manual contra el server real (17 tools, errores, 20 llamadas concurrentes).

### Fase 2 · Agente con Gemini (por consola)
- [x] Agregar la dependencia `google-genai` y `GEMINI_API_KEY` / `GEMINI_MODEL` a la config.
- [x] Puente MCP → Gemini (`tools.py`): las tools del server se convierten a `FunctionDeclaration` sin escribirlas a mano.
- [x] `agent.py`: loop de function calling con límite de 8 iteraciones, llamadas en paralelo y respuesta de respaldo si Gemini no devuelve nada.
- [x] Los errores de las tools se devuelven al modelo para que los explique (los inesperados, sin detalles internos).
- [x] Inyección de `phoneNumber` / `bookerPhoneNumber` desde el host: se quitan del schema que ve Gemini y se pisan al llamar.
- [x] `profile.name` como contexto en el prompt (aplanado y truncado, porque lo escribe el usuario).
- [x] Flujo de registro perezoso descrito en el prompt.
- [x] `prompts.py`: español rioplatense, tono breve, sin precios, fecha y hora actuales del club.
- [x] `chat.py`: chat por consola (`uv run python chat.py`).
- [x] Tests con mocks (55 en total en `mcp-host`).
- [ ] **Probar con Gemini real** y afinar el prompt (hace falta `GEMINI_API_KEY` en `mcp-host/.env`).
- [ ] **Bloqueado en el server:** `join_match` / `leave_match` reciben un `playerId` y ninguna tool lo obtiene a partir del teléfono, además `join_match` no valida cupo, estado del partido ni duplicados. Por eso el agente las tiene ocultas (`HIDDEN_TOOLS` en `tools.py`). Hay que cambiarlas en `mcp-server` para que resuelvan el jugador por teléfono y validen.

### Fase 3 · WhatsApp y memoria
- [ ] `GET /webhook`: verificación de Meta.
- [ ] `POST /webhook`: validar firma `X-Hub-Signature-256`.
- [ ] Responder 200 enseguida y procesar en background.
- [ ] Deduplicar por `message.id` (Meta reintenta).
- [ ] Leer `contacts[0].wa_id` y `contacts[0].profile.name` del payload del webhook.
- [ ] Enviar respuestas por la API de WhatsApp.
- [ ] Memoria por número de teléfono (últimos N mensajes o último día). Empezar en memoria, luego Redis o Postgres.
- [ ] Manejar mensajes que no son texto (audio, imagen): responder que solo se atiende por texto.

### Fase 4 · Calidad y deploy
- [ ] Tests del agente mockeando Gemini y el MCP.
- [ ] Casos de prueba de conversaciones completas (reservar, cancelar, unirse a partido).
- [ ] Deploy del host (Cloud Run, Fly o Railway) con HTTPS público.
- [ ] Configurar el webhook en Meta con el número de prueba.
- [ ] Logging por conversación y manejo de errores del LLM (rate limit, timeouts).
- [ ] Ampliar el workflow de CI si hace falta.

### Fase 5 · Mejoras posteriores
- [ ] Escalar a un humano cuando el agente no puede resolver.
- [ ] Recordatorios de turnos.
- [ ] Guardrails: límite de mensajes por usuario, detección de abuso.
- [ ] Evaluar migrar a un framework de orquestación si el flujo se complica.

## Preguntas abiertas

- ¿Dónde persistir el historial (memoria, Redis, Postgres)?
- ¿Dónde desplegar el host?
- ¿Cuándo se necesita la cuenta de WhatsApp Business aprobada (producción) frente al número de prueba?
