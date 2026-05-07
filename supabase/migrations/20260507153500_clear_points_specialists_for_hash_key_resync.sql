delete from public.qlik_row_ingest_log
where target_table_name in ('specialist_points_old', 'specialist_points_new');

truncate table
  public.specialist_points_old,
  public.specialist_points_new;
