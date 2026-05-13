import { createFileRoute } from "@tanstack/react-router";

function safeOsmUrl(raw: string | undefined) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "www.openstreetmap.org") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/open-osm")({
  validateSearch: (search: Record<string, unknown>) => ({
    to: typeof search.to === "string" ? search.to : undefined,
  }),
  component: OpenOsmPage,
});

function OpenOsmPage() {
  const { to } = Route.useSearch();
  const href = safeOsmUrl(to);

  if (href && typeof window !== "undefined") {
    window.location.replace(href);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-center text-sm text-muted-foreground">
      {href ? (
        <p>
          Открываем OSM… Если переход не начался, {" "}
          <a href={href} className="text-primary underline">
            нажмите здесь
          </a>
          .
        </p>
      ) : (
        <p>Некорректная ссылка OSM.</p>
      )}
    </main>
  );
}