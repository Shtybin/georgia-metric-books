import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASEMAP_STYLE, attachBasemapFallback } from "@/lib/map-style";

interface Props {
  lat: number;
  lon: number;
  zoom?: number;
  className?: string;
  onChange?: (lat: number, lon: number) => void;
}

/** Mini map with a draggable marker. Calls onChange when the marker is moved. */
export function EditableMiniMap({ lat, lon, zoom = 11, className, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Init map once
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: [lon, lat],
      zoom,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const marker = new maplibregl.Marker({ color: "#D55E00", draggable: true })
      .setLngLat([lon, lat])
      .addTo(map);
    marker.on("dragend", () => {
      const { lat: la, lng: lo } = marker.getLngLat();
      onChangeRef.current?.(la, lo);
    });
    markerRef.current = marker;

    map.on("click", (e) => {
      marker.setLngLat(e.lngLat);
      onChangeRef.current?.(e.lngLat.lat, e.lngLat.lng);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external coordinate changes to marker without re-creating map
  useEffect(() => {
    const m = markerRef.current;
    if (!m) return;
    const cur = m.getLngLat();
    if (Math.abs(cur.lat - lat) > 1e-6 || Math.abs(cur.lng - lon) > 1e-6) {
      m.setLngLat([lon, lat]);
    }
  }, [lat, lon]);

  return <div ref={containerRef} className={className} />;
}
