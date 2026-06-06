# Metric Books of Georgia 1819–1930 — Map Guide

This is a short manual for everyone using the interactive
"Metric Books of Georgia" map. It describes every feature, button and
mode, explains what is shown on the map and where to find the original
documents.

Map address: <https://metrics.datatells.info>

---

## 1. What this map is about

The map shows parishes of the Georgian Eparchy from the 19th to early
20th century for which the National Historical Archive of Georgia holds
metric books (records of births, marriages and deaths). Each point is a
church or settlement where a metric book was kept during the indicated
years.

What every point card contains:

- **Settlement** (name in Russian, English, Georgian);
- **Church** — name of the temple (if known);
- **Uezd** and **region** (historical administrative attribution);
- **Years** the metric book was kept, start and end dates;
- **Missing years** (gaps in the archive inventory, if any);
- **Coordinates** (latitude / longitude);
- for some settlements — a **historical name** (e.g. "former
  Akhalkalaki") and **administrator notes** about discrepancies.

The colour of a point matches the period when its book started. The
palette follows the Okabe-Ito scheme and is colour-blind friendly.

---

## 2. Languages and basic UI

In the top right corner — language switcher: **RU / EN / ქარ**. Switches
the interface and card labels on the fly, no reload required.

In the top left — search field: searches by settlement, church, uezd
and region across all three languages at once. Partial words work. Below
the field you'll see the result counter and quick links.

The top right also contains:

- **Reset view** (circular arrow) — returns the map to the initial
  zoom and centre.
- **"Add settlement coordinates"** — opens the panel of settlements
  without coordinates (see § 6).
- **"Before / After"** (compare icon) — appears when curators have
  published edits; one button toggles the map between the base dataset
  and the dataset with edits applied. The number next to it is the
  count of edits.

---

## 3. The point card

Click any point — a card opens with full information about the parish.

In the card you'll see:

- settlement and church name;
- uezd / region;
- years the book was kept, start and end periods;
- missing years (if any);
- a **"hist. name"** or **"former"** badge — if the village was known
  by different names at different times (e.g. "Mepiskalaki (former
  Akhalkalaki)");
- a **"possible match"** badge — if the dataset contains a settlement
  with the same name in a different uezd; useful for checking whether
  it is the same place under a changed administrative attribution;
- **10 km radius analysis** — a button that highlights all parishes
  nearby (useful when the metric book of the desired village is lost —
  records may have been kept in a neighbouring parish);
- **"Report an issue"** button — sends a note to the administrator
  about a map error, wrong coordinates, typo or improvement
  suggestion. Contact details are optional.

---

## 4. Colour legend (book start period)

At the bottom or side of the map there is a clickable legend listing
the periods. Points are coloured by the period in which their metric
book started.

- Any period can be **toggled on or off** with a single click on its
  badge — the map filters points immediately.
- You can disable all periods except one and quickly see how, say,
  parishes from the second half of the 19th century are distributed.
- The palette is friendly to people with colour-vision deficiency
  (Okabe-Ito).

---

## 5. 10 km neighbourhood analysis

Inside a point card — the **"10 km radius analysis"** button. After you
click it, the map highlights all parishes within 10 kilometres of the
selected point. This is especially useful when:

- the metric book of the village you need is lost — see which
  neighbouring parishes kept records in the relevant period;
- you want to understand which church the residents of a small hamlet
  could have been attached to;
- you want to see a "cluster" of parishes belonging to one uezd.

To clear the selection — click the button again or click the map away
from the selection.

---

## 6. Settlements without coordinates and how to add yours

Some settlements from the archive inventories have not been located
yet — no coordinates have been found. You can see them and help the
map:

1. Open the **"Add settlement coordinates"** panel (the list icon in
   the top right).
2. Find the settlement by name (search works in all three languages).
3. Press **"Find on map"** — if the map already knows a similar
   settlement, it will jump to it.
4. To suggest a point — enter latitude / longitude or use the helper:
   open the OpenStreetMap coordinate picker, find the place and
   confirm.
5. The coordinates will be sent to the administrator for moderation.
   Once approved, the point appears for everyone with all the
   settlement, church and date information attached.

You can submit coordinates without registering.

---

## 7. Reporting an issue / proposing a correction

- **"Report an issue"** (bottom right) — a generic form for any
  remarks: a map error, wrong coordinates, typo in a name, an
  improvement idea. Contact is optional.
- Inside a point card administrators can use the **"Propose uezd
  correction"** button — for resolving disputed historical
  administrative attributions. This button is hidden from regular
  users.

All messages go through moderation and are not published
automatically.

---

## 8. "Before / After" mode (base vs. edits)

When curators edit cards and publish their changes, a compare-icon
button appears in the top right corner of the map:

- **"After"** — the map shows the data with edits applied (default
  for everyone).
- **"Before"** — the map shows the original repository data, as it
  was before the edits.

A single button toggles both states. The number next to it shows how
many edits are currently published on top of the base. Useful for
transparently seeing what has been corrected.

---

## 9. Where to find the original documents

(From the built-in "Where to find the documents?" help.)

The metric books of Georgia are kept at the **National Historical
Archive of Georgia** (Tbilisi, Vazha-Pshavela ave. 1).

- Documents are in **fond 489, inventory 6**.
- The metric books inventory is published on the archive's site:
  <https://archival-services.gov.ge/saeklesio/>
- How to start working with the archive, register in the reading hall
  and order files is described in detail at:
  <https://archive.gov.ge/en/mkvlevarta-darbazi>

If a settlement on the map has no metric book — it does not mean it
never existed: records may have been kept in a neighbouring parish.
Use the **10 km radius analysis** (see § 5) to find the nearest
surviving books.

---

## 10. Embedding the map on your site

The map can be embedded as an `iframe` via a special "embed" mode
(address `…/embed`). In this mode auxiliary buttons are hidden, but
the search, legend, languages and point cards remain. Suitable for
blogs, regional communities and educational sites.

---

## 11. Sources, attribution and feedback

- All data comes from the holdings of the National Historical Archive
  of Georgia.
- The map is maintained on the basis of open data and user
  corrections.
- Any remarks and clarifications — through the **"Report an issue"**
  button in the bottom right corner or via the **"Propose uezd
  correction"** form inside a point card.

Thank you for helping to refine the historical geography of Georgia.

---

## 12. The Tbilisi tab and old city maps

A dedicated **Tbilisi** tab (`/tbilisi`) shows a map of 108 city
parishes across all confessions — Orthodox, Armenian, Catholic,
Lutheran, Jewish, Molokan and more. Each card lists the years of the
parish registers and a direct link to the record in the National
Historical Archive of Georgia catalogue, with the record number, so
you can jump straight to the file description.

Church points can also be overlaid on the **old maps of Tiflis from
1898 and 1904**.

- On **desktop**, the map switcher sits in the bottom-left corner.
  The "Base map" dropdown lets you pick the 1898 or 1904 map, or
  "No base" (the modern basemap only). Next to it are an opacity
  slider and a "Police districts" checkbox (1904 map only).
- On **tablet and mobile**, the same controls collapse into a single
  compact **"Old maps"** pill in the bottom-left corner. Tapping it
  opens the dropdown, opacity slider and districts toggle.
- To return to the plain view, select "No base" in the dropdown.

The old maps are georeferenced to modern coordinates, so the church
points line up with both the historical street grid and present-day
toponymy.

---

## Author and copyright

**Author:** Vitalii Shtybin — independent researcher, author of
[datatells.info](https://datatells.info). Other projects and articles by
the author are available on the main site.

© 2025 Vitalii Shtybin. All rights reserved. The maps, data compilations,
accompanying texts and design are an original work protected by copyright.
When citing or republishing, please credit the author and link to
<https://metrics.datatells.info>.
