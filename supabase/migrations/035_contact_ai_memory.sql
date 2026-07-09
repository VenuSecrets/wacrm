-- ============================================================
-- 035_contact_ai_memory.sql — Memoria a largo plazo / perfilado IA por contacto
--
-- Da al pipeline de agentes de IA (n8n) una memoria de perfiles por
-- cliente, separada del RAG de base de conocimiento del CRM
-- (ai_knowledge_chunks, migración 030). Piezas:
--   - Puente estética -> CRM: clientes.contact_id -> contacts.id.
--   - contact_ai_profiles: 1 fila por contacto con el análisis del
--     Agente 1 + embedding semántico.
--   - contact_ai_estado: contadores y agenda de re-análisis.
--   - match_contact_ai_profiles: búsqueda semántica (WF3/WF4).
--
-- Embeddings de memoria = Gemini text-embedding-004 (768 dims), distinto
-- del espacio 1536/OpenAI de ai_knowledge_chunks — que NO se toca aquí,
-- porque la app del CRM depende de él.
--
-- Aditivo e idempotente. Ningún objeto existente del CRM se modifica
-- salvo la columna nullable clientes.contact_id.
-- ============================================================

-- pgvector ya instalado (0.8.2, schema public). No-op:
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- Puente estética -> CRM. `clientes` (calendario, single-tenant) no
-- tenía relación con `contacts` (CRM WhatsApp, multi-tenant). Este FK
-- nullable permite cruzar citas/fotos con conversaciones y colgar la
-- memoria IA del contacto maestro.
-- ============================================================
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS clientes_contact_id_idx ON public.clientes (contact_id);

-- Trigger updated_at namespaced (evita choques con funciones de la app).
CREATE OR REPLACE FUNCTION public.contact_ai_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- Perfil IA — 1 fila por contacto (contact_id como PK garantiza el 1:1).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contact_ai_profiles (
  contact_id       uuid PRIMARY KEY REFERENCES public.contacts(id) ON DELETE CASCADE,
  account_id       uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  embedding        vector(768),                     -- Gemini text-embedding-004
  modelo_embedding text NOT NULL DEFAULT 'text-embedding-004',
  analisis         text,                            -- análisis profundo (Agente 1)
  resumen_corto    text,
  fase_compra      text,
  tags             text[] NOT NULL DEFAULT '{}',
  fecha_analisis   timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_ai_profiles_account_id_idx
  ON public.contact_ai_profiles (account_id);
-- ANN coseno para el camino semántico. Las filas con embedding NULL
-- (aún sin analizar) simplemente no entran al índice.
CREATE INDEX IF NOT EXISTS contact_ai_profiles_embedding_idx
  ON public.contact_ai_profiles USING hnsw (embedding vector_cosine_ops);

DROP TRIGGER IF EXISTS contact_ai_profiles_updated_at ON public.contact_ai_profiles;
CREATE TRIGGER contact_ai_profiles_updated_at
  BEFORE UPDATE ON public.contact_ai_profiles
  FOR EACH ROW EXECUTE FUNCTION public.contact_ai_touch_updated_at();

-- ============================================================
-- Estado de re-análisis — 1 fila por contacto. Alimenta el cron (WF2):
-- proximo_analisis <= now() OR contadores subieron -> reencolar.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contact_ai_estado (
  contact_id         uuid PRIMARY KEY REFERENCES public.contacts(id) ON DELETE CASCADE,
  account_id         uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  num_conversaciones integer NOT NULL DEFAULT 0,
  num_citas          integer NOT NULL DEFAULT 0,
  num_compras        integer NOT NULL DEFAULT 0,
  ultimo_analisis    timestamptz,
  proximo_analisis   timestamptz,
  estado             text NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente','encolado','analizado','error')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_ai_estado_account_id_idx
  ON public.contact_ai_estado (account_id);
CREATE INDEX IF NOT EXISTS contact_ai_estado_cola_idx
  ON public.contact_ai_estado (proximo_analisis);

DROP TRIGGER IF EXISTS contact_ai_estado_updated_at ON public.contact_ai_estado;
CREATE TRIGGER contact_ai_estado_updated_at
  BEFORE UPDATE ON public.contact_ai_estado
  FOR EACH ROW EXECUTE FUNCTION public.contact_ai_touch_updated_at();

-- ============================================================
-- RLS — multi-tenant, mirroring el resto del CRM. n8n escribe con
-- service_role (bypassa RLS); el dashboard futuro lee por membresía.
-- ============================================================
ALTER TABLE public.contact_ai_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_ai_estado   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_ai_profiles_select ON public.contact_ai_profiles;
CREATE POLICY contact_ai_profiles_select ON public.contact_ai_profiles FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS contact_ai_profiles_write ON public.contact_ai_profiles;
CREATE POLICY contact_ai_profiles_write ON public.contact_ai_profiles FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS contact_ai_estado_select ON public.contact_ai_estado;
CREATE POLICY contact_ai_estado_select ON public.contact_ai_estado FOR SELECT
  USING (is_account_member(account_id));
DROP POLICY IF EXISTS contact_ai_estado_write ON public.contact_ai_estado;
CREATE POLICY contact_ai_estado_write ON public.contact_ai_estado FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- ============================================================
-- Búsqueda semántica de perfiles (WF3 chat Telegram / WF4 informe).
-- Mismo patrón blindado que match_ai_knowledge_semantic (030):
-- SECURITY DEFINER, hard-scoped por account_id, sin PUBLIC. El embedding
-- de consulta llega como literal pgvector en texto y se castea dentro.
-- ============================================================
CREATE OR REPLACE FUNCTION public.match_contact_ai_profiles(
  p_account_id      uuid,
  p_query_embedding text,
  p_match_count     integer
)
RETURNS TABLE (contact_id uuid, resumen_corto text, analisis text, distance real) AS $$
  SELECT p.contact_id,
         p.resumen_corto,
         p.analisis,
         (p.embedding <=> p_query_embedding::vector(768)) AS distance
  FROM public.contact_ai_profiles p
  WHERE p.account_id = p_account_id
    AND p.embedding IS NOT NULL
  ORDER BY p.embedding <=> p_query_embedding::vector(768)
  LIMIT GREATEST(p_match_count, 0);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.match_contact_ai_profiles(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_contact_ai_profiles(uuid, text, integer) TO authenticated, service_role;
