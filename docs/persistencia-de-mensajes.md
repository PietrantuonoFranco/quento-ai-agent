# Persistencia del historial de conversación

Qué se persiste: el historial de la conversación por número de teléfono, es decir, una lista de `types.Content` de Gemini. Incluye los mensajes del cliente, las respuestas del modelo, las llamadas a tools y sus resultados.

Opciones evaluadas: memoria del proceso, Redis y Postgres.

## Comparación rápida

| | Memoria | Redis | Postgres |
|---|---|---|---|
| Infraestructura nueva | No | Sí | No (ya está en `docker-compose.yaml`) |
| Sobrevive a deploys y reinicios | No | Solo con persistencia configurada | Sí |
| Varias instancias del host | No | Sí | Sí |
| Expiración automática (TTL) | No | Sí | No (limpieza periódica) |
| Consultar y auditar conversaciones | No | No | Sí (SQL) |
| Velocidad | Instantánea | Muy rápida | Rápida (irrelevante a este volumen) |
| Esfuerzo inicial | Mínimo | Medio | Medio |

## Memoria (dict en el proceso)

**Pros**
- No requiere infraestructura ni dependencias.
- Es lo más rápido de escribir y de testear.
- Lectura instantánea.
- Alcanza para probar el agente y para la primera versión de la Fase 3.

**Contras**
- Se pierde todo en cada deploy o reinicio. En Railway o Cloud Run pasa seguido, y a mitad de una reserva el agente olvida lo que estaba haciendo.
- No escala a más de una instancia: dos réplicas no comparten historial.
- Crece sin límite si no se purga.
- No hay auditoría de lo que se dijo.

## Redis

**Pros**
- Es muy rápido y tiene expiración nativa (TTL): olvidar la conversación tras 24 horas es una línea.
- Funciona con varias instancias.
- Sirve para otras necesidades del host: deduplicar `message.id` con `SET NX`, limitar mensajes por usuario y evitar procesar dos mensajes del mismo cliente a la vez (locks).

**Contras**
- Es un servicio más para desplegar, pagar y mantener. Hoy el stack es Postgres más un Worker.
- Sin persistencia configurada, un reinicio de Redis también borra todo. Con persistencia sigue siendo más volátil que una base de datos.
- No permite consultar ni auditar conversaciones: no hay SQL.
- Para el volumen de un club de pádel, su velocidad no se justifica.

## Postgres

**Pros**
- Ya está en `docker-compose.yaml`: no hay infraestructura nueva.
- Sobrevive a deploys y reinicios.
- Se pueden consultar, auditar y depurar conversaciones con SQL, útil para afinar el prompt y para presentar el proyecto.
- Se puede purgar por fecha y sacar métricas.
- El historial queda ligado al teléfono y, si se quiere, al booker.

**Contras**
- Cada mensaje implica una lectura y una escritura a la base. Con este volumen es irrelevante, pero es más lento que Redis.
- No tiene TTL automático: hace falta una limpieza periódica.
- Hay que serializar el historial. Gemini exige que se le devuelvan sus partes tal cual, incluidas las firmas de razonamiento (*thought signatures*). Si se guarda solo el texto y se pierden, el modelo puede fallar o razonar peor. La solución es guardar cada `Content` como JSON (`model_dump`).
- Hay que definir el esquema y las migraciones: hoy Drizzle vive en `mcp-server` y el host es Python.

## Recomendación

1. **Ahora: memoria**, detrás de una interfaz chica (`get(phone)` / `save(phone, history)`). No conviene invertir tiempo antes de ver el agente funcionando por WhatsApp.
2. **Después: Postgres**, con una tabla propia del host. No usar la tabla `messages`, que pertenece al chat de partidos. Es lo que mejor encaja con el stack, y agregar Redis solo para esto no se justifica.
3. **Redis:** solo si más adelante aparecen problemas de latencia, se necesita rate limiting fuerte o hay varias instancias con mucho tráfico.

## Buenas prácticas, sea cual sea la opción

- **Recortar el historial** (últimos N turnos o últimas 24 horas) para que el costo por mensaje y la latencia no crezcan.
- **No reenviar resultados viejos de tools completos**: alcanza con conservar la conversación y los resultados recientes.
- **Guardar los `Content` sin alterarlos**, para no perder las firmas de razonamiento de Gemini.
- Un cliente puede escribir dos mensajes seguidos: procesarlos en orden para no pisar el historial.
