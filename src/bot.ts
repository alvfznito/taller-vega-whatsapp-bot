import "dotenv/config";
import { createBot, createFlow, createProvider, addKeyword, EVENTS, MemoryDB } from "@builderbot/bot";
import { BaileysProvider } from "@builderbot/provider-baileys";
import { OpenAIService } from "./services/openai";
import { LeadsService } from "./services/leads";

const PORT = Number(process.env.PORT) || 3008;
// Nombre de sesión: define el nombre de la carpeta de sesión de WhatsApp
// (`${SESSION_NAME}_sessions`) y del archivo QR (`${SESSION_NAME}.qr.png`).
const SESSION_NAME = process.env.BOT_SESSION_NAME || "taller-vega";

const openaiService = new OpenAIService();
const leadsService = new LeadsService();

/**
 * Regla 1 de esta demo: el bot no se puede caer a media conversación.
 * EVENTS.WELCOME captura cualquier mensaje entrante que no coincida con
 * una palabra clave concreta — como no definimos ninguna, esto actúa
 * como el flujo "catch-all" que atiende TODOS los mensajes.
 */
const mainFlow = addKeyword(EVENTS.WELCOME).addAction(async (ctx, { flowDynamic }) => {
  const phone = ctx.from;
  const message = ctx.body?.trim();

  // Mensajes sin texto (audio, imagen sin caption, sticker...) — de
  // momento los ignoramos en vez de mandarlos tal cual a OpenAI.
  if (!message) return;

  try {
    const { text, leadMotivo } = await openaiService.getReply(phone, message);

    if (text) {
      await flowDynamic(text);
    }

    if (leadMotivo) {
      // No await bloqueante sobre la respuesta al cliente: la captura de
      // lead nunca debe retrasar ni interrumpir la conversación.
      leadsService
        .saveLead({
          telefono: phone,
          nombre: ctx.name ?? null,
          mensajeOrigen: message,
          motivo: leadMotivo,
        })
        .catch((err) => console.error("[bot] Error inesperado guardando lead:", err));
    }
  } catch (err) {
    // Último cinturón de seguridad: si algo revienta aquí que no capturó
    // ya el propio OpenAIService, respondemos algo razonable en vez de
    // dejar al cliente sin respuesta o tumbar el proceso.
    console.error(`[bot] Error inesperado atendiendo a ${phone}:`, err);
    await flowDynamic(
      "Perdona, ha habido un problemilla por mi parte. ¿Me lo repites? Si sigue fallando, llámanos al 926 31 00 03.",
    ).catch(() => {});
  }
});

const main = async () => {
  const adapterFlow = createFlow([mainFlow]);
  const adapterProvider = createProvider(BaileysProvider, {
    name: SESSION_NAME,
  });
  const adapterDB = new MemoryDB();

  const botInstance = await createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB,
  });

  // Diagnóstico real: `.listen()` del servidor HTTP solo se dispara DESPUÉS
  // de que el proveedor de WhatsApp inicialice su socket (ver initAll en
  // @builderbot/bot) — así que un simple console.log justo después de
  // llamar a httpServer() no confirma que el servidor esté realmente
  // escuchando. Nos enganchamos a los eventos reales para saberlo de
  // verdad, en vez de asumirlo.
  botInstance.on("notice", (payload: { title: string; instructions: string[] }) => {
    console.log(`\n[Talleres Vega Bot] ✅ Servidor HTTP escuchando en el puerto ${PORT}.`);
    console.log(
      `[Talleres Vega Bot] Abre la URL pública del servicio para ver el QR y escanéalo con el número dedicado a la demo (NO el número personal de Juan).\n`,
    );
  });

  adapterProvider.on(
    "require_action",
    (payload: { title: string; instructions: string[]; payload?: { qr?: string; code?: string } }) => {
      console.log(`\n[Talleres Vega Bot] 📷 ${payload.title}`);
      for (const line of payload.instructions) console.log(`  - ${line}`);
    },
  );
  adapterProvider.on("ready", () => {
    console.log(`[Talleres Vega Bot] ✅ Sesión de WhatsApp conectada.`);
  });

  // Bug conocido de @builderbot/provider-baileys 1.4.2: si initVendor()
  // falla al crear el socket, el error se traga (emite 'auth_failure' pero
  // no relanza la excepción) y la cadena interna de initAll() revienta en
  // el siguiente .then() con una rejection sin capturar — el efecto es que
  // this.server.listen(...) nunca llega a ejecutarse. El proceso sigue
  // vivo (nuestro handler de unhandledRejection evita el crash) pero el
  // puerto nunca queda abierto, así que Railway responde "Application
  // failed to respond" aunque el log de arranque parezca limpio.
  //
  // No podemos arreglar la librería desde aquí, pero si el fallo es
  // transitorio (typical de una primera conexión desde una IP nueva de
  // Railway), reintentar llamar a httpServer(PORT) vuelve a intentar todo
  // el proceso desde cero — incluido el paso que abre el puerto. Regla 1
  // de esta demo: no dejar el proceso en un estado roto sin más.
  const MAX_RETRIES = 5;
  let retryCount = 0;
  let httpServerIsUp = false;

  botInstance.on("notice", () => {
    httpServerIsUp = true;
  });

  adapterProvider.on("auth_failure", (payload: unknown) => {
    console.error(`[Talleres Vega Bot] ❌ Fallo al inicializar el proveedor de WhatsApp:`, payload);

    if (httpServerIsUp) {
      // El servidor HTTP ya estaba escuchando de un intento anterior —
      // este fallo es solo de la conexión a WhatsApp, no bloquea el puerto.
      return;
    }
    if (retryCount >= MAX_RETRIES) {
      console.error(
        `[Talleres Vega Bot] Se agotaron los ${MAX_RETRIES} reintentos sin conseguir abrir el servidor HTTP. Revisa la conectividad de red del servicio.`,
      );
      return;
    }

    retryCount++;
    const backoffMs = 2000 * retryCount;
    console.log(
      `[Talleres Vega Bot] Reintentando arrancar (intento ${retryCount}/${MAX_RETRIES}) en ${backoffMs / 1000}s...`,
    );
    setTimeout(() => {
      botInstance.httpServer(PORT);
    }, backoffMs);
  });

  console.log(`[Talleres Vega Bot] Arrancando... (esperando a que el proveedor de WhatsApp inicialice)`);
  botInstance.httpServer(PORT);
};

// Bloque 4/Regla 1: nunca dejar que un error no capturado tumbe el proceso
// a media demo. Se registra en el log y el proceso sigue vivo.
process.on("unhandledRejection", (reason) => {
  console.error("[bot] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[bot] uncaughtException:", err);
});

main().catch((err) => {
  console.error("[Talleres Vega Bot] Error fatal al arrancar el proceso:", err);
  process.exit(1);
});
