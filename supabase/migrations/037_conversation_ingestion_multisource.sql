-- ============================================================
-- 037_conversation_ingestion_multisource.sql
--
-- Prepara la base para ingerir conversaciones desde varias fuentes sin
-- inconcordancias ni duplicados:
--   - WhatsApp día a día  -> Evolution API   (source='evolution')
--   - WhatsApp salida/hist -> API oficial     (source='coexistence')
--   - Llamadas (transcripción) -> GHL         (tabla `llamadas`)
--
-- Solo cambios de base de datos. Aditivo: ninguna columna/CHECK
-- existente del CRM se modifica (content_type se deja intacto; las
-- llamadas NO van en `messages` porque conversations.conversation_id es
-- NOT NULL y una llamada no pertenece a una conversación de WhatsApp).
-- ============================================================

-- ---------------------------------------------------------------- messages
-- Procedencia de cada mensaje. Nullable: los inserts actuales del CRM (que
-- no la fijan) siguen siendo válidos; n8n la fija explícitamente por fuente.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS source text
  CONSTRAINT messages_source_check
  CHECK (source IS NULL OR source IN ('evolution', 'coexistence', 'crm'));

-- Anti-duplicado: el mismo mensaje (mismo wamid) no puede insertarse dos
-- veces en una conversación, venga de la fuente que venga. Los mensajes
-- sin message_id (originados en el CRM) tienen message_id NULL y quedan
-- fuera del índice, así que no se bloquean.
CREATE UNIQUE INDEX IF NOT EXISTS messages_conv_msgid_uniq
  ON public.messages (conversation_id, message_id)
  WHERE message_id IS NOT NULL;

-- ---------------------------------------------------------------- llamadas
-- Transcripciones de llamadas (GHL: GET puntual + webhook permanente).
-- Ancladas al contacto maestro (contacts). El Agente 1 las lee por
-- contact_id junto a `messages` y las mezcla por fecha.
CREATE TABLE IF NOT EXISTS public.llamadas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  account_id    uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  ghl_call_id   text,                 -- id externo de GHL, para dedup
  direccion     text CHECK (direccion IS NULL OR direccion IN ('entrante','saliente')),
  duracion_seg  integer,
  grabacion_url text,
  transcripcion text,
  fecha_llamada timestamptz,          -- momento real de la llamada
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llamadas_contact_idx ON public.llamadas (contact_id);
CREATE INDEX IF NOT EXISTS llamadas_account_idx ON public.llamadas (account_id);
CREATE INDEX IF NOT EXISTS llamadas_fecha_idx   ON public.llamadas (fecha_llamada);
-- Anti-duplicado del webhook/GET de GHL: misma llamada = una fila.
CREATE UNIQUE INDEX IF NOT EXISTS llamadas_ghl_uniq
  ON public.llamadas (account_id, ghl_call_id)
  WHERE ghl_call_id IS NOT NULL;

DROP TRIGGER IF EXISTS llamadas_updated_at ON public.llamadas;
CREATE TRIGGER llamadas_updated_at
  BEFORE UPDATE ON public.llamadas
  FOR EACH ROW EXECUTE FUNCTION public.contact_ai_touch_updated_at();

-- RLS multi-tenant (como el resto del CRM). n8n escribe con service_role
-- (bypassa RLS); el dashboard futuro lee por membresía.
ALTER TABLE public.llamadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS llamadas_select ON public.llamadas;
CREATE POLICY llamadas_select ON public.llamadas FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS llamadas_write ON public.llamadas;
CREATE POLICY llamadas_write ON public.llamadas FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
