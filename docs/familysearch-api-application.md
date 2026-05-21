# FamilySearch API — черновик заявки

Подать на: https://www.familysearch.org/developers/

## Project info

- **Name**: Georgia Metric Books Atlas
- **URL**: https://metrics.datatells.info
- **Repo**: (опционально) GitHub-ссылка
- **Contact**: твой email

## Description (EN)

Georgia Metric Books Atlas is a non-commercial historical mapping project
that visualizes Orthodox parish metric books from Georgia (1819–1930) on
an interactive map. Each map point represents a settlement with linked
churches, available record years, and gaps in coverage. The project is
open and free.

We would like to integrate with the FamilySearch Catalog API to help
users discover digitized metric books and parish records relevant to a
given Georgian place (Tiflis/Tbilisi, Kutaisi, Gori, Telavi, etc.) and
deep-link them back to the original FamilySearch records, where they can
authenticate with their own FamilySearch account to view the originals.

## Requested scopes / endpoints

- Read-only access to the **Places** API (place authority resolution for
  Georgian locality names).
- Read-only access to the **Catalog Search** API (search by `place` query).
- No write access, no user data is required.

## Usage pattern

- Server-side OAuth2 client credentials (or per-user OAuth if required).
- Cached locally; calls limited to admin-triggered sync (~once per week
  per place query).
- Results are stored as curated external links in our database and
  surfaced as "Archive sources" in the map popup. Users click through and
  authenticate to FamilySearch with their own account.

## Compliance

- We do not scrape FamilySearch HTML.
- We do not store FamilySearch record content — only public catalog
  metadata (title, place, date range) and the canonical URL.
- We will display "Source: FamilySearch" attribution on each linked item.

## Estimated traffic

Low: under 100 API calls per day during sync; near-zero from end-users
(deep links are anchor tags, not API calls).
