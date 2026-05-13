import { useEffect, useId, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ExternalLink } from "lucide-react";

interface Props {
  lat: number;
  lon: number;
  zoom?: number | null;
  trigger: React.ReactNode;
  title?: string;
}

export function OsmLeafletDialog({ lat, lon, zoom, trigger, title }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const descId = useId();
  const [currentZoom, setCurrentZoom] = useState<number>(() =>
    Math.min(Math.max(zoom ?? 12, 3), 18),
  );

  const z = Math.min(Math.max(zoom ?? 12, 3), 18);
  const externalHref = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${Math.round(z)}/${lat}/${lon}`;
  const label = title ?? "OpenStreetMap";
  const coordsLabel = `широта ${lat.toFixed(5)}, долгота ${lon.toFixed(5)}`;

  function popupHtml(zoomValue: number) {
    const safeLabel = label.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
    );
    return `
      <div style="min-width:160px;font-size:12px;line-height:1.4">
        <div style="font-weight:600;margin-bottom:4px">${safeLabel}</div>
        <div>lat <span style="font-variant-numeric:tabular-nums">${lat.toFixed(5)}</span></div>
        <div>lon <span style="font-variant-numeric:tabular-nums">${lon.toFixed(5)}</span></div>
        <div>zoom <span style="font-variant-numeric:tabular-nums">${zoomValue.toFixed(1)}</span></div>
      </div>
    `;
  }

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      if (!containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        center: [lat, lon],
        zoom: z,
        scrollWheelZoom: true,
        keyboard: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const marker = L.marker([lat, lon], {
        title: label,
        alt: `Маркер: ${label}, ${coordsLabel}`,
        keyboard: true,
        riseOnHover: true,
      })
        .addTo(map)
        .bindPopup(popupHtml(map.getZoom()), { autoPan: true, closeButton: true });

      // Subtle highlight ring around the marker.
      const highlight = L.circleMarker([lat, lon], {
        radius: 18,
        color: "hsl(var(--ring))",
        weight: 2,
        opacity: 0.9,
        fillOpacity: 0,
        interactive: false,
      }).addTo(map);
      window.setTimeout(() => highlight.setStyle({ opacity: 0.4 }), 900);

      const refreshPopup = () => {
        marker.setPopupContent(popupHtml(map.getZoom()));
        setCurrentZoom(map.getZoom());
      };
      map.on("zoomend", refreshPopup);
      map.on("moveend", () => setCurrentZoom(map.getZoom()));

      // Smoothly center and reveal the popup after the dialog has settled.
      window.setTimeout(() => {
        map.flyTo([lat, lon], z, { duration: 0.6 });
        marker.openPopup();
      }, 250);

      mapRef.current = map;
      markerRef.current = marker;
    }, 50);
    return () => {
      window.clearTimeout(id);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [open, lat, lon, z, label, coordsLabel]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="max-w-3xl"
        aria-describedby={descId}
        onOpenAutoFocus={(event) => {
          // Keep focus on the dialog container so screen readers announce title
          // and Esc/Tab work, but don't steal it into the map tiles.
          event.preventDefault();
          (event.currentTarget as HTMLElement)?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="truncate">{label}</span>
              <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">
                {lat.toFixed(5)}, {lon.toFixed(5)} · z{currentZoom.toFixed(1)}
              </span>
            </span>
            <a
              href={externalHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Открыть ${label} на openstreetmap.org в новой вкладке`}
              className="inline-flex items-center gap-1 rounded-sm text-xs font-normal text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              открыть на openstreetmap.org <ExternalLink aria-hidden="true" className="h-3 w-3" />
            </a>
          </DialogTitle>
          <DialogDescription id={descId}>
            Интерактивная карта OpenStreetMap с маркером в точке {coordsLabel}.
            Используйте клавиши со стрелками для перемещения, «+» и «−» для масштабирования,
            Esc для закрытия окна.
          </DialogDescription>
        </DialogHeader>
        <div
          ref={containerRef}
          role="application"
          aria-label={`Карта OpenStreetMap: ${label}, ${coordsLabel}`}
          tabIndex={0}
          className="h-[60vh] w-full overflow-hidden rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
      </DialogContent>
    </Dialog>
  );
}
