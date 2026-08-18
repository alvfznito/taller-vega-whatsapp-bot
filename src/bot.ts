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

  const { httpServer } = await createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB,
  });

  httpServer(PORT);

  console.log(`\n[Talleres Vega Bot] Servidor arrancado en el puerto ${PORT}.`);
  console.log(
    `[Talleres Vega Bot] Si no hay sesión activa, abre la URL pública del servicio en el navegador para ver el QR y escanéalo con el número dedicado a la demo (NO el número personal de Juan).\n`,
  );
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
