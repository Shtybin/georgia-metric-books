import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { TbilisiMap } from "@/components/map/TbilisiMap";
import { tT } from "@/lib/i18n-tbilisi";
import type { Lang } from "@/lib/i18n";

const searchSchema = z.object({
  lang: fallback(z.enum(["ru", "en", "ka"]), "ru").default("ru"),
  /** historical raster on/off */
  h: fallback(z.coerce.number().int().min(0).max(1), 0).default(0),
  /** historical raster opacity 0–100 */
  o: fallback(z.coerce.number().int().min(0).max(100), 60).default(60),
  /** districts polygons on/off */
  d: fallback(z.coerce.number().int().min(0).max(1), 1).default(1),
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
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/tbilisi" });
  return (
    <main className="h-screen w-screen overflow-hidden bg-background">
      <TbilisiMap
        lang={search.lang as Lang}
        onLangChange={(l) => navigate({ search: (p: any) => ({ ...p, lang: l }) })}
        historicalOn={search.h === 1}
        historicalOpacity={search.o}
        districtsOn={search.d === 1}
        onHistoricalChange={(h, o, d) =>
          navigate({
            search: (p: any) => ({
              ...p,
              h: h ? 1 : 0,
              o,
              d: d ? 1 : 0,
            }),
            replace: true,
          })
        }
      />
    </main>
  );
}
