-- ============================================================
-- 036_salon_bonos_pagos.sql — Seguimiento exhaustivo del cliente (estética)
--
-- Añade el registro de dinero y eventos del salón, anclado en `clientes`
-- (donde viven los clientes reales y las citas). La IA lo alcanza por el
-- puente clientes.contact_id -> contacts.id (migración 035).
--
--   - bonos:           bonos/paquetes prepago comprados (nombre, precio,
--                      sesiones, vigencia, estado).
--   - pagos:           cualquier cobro (efectivo/tarjeta/bizum...),
--                      opcionalmente ligado a un bono o a una cita.
--   - cliente_eventos: notas extra y casos de excepción con fecha del
--                      hecho (ej. "se puso enferma el 12/03").
--
-- Sigue el patrón del schema de salón (031): single-tenant, RLS por
-- email de la dueña, trigger salon_set_updated_at. n8n escribe con
-- service_role (bypassa RLS). Aditivo e idempotente.
-- ============================================================

-- ---------------------------------------------------------------- bonos
CREATE TABLE IF NOT EXISTS public.bonos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  servicio_id       uuid REFERENCES public.servicios(id) ON DELETE SET NULL, -- si el bono es de un servicio concreto
  nombre            text NOT NULL,
  precio            numeric,
  moneda            text NOT NULL DEFAULT 'EUR',
  sesiones_totales  integer,                 -- NULL = bono por importe, no por nº de sesiones
  sesiones_usadas   integer NOT NULL DEFAULT 0,
  fecha_compra      date NOT NULL DEFAULT current_date,
  fecha_vencimiento date,
  estado            text NOT NULL DEFAULT 'activo'
                    CHECK (estado IN ('activo','agotado','vencido','cancelado')),
  notas             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bonos_sesiones_no_negativas CHECK (sesiones_usadas >= 0),
  CONSTRAINT bonos_sesiones_coherentes
    CHECK (sesiones_totales IS NULL OR sesiones_usadas <= sesiones_totales)
);
CREATE INDEX IF NOT EXISTS bonos_cliente_idx ON public.bonos (cliente_id);
CREATE INDEX IF NOT EXISTS bonos_estado_idx  ON public.bonos (estado);

DROP TRIGGER IF EXISTS trg_bonos_updated_at ON public.bonos;
CREATE TRIGGER trg_bonos_updated_at BEFORE UPDATE ON public.bonos
  FOR EACH ROW EXECUTE FUNCTION public.salon_set_updated_at();

-- ---------------------------------------------------------------- pagos
CREATE TABLE IF NOT EXISTS public.pagos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id   uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  bono_id      uuid REFERENCES public.bonos(id) ON DELETE SET NULL, -- pago de un bono
  cita_id      uuid REFERENCES public.citas(id) ON DELETE SET NULL, -- pago de una cita
  monto        numeric NOT NULL,
  moneda       text NOT NULL DEFAULT 'EUR',
  metodo_pago  text NOT NULL DEFAULT 'efectivo'
               CHECK (metodo_pago IN ('efectivo','tarjeta','bizum','transferencia','otro')),
  concepto     text,
  fecha_pago   timestamptz NOT NULL DEFAULT now(),
  notas        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pagos_cliente_idx ON public.pagos (cliente_id);
CREATE INDEX IF NOT EXISTS pagos_bono_idx    ON public.pagos (bono_id);
CREATE INDEX IF NOT EXISTS pagos_cita_idx    ON public.pagos (cita_id);
CREATE INDEX IF NOT EXISTS pagos_fecha_idx   ON public.pagos (fecha_pago);

-- ---------------------------------------------------------- cliente_eventos
-- Notas extra / excepciones. `fecha_evento` es cuándo pasó el hecho
-- (puede diferir de created_at, que es cuándo se registró).
CREATE TABLE IF NOT EXISTS public.cliente_eventos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id   uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo         text NOT NULL DEFAULT 'nota'
               CHECK (tipo IN ('nota','incidencia','salud','preferencia','excepcion')),
  titulo       text,
  descripcion  text NOT NULL,
  fecha_evento date NOT NULL DEFAULT current_date,
  importante   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cliente_eventos_cliente_idx ON public.cliente_eventos (cliente_id);
CREATE INDEX IF NOT EXISTS cliente_eventos_fecha_idx   ON public.cliente_eventos (fecha_evento);

DROP TRIGGER IF EXISTS trg_cliente_eventos_updated_at ON public.cliente_eventos;
CREATE TRIGGER trg_cliente_eventos_updated_at BEFORE UPDATE ON public.cliente_eventos
  FOR EACH ROW EXECUTE FUNCTION public.salon_set_updated_at();

-- ---------------------------------------------------------------- RLS
-- Mismo modelo que clientes/citas (031): lectura para authenticated,
-- escritura para la dueña. service_role (n8n) bypassa RLS.
ALTER TABLE public.bonos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ver_bonos ON public.bonos;
CREATE POLICY ver_bonos ON public.bonos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS editar_bonos ON public.bonos;
CREATE POLICY editar_bonos ON public.bonos FOR ALL TO authenticated
  USING (auth.email() = 'info@venusecretsbcn.es') WITH CHECK (auth.email() = 'info@venusecretsbcn.es');

DROP POLICY IF EXISTS ver_pagos ON public.pagos;
CREATE POLICY ver_pagos ON public.pagos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS editar_pagos ON public.pagos;
CREATE POLICY editar_pagos ON public.pagos FOR ALL TO authenticated
  USING (auth.email() = 'info@venusecretsbcn.es') WITH CHECK (auth.email() = 'info@venusecretsbcn.es');

DROP POLICY IF EXISTS ver_cliente_eventos ON public.cliente_eventos;
CREATE POLICY ver_cliente_eventos ON public.cliente_eventos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS editar_cliente_eventos ON public.cliente_eventos;
CREATE POLICY editar_cliente_eventos ON public.cliente_eventos FOR ALL TO authenticated
  USING (auth.email() = 'info@venusecretsbcn.es') WITH CHECK (auth.email() = 'info@venusecretsbcn.es');
