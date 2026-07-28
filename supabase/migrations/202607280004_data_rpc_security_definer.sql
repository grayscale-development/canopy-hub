alter function data.get_division_production_last_12_months(text, date) security definer;
alter function data.get_branch_production_last_12_months(text, date) security definer;
alter function data.get_employee_production_last_12_months(text, date) security definer;
alter function data.get_file_quality_rollups(date) security definer;
alter function data.get_points_specialists_summary(date, text) security definer;

alter function data.get_division_production_last_12_months(text, date) set search_path = '';
alter function data.get_branch_production_last_12_months(text, date) set search_path = '';
alter function data.get_employee_production_last_12_months(text, date) set search_path = '';
alter function data.get_file_quality_rollups(date) set search_path = '';
alter function data.get_points_specialists_summary(date, text) set search_path = '';
