import { NextResponse } from "next/server";

// Public iCal (.ics) feed of busy slots per worker, used by ClassPass
// (and any external calendar) to subscribe to availability. Ported from
// the calendar app's former Vercel serverless function (`api/ical.js`)
// so the feature survives the move into WACRM. It reads the public
// `disponibilidad_publica` view with the anon key and only ever exposes
// opaque "Ocupado" busy blocks — never client names or service details.
//
// This is intentionally unauthenticated: external calendars poll it
// without a session. It lives outside the middleware's protectedPaths
// list, so it stays reachable.

export const dynamic = "force-dynamic";

function aFechaICS(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    p(d.getUTCMonth() + 1) +
    p(d.getUTCDate()) +
    "T" +
    p(d.getUTCHours()) +
    p(d.getUTCMinutes()) +
    p(d.getUTCSeconds()) +
    "Z"
  );
}

interface CitaPublica {
  id: string;
  inicio: string | null;
  fin: string | null;
}

function construirICS(nombreTrabajadora: string, citas: CitaPublica[]): string {
  const ahora = aFechaICS(new Date().toISOString());
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VeneSecrets//Calendario//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:VeneSecrets - ${nombreTrabajadora}`,
  ];

  for (const cita of citas) {
    if (!cita.inicio || !cita.fin) continue;
    lineas.push("BEGIN:VEVENT");
    lineas.push(`UID:${cita.id}@venesecrets`);
    lineas.push(`DTSTAMP:${ahora}`);
    lineas.push(`DTSTART:${aFechaICS(cita.inicio)}`);
    lineas.push(`DTEND:${aFechaICS(cita.fin)}`);
    lineas.push("SUMMARY:Ocupado");
    lineas.push("STATUS:CONFIRMED");
    lineas.push("TRANSP:OPAQUE");
    lineas.push("END:VEVENT");
  }

  lineas.push("END:VCALENDAR");
  return lineas.join("\r\n");
}

export async function GET(request: Request) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new NextResponse(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      { status: 500 },
    );
  }

  const nombre = (new URL(request.url).searchParams.get("t") || "").trim();
  if (!nombre) {
    return new NextResponse(
      "Falta el parametro ?t= con el nombre de la trabajadora.",
      { status: 400 },
    );
  }

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };

  try {
    const cURL =
      `${SUPABASE_URL}/rest/v1/disponibilidad_publica` +
      `?trabajadora=eq.${encodeURIComponent(nombre)}` +
      `&select=id,inicio,fin` +
      `&order=inicio.asc`;
    const cRes = await fetch(cURL, { headers });
    const citas = await cRes.json();

    if (!Array.isArray(citas)) {
      return new NextResponse(
        "Respuesta inesperada de Supabase: " + JSON.stringify(citas),
        { status: 500 },
      );
    }

    const ics = construirICS(nombre, citas as CitaPublica[]);

    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="venesecrets.ics"',
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse("Error generando el calendario: " + message, {
      status: 500,
    });
  }
}
