# Re-check places without coordinates with the new model

## What we're doing
The "no coordinates" list has 5,159 entries. 450 of them have already been found and approved before. We'll re-check the rest and add whatever we find to the map, as ordinary cards.

## Steps
1. **Clean up the list:** remove entries that are already on the map (approved earlier, or merged into an existing point), and group duplicates (same village + municipality).
2. **Free first pass:** for each village, look up candidates in OpenStreetMap (Nominatim/Overpass, Georgian + Russian + English spelling, with prefixes like ზემო/ქვემო/დიდი stripped), restricted to the right municipality. Also check that the name is in the archive catalogue we downloaded earlier.
3. **Model check (Gemini 4 Argon):** in batches of 10, give it the village, church, years, uyezd/municipality and the OSM candidates. The model picks a match, or proposes coordinates from its own knowledge with a source.
4. **Acceptance rules (automatic, no manual approval):**
   - confidence of 0.9 or higher;
   - the point is inside Georgia (or inside the historical uyezd for border areas) and within 15 km of the municipality centre;
   - no clash with an already approved point (if it duplicates one, it merges with the existing card).
   Everything else goes into the report as "doubtful", and nothing is changed for those.
5. **Adding to the map:** through the existing approval mechanism (the same one as "Add settlement coordinates"), so the card looks like the others: village and church names in ru/en/ka, uyezd, municipality, years, missing years, confession, and a link to the archive page (district and/or uyezd).
6. **Check:** open several new points on the map in the browser and confirm that the card, the archive link and the counters are correct.

## Result
- New points on the map, which disappear from the "no coordinates" list.
- Report (CSV, in Russian): found / doubtful / not found, with coordinates, source and reasoning.
- Model usage estimate: roughly 0.5–1.5 million tokens, depending on how many remain after cleanup.

## Technical details
- Records go into `coord_suggestions` with status approved (with a description of the source and the model), running the same duplicate checks as `approvedNaturalKeys`; archive links go into `external_sources`.
- Prior state saved before writing; Nominatim at 1 request/sec, results cached in /tmp.
