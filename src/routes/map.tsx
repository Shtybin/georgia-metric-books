import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import type { Lang } from "@/lib/i18n";

const searchSchema = z.object({
  lang: fallback(z.enum(["ru", "en"]), "ru").default("ru"),
});

export const Route = createFileRoute("/map")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Метрические книги Грузии · Архивный атлас 1819–1930" },
      { name: "description", content: "Интерактивная карта приходских метрических книг Грузии 1819–1930. Поиск по селениям, церквям и уездам, анализ в радиусе 50 км." },
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
  const [Mounted, setMounted] = useState<null | typeof import("@/components/map/MapView")["MapView"]>(null);

  useEffect(() => {
    import("@/components/map/MapView").then((m) => setMounted(() => m.MapView));
  }, []);

  return (
    <main className="h-screen w-screen overflow-hidden bg-background">
      {Mounted ? (
        <Mounted
          lang={lang as Lang}
          onLangChange={(l) => navigate({ search: (p: any) => ({ ...p, lang: l }) })}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading map…
        </div>
      )}
    </main>
  );
}
