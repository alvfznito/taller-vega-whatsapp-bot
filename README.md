# Talleres Vega — Chatbot de WhatsApp (demo de venta)

Quinto pilar de MUESTRATE!: un chatbot de atención al cliente por WhatsApp,
conectado por [builderbot](https://builderbot.vercel.app/) + Baileys (no la
API oficial de Meta — decisión tomada para evitar la revisión de aplicación
y las semanas de espera de esa vía).

**Esto es una herramienta de venta, no un producto para un cliente real
todavía.** Usa el contexto de negocio de Talleres Vega (mismo taller de la
web demo, los anuncios y el vídeo cinemático) para que la demo completa
cuente una sola historia coherente.

## Qué hace

- Responde por WhatsApp como un empleado de Talleres Vega: servicios,
  horario, ubicación, diagnóstico gratuito, marcas, garantía — sin inventar
  precios ni datos que no estén en `src/business-context.ts`.
- Mantiene un historial corto de conversación en memoria por número de
  teléfono (se pierde si el proceso se reinicia — aceptable para una demo).
- Detecta cuándo el cliente muestra intención real de contacto (no solo
  curiosidad) y guarda el lead en Supabase (`whatsapp_leads`) sin cortar la
  conversación.
- Si OpenAI o Supabase fallan, cae a un mensaje de fallback en vez de
  crashear — prioridad explícita de esta demo: **no se puede caer a media
  conversación en directo delante de un cliente**.

## Estructura

```
src/
  bot.ts                 — entrypoint: conexión WhatsApp + flujo principal
  business-context.ts     — contexto de negocio de Talleres Vega (hardcodeado)
  services/
    openai.ts             — llamadas a OpenAI + historial + detección de lead
    leads.ts               — guardado en Supabase
supabase/
  migrations/
    20260818000000_whatsapp_leads.sql
```

## Desarrollo local

```bash
npm install
cp .env.example .env   # rellena las claves — ver abajo de dónde sacarlas
npm run dev
```

La primera vez que arranca sin sesión activa, abre `http://localhost:3008`
en el navegador: builderbot muestra el QR ahí. Escanéalo con **WhatsApp del
número dedicado a la demo — nunca el número personal**.

La sesión se guarda en la carpeta `taller-vega_sessions/` (ya está en
`.gitignore`, nunca se sube a git — contiene las credenciales de la sesión
de WhatsApp).

## Variables de entorno

Ver `.env.example` para la lista completa y dónde conseguir cada una.
Resumen:

| Variable | De dónde sale |
|---|---|
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| `OPENAI_MODEL` | `gpt-4o-mini` por defecto |
| `SUPABASE_URL` | Supabase Dashboard → Project Settings → Data API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API Keys → `service_role` |
| `BOT_SESSION_NAME` | `taller-vega` por defecto, no hace falta tocarlo |
| `PORT` | Railway lo inyecta solo — no hace falta configurarlo ahí |

## Despliegue en Railway

**Por qué Railway y no Vercel:** el resto del proyecto vive en
Supabase + Vercel sin servidor propio corriendo 24/7. builderbot necesita
un proceso encendido de forma continua manteniendo la sesión de WhatsApp
activa — eso no puede vivir en Vercel (apaga funciones entre peticiones).

1. **Repo en GitHub** → conecta un nuevo proyecto en
   [railway.app](https://railway.app) → "Deploy from GitHub repo" →
   selecciona este repo.
2. **Variables de entorno** — en el proyecto de Railway, pestaña
   *Variables*, añade las mismas de `.env.example` (nunca subir el `.env`
   al repo — ya está en `.gitignore`).
3. **Volumen persistente** — esto es crítico para que la sesión de
   WhatsApp sobreviva a un redeploy. En Railway: *Settings → Volumes* →
   añade un volumen y móntalo en `/app/taller-vega_sessions` (la ruta
   exacta que genera el bot: `${BOT_SESSION_NAME}_sessions` relativo al
   directorio de trabajo, que en Railway es `/app`). Sin este volumen, cada
   redeploy borra la sesión y hay que volver a escanear el QR.
4. **Build/start** — Railway detecta automáticamente `npm run build` y
   `npm run start` desde `package.json`, no hace falta configurar nada más.
5. **Escanear el QR** — con el servicio ya desplegado, abre la URL pública
   que Railway asigna (Settings → Networking → Generate Domain si no la
   tiene ya) en el navegador. Ahí aparece el QR la primera vez. Escanéalo
   con el número dedicado a la demo.
6. **Verificar persistencia** — provoca un redeploy (o reinicia el
   servicio desde el dashboard de Railway) y confirma que NO vuelve a pedir
   QR — si el volumen está bien montado, la sesión sigue conectada.

## Verificación

- [ ] Escanear el QR con el número dedicado → sesión conectada.
- [ ] Mandar un mensaje real por WhatsApp → el bot responde con el contexto
      correcto de Talleres Vega.
- [ ] Preguntar algo fuera de contexto → no inventa datos, remite a llamar
      al 926 31 00 03.
- [ ] Mostrar interés real ("quiero llevar el coche", "¿me hacéis hueco
      esta semana?") → aparece el lead en la tabla `whatsapp_leads` de
      Supabase.
- [ ] Reiniciar el proceso en Railway → la sesión sigue conectada sin pedir
      QR de nuevo (requiere el volumen persistente del paso 3).

## Fuera de alcance (v1)

Reservas/cancelación de citas, arquitectura multiempresa, dashboard de
administración (los leads se consultan directamente en la tabla de
Supabase), API oficial de WhatsApp Business, y consideraciones de RGPD —
todo esto queda para cuando esto sea un producto real vendido a un cliente,
no una demo. Ver el prompt original para el detalle completo.
