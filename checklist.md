# Data Component Source Checklist

Use this to verify each UI component/widget against the data source it currently reads from.

Note: unparameterized dashboard datasets should read `data` views. RPCs are only expected where the UI passes a parameter such as month, selected org, branch, division, employee, or filter values.

## Home Dashboard

- [x] Canopy production last 12 months chart
  - Component/widget: `CanopyProductionChart`
  - Page/helper: `app/home/page.tsx` -> `fetchCanopyProductionSeries`
  - Source: `data.canopy_production_last_12_months`

- [x] Current month division leaderboard
  - Component/widget: `CurrentMonthSummaryTable`
  - Page/helper: `app/home/page.tsx` -> `fetchCurrentMonthDivisionSummary`
  - Source: `data.current_month_division_summary`

- [x] Current month branch leaderboard
  - Component/widget: `CurrentMonthSummaryTable`
  - Page/helper: `app/home/page.tsx` -> `fetchCurrentMonthBranchSummary`
  - Source: `data.current_month_branch_summary`

- [x] Current month loan officer leaderboard
  - Component/widget: `CurrentMonthSummaryTable`
  - Page/helper: `app/home/page.tsx` -> `fetchCurrentMonthLoanOfficerSummary`
  - Source: `data.current_month_loan_officer_summary`

- [x] Current month processor leaderboard
  - Component/widget: `CurrentMonthSummaryTable`
  - Page/helper: `app/home/page.tsx` -> `fetchCurrentMonthProcessorSummary`
  - Source: `data.current_month_processor_summary`

- [x] Current month underwriter leaderboard
  - Component/widget: `CurrentMonthSummaryTable`
  - Page/helper: `app/home/page.tsx` -> `fetchCurrentMonthUnderwriterSummary`
  - Source: `data.current_month_underwriter_summary`

- [x] Current month underwriting org leaderboard
  - Component/widget: `CurrentMonthSummaryTable`
  - Page/helper: `app/home/page.tsx` -> `fetchCurrentMonthUnderwritingOrgSummary`
  - Source: `data.current_month_underwriting_org_summary`

- [x] Funded loans by loan program previous month
  - Component/widget: `FundedLoansByProgramPieChart`
  - Page/helper: `app/home/page.tsx` -> `fetchPreviousMonthLoanProgramSummary`
  - Source: `data.funded_loans_by_program_previous_month`

- [x] Corporate turn times KPIs and preview
  - Component/widget: inline home dashboard section
  - Page/helper: `app/home/page.tsx` -> `fetchCorporateTurnSummary`
  - Source: `data.corporate_turn_times_rows`, `data.corporate_turn_times_kpis`

- [x] Recent newsletters
  - Component/widget: inline home dashboard section
  - Page/helper: `app/home/page.tsx`
  - Source: Supabase Storage newsletter bucket

## Expanded View Pages

- [ ] Expanded canopy production last 12 months
  - Page/component: `app/view/canopy-production-last-12-months/page.tsx` -> `CanopyProductionChart`
  - Source: `data.canopy_production_last_12_months`

- [ ] Expanded funded loans by loan program
  - Page/component: `app/view/funded-loans-by-loan-program/page.tsx` -> `FundedLoansByProgramExpandedView`
  - Source: `data.funded_loans_by_program_previous_month`

- [ ] Expanded corporate turn times
  - Page/component: `app/view/corporate-turn-times/page.tsx`
  - Source: `data.corporate_turn_times_rows`, `data.corporate_turn_times_kpis`

- [ ] Expanded month leaderboard - divisions
  - Page/component: `app/view/month-leaderboard/page.tsx` -> `LeaderboardTableCard`
  - Source: `data.current_month_division_summary`

- [ ] Expanded month leaderboard - branches
  - Page/component: `app/view/month-leaderboard/page.tsx` -> `LeaderboardTableCard`
  - Source: `data.current_month_branch_summary`

- [ ] Expanded month leaderboard - loan officers
  - Page/component: `app/view/month-leaderboard/page.tsx` -> `LeaderboardTableCard`
  - Source: `data.current_month_loan_officer_summary`

- [ ] Expanded month leaderboard - processors
  - Page/component: `app/view/month-leaderboard/page.tsx` -> `LeaderboardTableCard`
  - Source: `data.current_month_processor_summary`

- [ ] Expanded month leaderboard - underwriters
  - Page/component: `app/view/month-leaderboard/page.tsx` -> `LeaderboardTableCard`
  - Source: `data.current_month_underwriter_summary`

- [ ] Expanded month leaderboard - underwriting orgs
  - Page/component: `app/view/month-leaderboard/page.tsx` -> `LeaderboardTableCard`
  - Source: `data.current_month_underwriting_org_summary`

## Division Page

- [ ] Division profile/header
  - Page/helper: `app/division/[divisionId]/page.tsx` -> `fetchDivisionProfileById`
  - Source: `data.divisions`

- [ ] Division production last 12 months
  - Component/widget: `CanopyProductionChart`
  - Page/helper: `app/division/[divisionId]/page.tsx` -> `fetchDivisionLast12MonthsSeries`
  - Source: `data.get_division_production_last_12_months(p_division_id, p_reference_date)` RPC
  - Reason: parameterized by division

- [ ] Division branch summary table
  - Component/widget: `DivisionBranchesDataTable`
  - Page/helper: `app/division/[divisionId]/page.tsx` -> `fetchDivisionBranchSummary`
  - Source: `data.production_data`, enriched with `data.branches`

- [ ] Division employee table
  - Component/widget: `DivisionEmployeesTable`
  - Page/helper: `app/division/[divisionId]/page.tsx` -> `fetchDivisionEmployees`
  - Source: `data.production_data`, enriched with `data.employees`

- [ ] Division pipeline/files table
  - Component/widget: `FilesTableWithDetails`
  - Page/helper: `app/division/[divisionId]/page.tsx` -> `fetchFileViewerFiles`
  - Source: `data.production_data`, enriched with `data.divisions`, `data.branches`, `data.employees`

## Branch Page

- [ ] Branch profile/header
  - Page/helper: `app/branch/[branchId]/page.tsx` -> `fetchBranchProfileById`
  - Source: `data.branches`, latest division from `data.production_data`, division name from `data.divisions`

- [ ] Branch production last 12 months
  - Component/widget: `CanopyProductionChart`
  - Page/helper: `app/branch/[branchId]/page.tsx` -> `fetchBranchLast12MonthsSeries`
  - Source: `data.get_branch_production_last_12_months(p_branch_id, p_reference_date)` RPC
  - Reason: parameterized by branch

- [ ] Branch employee table
  - Component/widget: `DivisionEmployeesTable`
  - Page/helper: `app/branch/[branchId]/page.tsx` -> `fetchBranchEmployees`
  - Source: `data.production_data`, enriched with `data.employees`

- [ ] Branch pipeline/files table
  - Component/widget: `FilesTableWithDetails`
  - Page/helper: `app/branch/[branchId]/page.tsx` -> `fetchFileViewerFiles`
  - Source: `data.production_data`, enriched with `data.divisions`, `data.branches`, `data.employees`

## Employee Page

- [ ] Employee profile/header
  - Page/helper: `app/employee/[employeeId]/page.tsx` -> `fetchEmployeeProfileById`
  - Source: `data.employees`

- [ ] Employee production last 12 months
  - Component/widget: `CanopyProductionChart`
  - Page/helper: `app/employee/[employeeId]/page.tsx` -> `fetchEmployeeLast12MonthsSeries`
  - Source: `data.get_employee_production_last_12_months(p_employee_id, p_reference_date)` RPC
  - Reason: parameterized by employee

- [ ] Employee pipeline/files table
  - Component/widget: `FilesTableWithDetails`
  - Page/helper: `app/employee/[employeeId]/page.tsx` -> `fetchFileViewerFiles`
  - Source: `data.production_data`, enriched with `data.divisions`, `data.branches`, `data.employees`

- [ ] Employee points summary
  - Page/helper: `app/employee/[employeeId]/page.tsx` -> `fetchEmployeePointsSummary`
  - Source: current code checks `specialist_points_new`, then `specialist_points_old` on the default schema
  - Note: verify this; it likely needs to move behind a `data` schema view/function.

## Directories And Operational Pages

- [ ] Employee directory table
  - Component/widget: `EmployeeDirectoryTable`
  - Page/helper: `app/employee-directory/page.tsx` -> `fetchEmployeeDirectoryRows`
  - Source: `data.employee_directory_rows`

- [ ] Branch directory table
  - Component/widget: `BranchesTable`
  - Page/helper: `app/branches/page.tsx` -> `fetchBranchesDirectoryRows`
  - Source: `data.branches_directory_rows`

- [ ] File viewer filters
  - Component/widget: `FileViewerFilters`
  - Source: no direct database fetch; filters are applied by the page

- [ ] File viewer files table
  - Component/widget: `FilesTableWithDetails`
  - Page/helper: `app/file-viewer/page.tsx` -> `fetchFileViewerFiles`
  - Source: `data.production_data`, enriched with `data.divisions`, `data.branches`, `data.employees`

- [ ] Pipeline files table
  - Component/widget: `FilesTableWithDetails`
  - Page/helper: `app/pipeline/page.tsx` -> `fetchPipelineFilesForUser`
  - Source: `data.production_data`, enriched with `data.divisions`, `data.branches`, `data.employees`

- [ ] File quality month picker
  - Component/widget: `FileQualityMonthPicker`
  - Source: local generated month options, no database fetch

- [ ] File quality rollup tables
  - Component/widget: `FileQualityRollupTable`
  - Page/helper: `app/file-quality/page.tsx` -> `fetchFileQualityRollupsForMonth`
  - Source: `data.get_file_quality_rollups(p_month_start)` RPC
  - Reason: parameterized by selected month

- [ ] Points specialists PA org filter
  - Component/widget: `PointsSpecialistsPaOrgFilter`
  - Page/helper: `app/points-specialists/page.tsx` -> `fetchPointsSpecialistsSummary`
  - Source: `data.get_points_specialists_summary(p_reference_date, p_pa_org_id)` RPC
  - Reason: parameterized by reference date and optional PA org

- [ ] Points specialists summary chart
  - Component/widget: `PointsSummaryChart`
  - Page/helper: `app/points-specialists/page.tsx` -> `fetchPointsSpecialistsSummary`
  - Source: `data.get_points_specialists_summary(p_reference_date, p_pa_org_id)` RPC
  - Reason: parameterized by reference date and optional PA org

## Navigation And Storage

- [ ] App sidebar user
  - Component/widget: `AppSidebar`
  - Source: Supabase Auth

- [ ] App sidebar permissions
  - Component/widget: `AppSidebar`
  - Source: `public.permissions`, `public.user_permissions`

- [ ] App sidebar newsletters
  - Component/widget: `AppSidebar`
  - Source: Supabase Storage newsletter bucket

- [ ] App sidebar policies
  - Component/widget: `AppSidebar`
  - Source: Supabase Storage policies bucket

- [ ] Newsletter sidebar launcher upload
  - Component/widget: `NewslettersSidebarLauncher`
  - Source: `/api/newsletters/upload`, Supabase Storage newsletter bucket

- [ ] Policies sidebar launcher upload/rename
  - Component/widget: `PoliciesSidebarLauncher`
  - Source: `/api/policies/upload`, `/api/policies/rename`, Supabase Storage policies bucket

- [ ] Office floor plan sidebar launcher view/upload
  - Component/widget: `OfficeFloorPlanSidebarLauncher`
  - Source: `/api/office-floor-plan/url`, `/api/office-floor-plan/upload`, Supabase Storage office floor plan bucket

## Settings And Admin

- [ ] Advanced sync status card
  - Component/widget: `AdvancedSyncCard`
  - Source: `/api/settings/data-sync/status`, backed by `public.source_configs` and `raw.sync_runs`

- [ ] Advanced sync manual run button
  - Component/widget: `AdvancedSyncCard`
  - Source/action: server action invokes the `data-sync` Edge Function

- [ ] Permissions table
  - Component/widget: `PermissionsTable`
  - Source: `public.permissions`, `public.list_permission_users()`, `public.list_permission_directory_users()`

- [ ] Support directory cards/forms
  - Page/components: support directory pages and edit forms
  - Source: `public.support_directory_sections`, `public.support_directory_entries`, `public.support_directory_entry_contacts`

## Known Follow-Up

- [ ] Confirm remaining business RPC usage is intentional
  - Current intentional RPCs: `data.get_division_production_last_12_months`, `data.get_branch_production_last_12_months`, `data.get_employee_production_last_12_months`, `data.get_file_quality_rollups`, `data.get_points_specialists_summary`
  - Reason: each requires parameters from the UI

- [ ] Fix or confirm employee points summary data source
  - Current source: default-schema `specialist_points_new` / `specialist_points_old`
  - Expected direction: app-facing `data` view/function
