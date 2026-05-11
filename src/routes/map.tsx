import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { MapView } from "@/components/map/MapView";
import type { Lang } from "@/lib/i18n";

const searchSchema = z.object({
  lang: fallback(z.enum(["ru", "en", "ka"]), "ru").default("ru"),
});

export const Route = createFileRoute("/map")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Метрические книги Грузии · Архивный атлас 1819–1930" },
      { name: "description", content: "Интерактивная карта приходских метрических книг Грузии 1819–1930. Поиск по селениям, церквям и уездам, анализ в радиусе 10 км." },
      { property: "og:title", content: "Метрические книги Грузии — Архивный атлас 1819–1930" },
      { property: "og:description", content: "Интерактивная историческая карта: поиск, фильтры по периоду, анализ соседних приходов." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
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
