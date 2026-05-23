import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASEMAP_STYLE, attachBasemapFallback } from "@/lib/map-style";

interface Props {
  lat: number;
  lon: number;
  zoom?: number | null;
  className?: string;
}

export function AdminMiniMap({ lat, lon, zoom, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const z = Math.min(Math.max(zoom ?? 12, 3), 18);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: [lon, lat],
      zoom: z,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;
    new maplibregl.Marker({ color: "#D55E00" }).setLngLat([lon, lat]).addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lon, zoom]);

  return <div ref={containerRef} className={className} />;
}
