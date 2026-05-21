import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { TbilisiMap } from "@/components/map/TbilisiMap";
import { tT } from "@/lib/i18n-tbilisi";
import type { Lang } from "@/lib/i18n";

const searchSchema = z.object({
  lang: fallback(z.enum(["ru", "en", "ka"]), "ru").default("ru"),
});

export const Route = createFileRoute("/tbilisi")({
  validateSearch: zodValidator(searchSchema),
  head: ({ match }) => {
    const lang = ((match.search as any)?.lang ?? "ru") as Lang;
    const T = tT(lang);
    const url = `https://metrics.datatells.info/tbilisi?lang=${lang}`;
    return {
      meta: [
        { title: T.metaTitle },
        { name: "description", content: T.metaDesc },
        { property: "og:title", content: T.metaTitle },
        { property: "og:description", content: T.metaDesc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: T.metaTitle },
        { name: "twitter:description", content: T.metaDesc },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: TbilisiPage,
});

function TbilisiPage() {
  const { lang } = Route.useSearch();
  const navigate = useNavigate({ from: "/tbilisi" });
  return (
    <main className="h-screen w-screen overflow-hidden bg-background">
      <TbilisiMap
        lang={lang as Lang}
        onLangChange={(l) => navigate({ search: (p: any) => ({ ...p, lang: l }) })}
      />
    </main>
  );
}
