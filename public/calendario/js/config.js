/* ============================================================
   CONFIGURACION
   - SUPABASE_URL / SUPABASE_ANON_KEY: Project Settings -> API.
     La clave "anon" es publica y segura SIEMPRE que tengas
     Row Level Security (RLS) activado en tus tablas.
   - DEFAULT_CONFIG: horario operativo por defecto (editable
     en el modal de Ajustes, se guarda en localStorage).
   ============================================================ */
const SUPABASE_URL = "https://oxjlbtfyuzfpiybzxpkd.supabase.co";        // proyecto WACRM (CRM + Calendario + Fotos)
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94amxidGZ5dXpmcGl5Ynp4cGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNTk0NTcsImV4cCI6MjA5ODczNTQ1N30.NEMKdvHQBFU4f4Z0ZWiyybNghpEE23ksoaDjrvXfqzU";      // la clave "anon public"

  // Correo que SÍ puede agendar y modificar (el del ordenador del centro).
  // Las demás trabajadoras solo podrán VER. Debe coincidir EXACTAMENTE con el
  // correo que pongas en el SQL de roles (paso 07).
  const CORREO_ADMIN = "info@venusecretsbcn.es";   // correo que puede agendar y modificar
  // Lista de correos con permiso de administración (agendar/editar). Se
  // añade la cuenta del CRM para que el mismo usuario que gestiona WACRM
  // pueda agendar sin tener que usar el correo "info". Debe coincidir con
  // los correos permitidos en las políticas RLS de Supabase.
  const CORREOS_ADMIN = ["info@venusecretsbcn.es", "venusecretsbcn@gmail.com"];

  // Horario operativo por defecto (editable en el modal de Ajustes ⚙).
  // El grid se "encapsula": solo se muestra el bloque entre apertura y cierre,
  // ocupando el alto disponible de la pantalla.
  const DEFAULT_CONFIG = {
    horaApertura:  "10:00",
    horaCierre:    "20:00",
    tieneDescanso: true,
    inicioDescanso:"14:00",
    finDescanso:   "15:00"
  };
