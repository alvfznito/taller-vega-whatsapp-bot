import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface NewLead {
  telefono: string;
  nombre?: string | null;
  mensajeOrigen: string;
  motivo: string;
}

/**
 * Guarda leads capturados en la tabla whatsapp_leads (Bloque 2/6).
 * Falla en silencio hacia el log, nunca hacia el flujo de conversación:
 * si Supabase no responde, el bot sigue charlando con el cliente con
 * normalidad (Regla 1 — no se cae a media demo).
 */
export class LeadsService {
  private client: SupabaseClient | null = null;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      console.warn(
        "[LeadsService] Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY — la captura de leads quedará deshabilitada (no afecta a la conversación).",
      );
      return;
    }

    this.client = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
  }

  async saveLead(lead: NewLead): Promise<void> {
    if (!this.client) return;

    try {
      const { error } = await this.client.from("whatsapp_leads").insert({
        telefono: lead.telefono,
        nombre: lead.nombre ?? null,
        mensaje_origen: lead.mensajeOrigen,
        motivo: lead.motivo,
      });

      if (error) {
        console.error("[LeadsService] Error guardando lead en Supabase:", error.message);
        return;
      }

      console.log(`[LeadsService] Lead guardado: ${lead.telefono} — ${lead.motivo}`);
    } catch (err) {
      console.error("[LeadsService] Excepción guardando lead:", err);
    }
  }
}
