import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import type { Lang } from "@/lib/i18n";

const searchSchema = z.object({
  lang: fallback(z.enum(["ru", "en"]), "ru").default("ru"),
});

export const Route = createFileRoute("/embed")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Map embed" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmbedPage,
});

function EmbedPage() {
  const { lang } = Route.useSearch();
  const navigate = useNavigate({ from: "/embed" });
  const [Mounted, setMounted] = useState<null | typeof import("@/components/map/MapView")["MapView"]>(null);

  useEffect(() => {
    import("@/components/map/MapView").then((m) => setMounted(() => m.MapView));
  }, []);

  return (
    <main className="h-screen w-screen overflow-hidden bg-background">
      {Mounted && (
        <Mounted
          embed
          lang={lang as Lang}
          onLangChange={(l) => navigate({ search: (p: any) => ({ ...p, lang: l }) })}
        />
      )}
    </main>
  );
}
