# Archive links on cards + Tbilisi map check

## Task 1. A link to the archive page on every card

1. **Check what's there now:** go through all 1,376 points on the main map (and their published edits). For each church, check whether it has a link to archival-services.gov.ge/saeklesio and whether the link opens the right page (settlement or church, not the main catalogue page).
2. **Download the archive structure:** the list of districts (left column, after 1871) and the list of uyezds (მაზრა, right column, data up to 1870), with every settlement and church page.
3. **Match:** link each card to its archive page by settlement name, church and years.
   - Years up to 1870: link to the page in that uyezd's list.
   - Years 1871 and later: link to the district page.
   - If a parish has both periods, the card shows both links, labelled "up to 1870 (uyezd)" and "from 1871 (district)".
4. **Hard cases:** cards with no clear match go to the model (Gemini 4 Argon) along with the archive candidates. Links are added only at confidence of 0.9 or higher; the rest go into a report.
5. **Apply:** add links through the existing card-edit mechanism. Copies of the old cards are saved first.
6. **Show it on the card:** if the card doesn't yet show two separate links, add a clear "Open in the archive" button, with the period labelled, in all three languages.

## Task 2. Check the separate Tbilisi map

1. Check every Tbilisi church: name (ru/en/ka), confession, years, address/description, archive link with its record number.
2. Compare against the archive catalogue (location/55 and related pages) and historical sources: old 1898 maps, OSM, Wikipedia/Wikidata for churches that still exist.
3. Coordinates: check that the point falls inside the right 1898 district and lies near the real or historical site of the church. Look for points that are swapped or bunched together.
4. Fix confirmed errors. Doubtful cases go into a report and are not changed.
5. Check the map in the browser: cards, links and positions of the fixed points.

## Result

- Report (CSV): which cards got links, which links were fixed, and which are still unresolved and why.
- Report on Tbilisi: what was fixed and what is still doubtful.

## Technical details

- Archive scraping: the gateway website-fetch, with caching in /tmp; uyezd lists are parsed separately from district lists.
- Links are stored in the card's `external_sources` (feature_overrides); the card shows `period` (≤1870 / ≥1871).
- Tbilisi: the `tbilisi-churches.json` file and Tbilisi edits; checking whether a point falls inside a district uses `tbilisi-1898-districts.geojson`.
- Estimated model usage: ~150–300 thousand tokens.
