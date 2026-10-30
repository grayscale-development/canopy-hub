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
    'Processing Last 12 Months events for the department dashboard.',
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
    'Underwriting Last 12 Months events for the department dashboard.',
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
`external_row_key` to `AppId + Event + EmployeeId + Date`, separated by the
unit separator. The row hash still detects measure changes, so a resync updates
the same key instead of inserting another copy.

That key collapses two events that share the same app, event, employee, and
date. The sync keeps the last copy in a batch. Confirm with Jimmy that this
combination is unique before enabling the feeds.

Rows Qlik later drops stay until retention deletes them. Retention keeps 14
months by `event_date`. The dashboard itself shows 12 calendar months, from the
first day of the current month minus 11 months through the last day of the
current month.

## Joins

- `EmployeeId` joins `raw.employees.user_id`. Both are text. The directory name
  wins over the name on the event.
- Processing `OrganizationId` joins `raw.processing_assistant_orgs.org_id`.
  Underwriting `OrganizationId` joins `raw.underwriting_orgs.org_id`. Both org
  ids are text. The org table name wins over the name on the event.
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

Processing:

- Total Funded: count of events named Funded. This is events, not distinct AppIds.
- Processing Events: count of event rows, including Funded and Processed.
- Points: sum of Points on every row.
- Processing Speed: average of Processing Net Workdays on every row where it is
  present. If both the Processed and Funded rows carry the same workdays, the
  loan is counted twice.
- Docs to Deadline: average of Docs to Closing, with the same double-count risk.
- Rush %: Funded events with Is Closing/Funding Rush true, divided by Funded
  events. The stored Rush % column is not used.

Underwriting:

- Points: sum of Points on every event, including Pre-Approved and any other
  event that has no column of its own.
- Total Funded: count of events named Funded.
- Initial Review Events: count of events named Initial Review Complete.
- Avg Workdays in Initial Review: average of Workdays in Initial Review on
  Initial Review Complete rows.
- Final Underwriting Events: count of events named Final Underwrite. Final
  Underwriting is not counted.
- Avg Workdays in Underwriting: blank. The event extract has no workdays column
  for underwriting.
- Condition Events: count of events whose name contains "condition". The exact
  Qlik name was not provided.
- Avg Workdays in Conditions: blank. The event extract has no workdays column
  for conditions.
- Bad Loan %: Funded events with IsBadLoan true, divided by Funded events. This
  is a guess. It is not distinct loans, and the stored Bad Loan % column is not
  used.

Filters are Branch, Event Month, Event Week Of, Event, and Org. Week Of uses
Postgres `date_trunc('week')`, which starts on Monday. Filter choices come from
the 12-month window before those filters are applied. The event list is the
newest 100 matching rows per page, capped at 200.

A row whose employee or organization name is Company Avg, Company Average, or
Company Averages is not ingested into the summaries. The summary objects
themselves are not ingested.
