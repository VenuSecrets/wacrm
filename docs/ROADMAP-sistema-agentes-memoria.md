# ROADMAP — Sistema de Agentes y Memoria de Clientes (wacrm + Supabase + n8n)

> Tracker vivo. Cuando Wilmen pregunte "¿qué nos falta?", responder desde aquí.
> Principio rector: **los agentes tocan Supabase directamente, nunca la interfaz del CRM.**
> Supabase: proyecto "CRM OPENSOURSE" `oxjlbtfyuzfpiybzxpkd`. n8n en Railway. Embeddings = Gemini `text-embedding-004` (768).

---

## Decisiones cerradas
- **Identidad maestra CRM = `contacts`**, clave única = **teléfono** (`phone_normalized`). Sin teléfono NO se crea contact.
- **Cuenta del salón = `info@venusecretsbcn.es`** (`account_id 0d32e700-b0c5-4efe-bbf4-7be2a13baed5`).
- **Embeddings de memoria = Gemini 768**, separado del RAG del CRM (`ai_knowledge_chunks`, 1536/OpenAI, NO se toca).
- **Historia de estética** se ancla en `clientes` y se cruza con `contacts` por el puente `clientes.contact_id`.
- **Identificador Booksy = `client_card_id`** (el "identificador de Supabase" para la parte estética; el teléfono es la clave para la parte CRM/WhatsApp).

## HECHO (aplicado en Supabase + en el PR #8 de la rama claude/wacrm-customer-memory-ocgc35)
- **035** `contact_ai_profiles` (vector 768), `contact_ai_estado`, RPC `match_contact_ai_profiles`, puente `clientes.contact_id`.
- **036** `bonos`, `pagos`, `cliente_eventos` (seguimiento estética, anclado en `clientes`).
- **037** `messages.source` + índice anti-duplicado `(conversation_id, message_id)`; tabla `llamadas` (transcripciones GHL).
- **Seed**: 2 contacts creados y enlazados (Wilmen, Maria) en la cuenta del salón. 2 clientes sin teléfono quedan sin contact.

## BLOQUEO ABIERTO (Fase 0)
- El export de Booksy (clientes/citas/financiero) **no trae teléfonos** (0 de 1.839; solo 82 emails). Con la regla "teléfono obligatorio", no se puede crear ningún `contacts` desde este export. Decisión pendiente: re-exportar con teléfonos vs. importar la historia por `client_card_id` y enlazar teléfonos después.

---

## PENDIENTE — por fases

### Fase 0 — Importación base de clientes (clientes HECHO; historial pendiente)
- [x] Bloqueo de teléfonos resuelto: el export corregido trae teléfono (1.837/1.839).
- [x] Staging `import_clientes_staging` cargada por REST (PostgREST + anon temporal, ya revocado). Mapa `client_card_id ↔ contact_id`.
- [x] Upsert a `contacts`: **1.837 contactos** en la cuenta del salón, teléfono como identificador único, IDs propios uuid, dedup por `phone_normalized`. 2 sin teléfono omitidos.
- [ ] **Historial** (SIGUIENTE): citas (1.497), resumen financiero (454), bonos embebidos en notas de 332 citas. Requiere decidir el anclaje (ver nota abajo).
- [ ] Clasificación inicial (agente barato): `clasificacion`, `tags`.
- [ ] Rellenar los ~4 emails perdidos por dedup (opcional).

> ⚠️ **Orden a resolver antes del historial:** los clientes reales quedaron en `contacts` (por teléfono), pero las tablas de historial que creamos en la migración 036 (`bonos`/`pagos`/`cliente_eventos`) y la `citas` de estética cuelgan de `clientes`. Hay que re-anclar el historial a `contacts` (tablas vacías → trivial) para que el agente lea todo por `contact_id`.

### Fase 1 — Esquema de memoria (HECHO: migraciones 035–037)

### Fase 2 — A1 Analista de Perfiles (n8n)
- [ ] Subworkflow por `contact_id`: leer historial (`messages`, `citas`, `contact_notes`, `llamadas`) → Gemini datos fijos → Claude análisis → escribir `contact_ai_profiles` (+ embedding) y `contact_ai_estado`.
- [ ] Probar con 2-3 clientes reales → backfill por lotes (WF0).

### Fase 3 — Consulta interna
- [ ] A2 Chat Telegram (búsqueda semántica + SQL sobre contacts/citas/deals).
- [ ] A3 Informe semanal (cron lunes).

### Fase 4 — Re-análisis automático
- [ ] A4 cron diario: `proximo_analisis <= now()` OR contadores subieron → encolar → A1.

### Fase 5 — Ingesta de conversaciones (fuentes)
- [ ] Conexión Evolution API (chat día a día) → `messages` (source='evolution').
- [ ] Conexión API oficial coexistencia (recordatorios/masivos + histórico inicial vía webhook) → `messages` (source='coexistence').
- [ ] Conexión GHL (GET + webhook permanente) → `llamadas`.
- [ ] Cada conexión gestionada por separado (credenciales/flujos n8n independientes).

### Fase 6 — Agentes de acción (Etapa B)
- [ ] B1 Router WhatsApp entrante · B2 Copiloto de respuesta · B3 Pipeline · B4 Seguimientos · B5 Memoria en vivo.
- [ ] Regla: nunca enviar a clientas sin aprobación humana (hasta decidir lo contrario).

### Fase posterior — Interfaz del CRM (código)
- [ ] Modificar el código del CRM (`wacrm`): partes visuales + funcionalidad para representar la memoria/perfil, bonos/pagos, llamadas.
- [ ] Conectar cada conversación al perfil del cliente y vectorizarla (RAG fino a nivel mensaje) — memoria conversacional avanzada.

---

## Notas de datos (export Booksy, 2026-07)
- 1.839 clientes · 1.497 citas · 454 clientes con actividad financiera.
- Teléfonos: 0. Emails: 82. Consentimiento comercial: 1. (⚠️ privacidad/GDPR para envíos automáticos.)
- Estados de cita: Finished 767, Cancelled 327, (vacío) 211, Confirmed 131, No-show 61.
- 33 servicios, 8 profesionales. Bonos embebidos en notas de 332 citas ("X/8 PAGADO BONO 480").
- 147 citas referencian `client_card_id` que no está en la lista de clientes (tarjetas borradas/fusionadas).
