update public.source_configs
set
  config = jsonb_set(config, '{app_id}', to_jsonb('49464eb8-41f0-499e-87dd-4a95f9341784'::text), true),
  updated_at = now()
where source_key in ('processing_assistant_orgs', 'underwriting_orgs')
  and config ->> 'app_id' = '49464eb8-41f0-499e-87dd-4a95f9341785';
