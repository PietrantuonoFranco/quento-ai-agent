Lo que falta, en orden

1. Cuenta y número de prueba (gratis, sin tarjeta)
- Crear una app en developers.facebook.com, tipo Business, agregar el producto WhatsApp.
- En API Setup te da un número de prueba + phone_number_id + un token temporal (dura 24h).
- Agregás tu celular como "recipient" de prueba (hasta 5 números, con código de verificación).

2. Exponer mcp-host con HTTPS
Para esto no hace falta pagar hosting todavía, alcanza con un túnel hacia tu máquina:
- Cloudflare Tunnel (cloudflared) — 100% gratis, sin límite de uso. La versión rápida (trycloudflare.com) te da una URL random que cambia cada vez que reiniciás, lo cual es molesto porque tenés que re-cargar la URL en Meta cada vez.
- ngrok — el free tier ahora incluye 1 dominio estático gratis (fijo, no cambia). Mejor opción para no estar reconfigurando el webhook en Meta cada rato.

Mi recomendación: ngrok con el dominio estático gratuito.

3. Configurar el webhook en Meta
- En el dashboard de la app: URL = tu túnel + /smo valor que pongas en WHATSAPP_VERIFY_TOKEN.
- Suscribirse al campo messages.
- Poner WHATSAPP_DRY_RUN=false, cargar WHATSAPPE_NUMBER_ID reales en .env.
- Levantar mcp-host y mandarle un WhatsApp real desde tu celular al número de prueba.                                        
4. Token permanente                                                                                                           El token temporal expira a las 24h, lo cual core olvidás. Conviene crear un System User en MetaBusiness Suite y generarle un token con permiso whatsapp_business_messaging sin expiración. También gratis, son 10 minutos de configuración.

5. Cerrar la Fase 4
Ya con el número de prueba andando, lo que queda es código, no cuenta:
- Tests del agente mockeando Gemini + MCP (convar, reservar, reprogramar, cancelar).
- Deploy real con HTTPS público (reemplaza el túnel cuando quieras algo más estable — ver costos abajo).
- Logging por conversación y manejo de rate lim

Costos: se puede hacer en $0

- Meta WhatsApp Cloud API: los mensajes que mane texto libre dentro de la ventana de 24h("service conversations"), y esas no se cobran. Lo único que Meta cobra son mensajes de plantilla (marketing/recordatorios)
  iniciados por el negocio fuera de esa ventanan la Fase 5 (recordatorios de turnos), no en elagente actual.
- Gemini: gemini-3.6-flash en free tier, ya conu límite de rate).
- Túnel: gratis con ngrok (dominio estático) o Cloudflare Tunnel.
- Deploy final (cuando quieras algo siempre pre):
  - Cloud Run tiene free tier permanente bastante generoso (2M requests/mes) — para el tráfico de un agente de club,
    prácticamente no vas a salir de ahí. Pide tperás el free tier.
  - Render free tier no pide tarjeta, pero el servicio se duerme tras 15 min de inactividad y tarda en despertar — funciona
    igual porque el webhook responde 200 ensegupero el primer mensaje después de dormido tardamás.
  - Fly.io ya no tiene free tier real (pide tarjaría afuera.

Para un proyecto final, el camino más barato esopment, y al final Cloud Run o Render free tierpara el deploy — costo total: $0, salvo que después quieras dominio propio o un token de ngrok pago (tampoco necesario).

¿Querés que arranque por el lado de código: el System User / instrucciones exactas paso a paso para vos, o prefiero seguir con los tests de Fase 4 (conversaciones complet vos gestionás la cuenta de Meta en paralelo?