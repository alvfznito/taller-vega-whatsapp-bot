-- =============================================
-- Chatbot WhatsApp Talleres Vega — Bloque 2
-- =============================================
-- Tabla de leads capturados por el bot. Demo de venta, no producción
-- para un cliente real todavía — sin RLS: el único acceso es vía
-- service_role desde el propio proceso del bot (Regla 1 del prompt:
-- seguridad no es prioridad esta vez).

create table if not exists public.whatsapp_leads (
  id uuid primary key default gen_random_uuid(),
  telefono text not null,
  nombre text,
  mensaje_origen text,
  motivo text,
  created_at timestamptz default now()
);

create index if not exists idx_whatsapp_leads_telefono on public.whatsapp_leads (telefono);
create index if not exists idx_whatsapp_leads_created_at on public.whatsapp_leads (created_at desc);
