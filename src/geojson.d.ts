declare module "*.geojson" {
  const value: GeoJSON.FeatureCollection<GeoJSON.Point, any>;
  export default value;
}
