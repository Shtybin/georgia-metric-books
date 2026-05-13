import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, interactive-widget=resizes-content" },
      { name: "google-site-verification", content: "Vetyq34JAf8lJH8HkDC7kjN4-vDGY095A9ihSjyHu7E" },
      { title: "Georgia Metric Books Map" },
      { name: "description", content: "Интерактивная историческая карта для исследования церковных приходов и населенных пунктов." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Georgia Metric Books Map" },
      { property: "og:description", content: "Интерактивная историческая карта для исследования церковных приходов и населенных пунктов." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Georgia Metric Books Map" },
      { name: "twitter:description", content: "Интерактивная историческая карта для исследования церковных приходов и населенных пунктов." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/F9erIPfz6AW2LhIGOZ5ngbOduhu1/social-images/social-1778322730491-111.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/F9erIPfz6AW2LhIGOZ5ngbOduhu1/social-images/social-1778322730491-111.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Georgia Metric Books Map",
          alternateName: "Архивный атлас метрических книг Грузии",
          url: "https://metrics.datatells.info",
          description:
            "Interactive historical atlas of Georgian parish metric books (1819–1930): search settlements, churches, and uezds, with 10 km neighbourhood analysis.",
          inLanguage: ["ru", "en", "ka"],
          publisher: {
            "@type": "Organization",
            name: "Datatells",
            url: "https://datatells.info",
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: "Georgian Parish Metric Books 1819–1930",
          description:
            "Geocoded index of 19th–early 20th century parish metric books from the National Historical Archive of Georgia (Fond 489, Inventory 6).",
          url: "https://metrics.datatells.info/map",
          inLanguage: ["ru", "en", "ka"],
          keywords: [
            "Georgia",
            "metric books",
            "parish registers",
            "genealogy",
            "history",
            "Caucasus",
          ],
          creator: {
            "@type": "Organization",
            name: "Datatells",
            url: "https://datatells.info",
          },
          isAccessibleForFree: true,
          license: "https://opensource.org/licenses/MIT",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
