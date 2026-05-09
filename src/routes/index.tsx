import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MapPin, Layers, Globe2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Метрические книги Грузии 1819–1930 · Архивный атлас" },
      { name: "description", content: "Интерактивная карта приходских метрических книг Грузии 1819–1930 года: поиск, периоды, анализ в радиусе 50 км." },
      { property: "og:title", content: "Метрические книги Грузии 1819–1930" },
      { property: "og:description", content: "Архивный атлас — интерактивная карта приходов." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <p className="font-serif text-sm uppercase tracking-[0.2em] text-muted-foreground">
          Архивный атлас · Archival Atlas
        </p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight sm:text-6xl">
          Метрические книги Грузии
          <span className="block text-muted-foreground">1819–1930</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Интерактивная карта приходских регистров: тысячи селений и церквей,
          цветовая категоризация по периоду начала книги, анализ соседних
          приходов в радиусе 50 км, мультиязычный поиск.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/map"
            search={{ lang: "ru" }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:-translate-y-0.5"
          >
            Открыть карту <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/map"
            search={{ lang: "en" }}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-medium hover:bg-accent"
          >
            Open in English <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-16">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Возможности карты · Map features
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Описание функций интерактивной карты. Сами инструменты доступны после её открытия — карточки ниже не кликабельны.
          </p>
        </div>
        <div className="mt-4 grid gap-6 sm:grid-cols-3">
          {[
            { i: MapPin, t: "Анализ радиуса 50 км", d: "Кликните точку — увидите все приходы поблизости." },
            { i: Layers, t: "Цвет по периоду", d: "Okabe-Ito — палитра, дружелюбная к дальтоникам." },
            { i: Globe2, t: "Русский / English", d: "Переключение языка без перезагрузки." },
          ].map(({ i: Icon, t, d }) => (
            <div key={t} className="rounded-2xl border border-border bg-card p-5">
              <Icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
