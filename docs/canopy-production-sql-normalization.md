# Canopy Production SQL Normalization

The chart normalization is now handled in Supabase with:

- `public.get_canopy_production_last_12_months(p_reference_date date default current_date)`

Defined in:

- [`supabase/migrations/202604080001_canopy_production_last_12_months.sql`](../supabase/migrations/202604080001_canopy_production_last_12_months.sql)

## What it returns

One row per month for the last 12 months (oldest to newest), zero-filled:

- `month_key` (`YYYY-MM`)
- `label` (`Mon YYYY`)
- `funded_count` (integer)
- `funded_volume` (numeric)

## App usage

Primary path:

- [`fetchCanopyProductionSeries`](../lib/hub-data.ts)

Current `/home` behavior:

- loads chart data from the RPC only
- shows `Data load failed.` if the RPC call fails
