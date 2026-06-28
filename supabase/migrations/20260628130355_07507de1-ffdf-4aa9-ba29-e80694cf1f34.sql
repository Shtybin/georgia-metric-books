
-- Dedup exact duplicates: same lat/lon, settlement, church, years.
-- Demote older copies to 'rejected' with a note; keep the newest.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY round(lat::numeric, 6), round(lon::numeric, 6),
                        lower(trim(settlement_ru)),
                        lower(trim(church_ru)),
                        coalesce(years,'')
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.coord_suggestions
  WHERE status = 'approved'
)
UPDATE public.coord_suggestions cs
   SET status = 'rejected'::suggestion_status,
       notes = coalesce(cs.notes,'') ||
               case when coalesce(cs.notes,'') = '' then '' else ' | ' end ||
               'auto-deduped: identical approved suggestion exists'
  FROM ranked r
 WHERE cs.id = r.id AND r.rn > 1;

-- Prevent re-introducing identical approved rows for the same point.
CREATE UNIQUE INDEX IF NOT EXISTS coord_suggestions_approved_unique_natural
  ON public.coord_suggestions (
    round(lat::numeric, 6),
    round(lon::numeric, 6),
    lower(trim(settlement_ru)),
    lower(trim(church_ru)),
    coalesce(years,'')
  )
  WHERE status = 'approved';
