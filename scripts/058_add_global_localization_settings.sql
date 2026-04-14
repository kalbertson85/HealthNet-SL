ALTER TABLE public.hospital_settings
ADD COLUMN IF NOT EXISTS address_line_1 text,
ADD COLUMN IF NOT EXISTS address_line_2 text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS state_or_province text,
ADD COLUMN IF NOT EXISTS postal_code text,
ADD COLUMN IF NOT EXISTS country text,
ADD COLUMN IF NOT EXISTS phone_country_code text,
ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS locale text DEFAULT 'en-US',
ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC',
ADD COLUMN IF NOT EXISTS date_format text DEFAULT 'DD/MM/YYYY',
ADD COLUMN IF NOT EXISTS time_format text DEFAULT '24h',
ADD COLUMN IF NOT EXISTS language text DEFAULT 'en',
ADD COLUMN IF NOT EXISTS state_label text DEFAULT 'State / Province',
ADD COLUMN IF NOT EXISTS city_label text DEFAULT 'City',
ADD COLUMN IF NOT EXISTS facility_label text DEFAULT 'Facility';

UPDATE public.hospital_settings
SET currency_code = COALESCE(NULLIF(currency_code, ''), 'USD'),
    locale = COALESCE(NULLIF(locale, ''), 'en-US'),
    timezone = COALESCE(NULLIF(timezone, ''), 'UTC'),
    date_format = COALESCE(NULLIF(date_format, ''), 'DD/MM/YYYY'),
    time_format = COALESCE(NULLIF(time_format, ''), '24h'),
    language = COALESCE(NULLIF(language, ''), 'en'),
    state_label = COALESCE(NULLIF(state_label, ''), 'State / Province'),
    city_label = COALESCE(NULLIF(city_label, ''), 'City'),
    facility_label = COALESCE(NULLIF(facility_label, ''), 'Facility')
WHERE TRUE;
