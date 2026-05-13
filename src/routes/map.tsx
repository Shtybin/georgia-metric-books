import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { MapView } from "@/components/map/MapView";
import { STRINGS, type Lang } from "@/lib/i18n";

const searchSchema = z.object({
  lang: fallback(z.enum(["ru", "en", "ka"]), "ru").default("ru"),
});

export const Route = createFileRoute("/map")({
  validateSearch: zodValidator(searchSchema),
  head: ({ match }) => {
    const lang = ((match.search as any)?.lang ?? "ru") as Lang;
    const L = STRINGS[lang].landing;
    const url = `https://metrics.datatells.info/map?lang=${lang}`;
    return {
      meta: [
        { title: L.metaTitle },
        { name: "description", content: L.metaDesc },
        { property: "og:title", content: L.metaTitle },
        { property: "og:description", content: L.metaDesc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: L.metaTitle },
        { name: "twitter:description", content: L.metaDesc },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: MapPage,
});

function MapPage() {
  const { lang } = Route.useSearch();
  const navigate = useNavigate({ from: "/map" });

  return (
    <main className="h-screen w-screen overflow-hidden bg-background">
      <MapView
        lang={lang as Lang}
        onLangChange={(l) => navigate({ search: (p: any) => ({ ...p, lang: l }) })}
      />
    </main>
  );
}
