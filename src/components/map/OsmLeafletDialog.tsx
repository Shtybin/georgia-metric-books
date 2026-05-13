import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

  const z = Math.min(Math.max(zoom ?? 12, 3), 18);
  const externalHref = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${Math.round(z)}/${lat}/${lon}`;

  useEffect(() => {
    if (!open) return;
    // Defer init so the dialog content has a measured size.
    const id = window.setTimeout(() => {
      if (!containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        center: [lat, lon],
        zoom: z,
        scrollWheelZoom: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      L.marker([lat, lon]).addTo(map);
      mapRef.current = map;
    }, 50);
    return () => {
      window.clearTimeout(id);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [open, lat, lon, z]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)} className="inline-flex">
        {trigger}
      </span>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">
              {title ?? "OpenStreetMap"} — {lat.toFixed(5)}, {lon.toFixed(5)}
            </span>
            <a
              href={externalHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-normal text-primary hover:underline"
            >
              открыть на openstreetmap.org <ExternalLink className="h-3 w-3" />
            </a>
          </DialogTitle>
        </DialogHeader>
        <div ref={containerRef} className="h-[60vh] w-full overflow-hidden rounded-md border border-border" />
      </DialogContent>
    </Dialog>
  );
}
