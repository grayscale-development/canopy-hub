# Processing and Underwriting department dashboards

These pages read `data.get_department_dashboard`. They do not read Jimmy's
employee or organization straight tables. Those tables have no ids and start
with a Company Avg row. The Hub ingests only the two Last 12 Months event
objects and calculates the employee table, the organization table, Company Avg,
and the filters.

Specialists and Closing/Funding are not in this change. A later department adds
its own `raw.*_events` table, a `source_configs` row, and a branch in
`data.get_department_dashboard`. The page shell in
`components/department-dashboard/` already takes its columns from
`DEPARTMENT_DASHBOARDS`.

Nothing in this change is applied to a database. Do not enable the feeds until
the `data-sync` function that knows `processing_events` and
`underwriting_events` is deployed.

## Source configs

The migration inserts both rows with `is_enabled = false`. Dispatch only runs
enabled sources. The same rows are:

```sql
insert into public.source_configs (
  source_key,
  source_type,
  description,
  config,
  target_table,
  is_enabled
)
values
  (
    'processing_events',
    'qlik',
    'Processing Last 12 Months events for the department dashboard. Stable key is AppId + Event + EmployeeId + Qlik Date calendar date + Qlik timestamp minute and second.',
    jsonb_build_object(
      'app_id', '8cf1d499-2303-44e0-a3ae-3a029c951270',
      'sheet_id', 'mjkMka',
      'object_id', 'phqfdS',
      'object_description', 'Processing Last 12 Months',
      'primary_key_strategy', 'natural_key',
      'natural_key_columns', jsonb_build_array('AppId', 'Event', 'EmployeeId', 'Date')
    ),
    'raw.processing_events',
    false
  ),
  (
    'underwriting_events',
    'qlik',
    'Underwriting Last 12 Months events for the department dashboard. Stable key is AppId + Event + EmployeeId + Qlik Date calendar date + Qlik timestamp minute and second.',
    jsonb_build_object(
      'app_id', '8cf1d499-2303-44e0-a3ae-3a029c951270',
      'sheet_id', '19dfa7e3-7cfb-4f4f-bc72-b590abb24514',
      'object_id', '3926bb86-4cb8-4ef5-9726-95907d6b967a',
      'object_description', 'Underwriting Last 12 Months',
      'primary_key_strategy', 'natural_key',
      'natural_key_columns', jsonb_build_array('AppId', 'Event', 'EmployeeId', 'Date')
    ),
    'raw.underwriting_events',
    false
  )
on conflict (source_key) do update set
  source_type = excluded.source_type,
  description = excluded.description,
  config = excluded.config,
  target_table = excluded.target_table,
  updated_at = now();
```

The upsert above does not change `is_enabled`, so it will not turn a feed back
off. Enable only after the new sync function is deployed:

```sql
update public.source_configs
set is_enabled = true, updated_at = now()
where source_key in ('processing_events', 'underwriting_events');
```

`config.primary_key_strategy` is recorded for operators. The sync function does
not read it. `supabase/functions/_shared/transforms.ts` sets
`external_row_key` to `AppId + Event + EmployeeId + event_date + mmss`,
separated by the unit separator. `event_date` is the Qlik Date calendar date,
and `mmss` is the minute and second from the Qlik timestamp; the timestamp
hour is deliberately excluded. `event_at` remains the full timestamp for
display and ordering. This is stateless and chunk-safe: a uniform whole-hour
DST shift does not change a key, including when matching rows land in different
1000-row self-chained fetches.

Two events with the same AppId, Event, EmployeeId, date, and minute-and-second
collide; this is considered negligible for these feeds. A uniform whole-hour
shift can still change a key for an event within one hour after midnight,
because its Qlik calendar date changes. This is a known rare limitation. Rows
missing AppId, Event, EmployeeId, or a parseable Qlik Date/time are not written
to either event table; they are logged as `skipped` in `raw.row_ingest_log` with
the reason and raw payload.

`organization_id` is not part of that key.
Processing reads `ProcessingOrganizationId`, and underwriting reads
`UnderwritingOrganizationId`. Jimmy's earlier objects used `OrganizationId`,
so either title is accepted. The id is the Qlik cell `qText`, including a
number stored as text. A blank `qText` falls back to `qNum`. A later sync
updates the same key and fills `organization_id` on the existing row.
`event_at` stores that timestamp.
`event_date` is the calendar date from the Qlik Date text. The Qlik text
`10/29/2026 11:48:56 AM` is stored as `2026-10-29T11:48:56.000Z`, so the
calendar date does not move when the sync runtime is not UTC. The row hash
still detects measure changes, so a resync updates the same key instead of
inserting another copy.

`supabase/migrations/202610300004_department_dashboard_metric_fixes.sql` adds
`event_at` and replaces `data.get_department_dashboard`. It does not truncate
either table. The first deploy used the calendar date only; the next used the
full timestamp; then the occurrence-rank format. The current minute-and-second
keys differ from every older format.
Do not truncate production from the app deploy or from a migration. After the
migration and the data-sync function are deployed, Zach approves this
statement and it is run once, before a full resync of both feeds:

```sql
truncate raw.processing_events, raw.underwriting_events;
```

Then run one full sync of `processing_events` and `underwriting_events`. This
truncate and resync is required on deploy so the tables do not retain rows
under the old key formats.

Rows Qlik later drops stay until retention deletes them. Retention keeps 14
months by `event_date`. The dashboard window is the whole extract: the first
day of the month 12 months before the reference month through the reference
date. The reference date is today unless the caller passes another date. When
the reference month is October 2026, October 2025 is included. The window ends
on the reference date, not on the last day of that month.

## Joins

- `EmployeeId` joins `raw.employees.user_id`. Both are text. The directory name
  wins over the name on the event.
- Processing `ProcessingOrganizationId` (or `OrganizationId`) joins
  `raw.processing_assistant_orgs.org_id`. Underwriting
  `UnderwritingOrganizationId` (or `OrganizationId`) joins
  `raw.underwriting_orgs.org_id`. Both org ids are trimmed text. The org table
  name wins over the name on the event. Organization rows and the org filter
  group by that id. When the id is null, they group by `organization_name`,
  so a missing id cannot collapse every organization into one row.
  `202610300005_department_org_id_fallback.sql` replaces
  `data.get_department_dashboard` for that fallback. It does not truncate,
  drop columns, or enable the feeds.
- Branch is the loan branch: `AppId` = `raw.production_data.loan_number`, then
  `branch_id` to `raw.branches`. This is not the employee's latest context
  branch from `data.employee_directory_rows`. If AppId is not the loan number,
  every branch filter comes back empty.

`raw.employees` has no branch column.

## Metrics

Company Avg is the unweighted average of the rows in that table. It is not a
company total, and it is not the pooled ratio. A person with no funded events
has a null Rush % or Bad Loan %, and that null is left out of the average.
Null speed and workday values are left out the same way. Confirm this with
Jimmy. Qlik might instead show a volume-weighted average or a total on that
row.

Event names are compared without case or surrounding spaces.

The org filter chooses which organization rows appear, and which employees
are listed. An employee is listed when they have at least one event in the
selected org after the branch, month, week, and event filters. Each
employee's metrics are still that person's totals across every organization,
keyed by `employee_id`. Zach's Qlik row for Brooklynn Fertig is 356 funded
and 403 events across 10 orgs, and an org view that includes her shows those
all-org totals. Branch, month, week, and event filters still narrow those
totals. Company Avg stays the unweighted average of the rows in that table,
so an org view averages the all-org totals of the employees who worked in
that org. Organization metrics stay inside the selected org.

Processing:

- Total Funded: count of Funded events where Processing Net Workdays is not
  null. This is events, not distinct AppIds. For Canopy Mortgage, LLC this
  matches Qlik at 2370.
- Processing Events: count of Processed events where Points is not null.
  Funded events are not included. For Canopy Mortgage, LLC this matches Qlik
  at 2627.
- Points: sum of Points on Processed events only. This matches Jimmy's Qlik
  expression `Sum(If(MonthStart(Date) >= MonthStart(Today(),-12) AND
  Event='Processed', Points))` because the dashboard window already starts on
  the first day of the month 12 months before the reference month.
- Processing Speed: average of Processing Net Workdays on every row where it is
  present. If both the Processed and Funded rows carry the same workdays, the
  loan is counted twice.
- Docs to Deadline: average of Docs to Closing, with the same double-count risk.
- Rush %: Funded events with Is Closing/Funding Rush true and Processing Net
  Workdays not null, divided by Funded events with Processing Net Workdays
  not null. That is the same funded set as Total Funded. The stored Rush %
  column is not used.

Underwriting:

- Points: sum of Points on every event, including Pre-Approved and any other
  event that has no column of its own.
- Total Funded: count of events named Funded. See open items.
- Initial Review Events: count of events named Initial Review Complete.
- Avg Workdays in Initial Review on Funded Events: average of Workdays in
  Initial Review on Funded rows. Historic or otherwise missing values remain
  null and are excluded from the average; this does not change Initial Review
  Events.
- Final Underwriting Events: count of events named Final Underwrite. Final
  Underwriting is not counted.
- Avg Workdays in Underwriting on Funded Events: average of Workdays in
  Underwriting on Funded rows. Historic or otherwise missing values remain
  null and are excluded from the average.
- Condition Events: count of events whose name contains "condition". The exact
  Qlik name was not provided.
- Avg Workdays in Conditions on Funded Events: average of Workdays in
  Conditions on Funded rows. Historic or otherwise missing values remain null
  and are excluded from the average; this does not change Condition Events.
- Bad Loan %: Funded events with IsBadLoan true, divided by Funded events. This
  is a guess. It is not distinct loans, and the stored Bad Loan % column is not
  used.

Filters are Branch, Event Month, Event Week Of, Event, and Org. Week Of uses
Postgres `date_trunc('week')`, which starts on Monday. Filter choices come from
the dashboard window before those filters are applied. The event list is the
newest 100 matching rows per page, capped at 200. The org filter narrows the
event list and the organization table. It chooses which employees are listed
and does not narrow their metrics.

A row whose employee or organization name is Company Avg, Company Average, or
Company Averages is not ingested into the summaries. The summary objects
themselves are not ingested.

## Open items
- Underwriting Total Funded is still the count of Funded events. For Canopy
  Mortgage, LLC, Qlik shows 3078 and the extract has 3179 Funded rows. That
  gap is unexplained. The Processing rule that requires Processing Net
  Workdays was not applied here.
