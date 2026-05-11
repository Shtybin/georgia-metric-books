-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Admins can view roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Coord suggestions
CREATE TYPE public.suggestion_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.coord_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_ru TEXT NOT NULL DEFAULT '',
  settlement_en TEXT NOT NULL DEFAULT '',
  uezd_ru TEXT NOT NULL DEFAULT '',
  uezd_en TEXT NOT NULL DEFAULT '',
  region_ru TEXT NOT NULL DEFAULT '',
  region_en TEXT NOT NULL DEFAULT '',
  church_ru TEXT NOT NULL DEFAULT '',
  church_en TEXT NOT NULL DEFAULT '',
  years TEXT NOT NULL DEFAULT '',
  start_year INTEGER,
  end_year INTEGER,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  status suggestion_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  submitter_note TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lat_range CHECK (lat >= -90 AND lat <= 90),
  CONSTRAINT lon_range CHECK (lon >= -180 AND lon <= 180),
  CONSTRAINT has_settlement CHECK (length(settlement_ru) > 0 OR length(settlement_en) > 0)
);

CREATE INDEX idx_coord_suggestions_status ON public.coord_suggestions(status);

ALTER TABLE public.coord_suggestions ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can submit
CREATE POLICY "Anyone can submit suggestions"
  ON public.coord_suggestions FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'pending');

-- Anyone can read approved
CREATE POLICY "Anyone can read approved"
  ON public.coord_suggestions FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

-- Admins can read all
CREATE POLICY "Admins can read all"
  ON public.coord_suggestions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update
CREATE POLICY "Admins can update"
  ON public.coord_suggestions FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can delete
CREATE POLICY "Admins can delete"
  ON public.coord_suggestions FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));