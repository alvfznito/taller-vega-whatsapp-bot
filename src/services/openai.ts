import OpenAI from "openai";
import { BUSINESS_CONTEXT } from "../business-context";

const LEAD_MARKER = "###LEAD###";
const MAX_HISTORY_MESSAGES = 12; // ~6 turnos de ida y vuelta, suficiente para una demo

type Role = "user" | "assistant";
interface HistoryMessage {
  role: Role;
  content: string;
}

export interface AIReply {
  /** Texto ya limpio, listo para enviar al cliente por WhatsApp. */
  text: string;
  /** Si el modelo detectó intención real de contacto, el motivo resumido. */
  leadMotivo: string | null;
}

/**
 * Historial corto en memoria por número de teléfono (Bloque 5: "no hace
 * falta persistirlo en base de datos para la demo"). Se pierde si el
 * proceso se reinicia — aceptable para el alcance de esta demo.
 */
const conversationHistory = new Map<string, HistoryMessage[]>();

/** Números que ya generaron un lead, para no repetir la captura en la misma conversación. */
const leadAlreadyCaptured = new Set<string>();

function getHistory(phone: string): HistoryMessage[] {
  return conversationHistory.get(phone) ?? [];
}

function appendHistory(phone: string, message: HistoryMessage) {
  const history = getHistory(phone);
  history.push(message);
  // Recorta por los dos extremos para no dejar crecer la memoria sin límite
  // durante una demo larga.
  const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
  conversationHistory.set(phone, trimmed);
}

/**
 * Separa la marca de lead (si existe) del texto real de la respuesta.
 * La marca nunca debe llegar al cliente por WhatsApp.
 */
function parseLeadMarker(raw: string): { text: string; leadMotivo: string | null } {
  const markerIndex = raw.indexOf(LEAD_MARKER);
  if (markerIndex === -1) {
    return { text: raw.trim(), leadMotivo: null };
  }

  const text = raw.slice(0, markerIndex).trim();
  const markerLine = raw.slice(markerIndex);
  const motivoMatch = markerLine.match(/motivo:\s*(.+)/i);
  const leadMotivo = motivoMatch ? motivoMatch[1].trim() : "Interés mostrado en conversación";

  return { text, leadMotivo };
}

const FALLBACK_REPLY =
  "Perdona, se me ha ido el hilo un momento 🙈 ¿Me lo puedes repetir? Si es urgente, llámanos directamente al 926 31 00 03.";

export class OpenAIService {
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Falta OPENAI_API_KEY en las variables de entorno — revisa .env.example",
      );
    }
    this.client = new OpenAI({ apiKey });
    this.model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  }

  /**
   * Genera la respuesta del asistente para un mensaje entrante.
   * Regla 1 de la demo: nunca debe reventar la conversación — cualquier
   * fallo de OpenAI cae a un mensaje de fallback, no a una excepción sin
   * capturar que tumbe el bot a mitad de una demo en vivo.
   */
  async getReply(phone: string, incomingMessage: string): Promise<AIReply> {
    appendHistory(phone, { role: "user", content: incomingMessage });

    try {
      const alreadyHasLead = leadAlreadyCaptured.has(phone);
      const systemPrompt = alreadyHasLead
        ? `${BUSINESS_CONTEXT}\n\nNota: esta conversación ya generó un lead antes. No vuelvas a añadir la línea ###LEAD### aunque el cliente siga mostrando interés.`
        : BUSINESS_CONTEXT;

      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.6,
        max_tokens: 300,
        messages: [
          { role: "system", content: systemPrompt },
          ...getHistory(phone).map((m) => ({ role: m.role, content: m.content })),
        ],
      });

      const raw = completion.choices[0]?.message?.content?.trim();
      if (!raw) {
        return { text: FALLBACK_REPLY, leadMotivo: null };
      }

      const { text, leadMotivo } = parseLeadMarker(raw);
      appendHistory(phone, { role: "assistant", content: text });

      if (leadMotivo && !alreadyHasLead) {
        leadAlreadyCaptured.add(phone);
        return { text, leadMotivo };
      }
      return { text, leadMotivo: null };
    } catch (err) {
      console.error(`[OpenAIService] Fallo al generar respuesta para ${phone}:`, err);
      return { text: FALLBACK_REPLY, leadMotivo: null };
    }
  }
}
