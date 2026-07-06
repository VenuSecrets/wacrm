import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Calendario",
};

// The salon scheduling calendar. It's the existing standalone app
// (formerly its own repo/deploy) served as static assets from
// `/public/calendario`, embedded here so it lives inside the WACRM
// shell — the sidebar and header stay visible around it. It talks to
// the same unified Supabase project as the rest of WACRM, so the CRM,
// the calendar and the before/after photos all share one database.
//
// Full-bleed: cancel the <main> padding with negative margins and size
// the iframe to the viewport minus the 3.5rem (h-14) header.
export default function CalendarioPage() {
  return (
    <div className="-m-4 sm:-m-6">
      <iframe
        src="/calendario/index.html"
        title="Calendario"
        className="block h-[calc(100dvh-3.5rem)] w-full border-0"
      />
    </div>
  );
}
