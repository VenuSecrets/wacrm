import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fotos Antes/Después",
};

// The before/after treatment-photos app. Like the calendar, it's the
// existing standalone tool served as static assets from `/public/fotos`
// and embedded here so it lives inside the WACRM shell. It uploads to
// the shared `fotos-tratamiento` Supabase Storage bucket and the
// `fotos_tratamiento` table in the same unified project as the CRM.
export default function FotosPage() {
  return (
    <div className="-m-4 sm:-m-6">
      <iframe
        src="/fotos/index.html"
        title="Fotos Antes/Después"
        className="block h-[calc(100dvh-3.5rem)] w-full border-0"
      />
    </div>
  );
}
