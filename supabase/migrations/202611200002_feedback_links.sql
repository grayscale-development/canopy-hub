alter table public.feedback_items
  add column if not exists github_issue_url text,
  add column if not exists verified_by uuid references auth.users(id),
  add column if not exists verified_at timestamptz;

alter table public.feedback_items
  drop constraint if exists feedback_items_status_check,
  drop constraint if exists feedback_items_check,
  drop constraint if exists feedback_items_github_issue_url_check,
  drop constraint if exists feedback_items_workflow_check;

alter table public.feedback_items
  add constraint feedback_items_status_check
    check (status in ('open', 'in_progress', 'resolved', 'verified')),
  add constraint feedback_items_github_issue_url_check
    check (github_issue_url is null or github_issue_url ~ '^https://github\.com/grayscale-development/canopy-hub/issues/[0-9]+$'),
  add constraint feedback_items_workflow_check check (
    (status = 'open' and resolved_by is null and resolved_at is null and verified_by is null and verified_at is null)
    or (status = 'in_progress' and github_issue_url is not null and resolved_by is null and resolved_at is null and verified_by is null and verified_at is null)
    or (status = 'resolved' and resolved_by is not null and resolved_at is not null and verified_by is null and verified_at is null)
    or (status = 'verified' and resolved_by is not null and resolved_at is not null and verified_by is not null and verified_at is not null)
  );

grant update (status, resolved_by, resolved_at, github_issue_url, verified_by, verified_at)
  on public.feedback_items to authenticated;

drop policy if exists feedback_items_update_manage on public.feedback_items;
-- Looks good must work after an automated resolve, whose resolved_by is a
-- service actor rather than the reviewing manager.
create policy feedback_items_update_manage on public.feedback_items for update to authenticated
  using (public.user_has_permission_code(auth.uid(), 'feedback.manage'))
  with check (public.user_has_permission_code(auth.uid(), 'feedback.manage'));

alter table public.ai_chat_message_flags
  add column if not exists github_issue_url text,
  add column if not exists verified_by uuid references auth.users(id),
  add column if not exists verified_at timestamptz;

alter table public.ai_chat_message_flags
  drop constraint if exists ai_chat_message_flags_status_check,
  drop constraint if exists ai_chat_message_flags_github_issue_url_check,
  drop constraint if exists ai_chat_message_flags_workflow_check;

alter table public.ai_chat_message_flags
  add constraint ai_chat_message_flags_status_check
    check (status in ('open', 'reviewed', 'closed', 'in_progress', 'verified')),
  add constraint ai_chat_message_flags_github_issue_url_check
    check (github_issue_url is null or github_issue_url ~ '^https://github\.com/grayscale-development/canopy-hub/issues/[0-9]+$'),
  add constraint ai_chat_message_flags_workflow_check check (
    (status = 'in_progress' and github_issue_url is not null and verified_by is null and verified_at is null)
    or (status = 'verified' and verified_by is not null and verified_at is not null)
    or (status in ('open', 'reviewed', 'closed') and verified_by is null and verified_at is null)
  );
