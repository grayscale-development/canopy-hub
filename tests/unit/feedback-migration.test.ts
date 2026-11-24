import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { expect, it } from "vitest"

it(
  "applies feedback permissions and policies idempotently",
  { timeout: 60_000 },
  async () => {
    const db = new PGlite()
    try {
      await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema app_private;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
      create table public.permissions (id uuid primary key default gen_random_uuid(), name text not null, code text not null unique);
      create table public.user_permissions (user_id uuid not null, permission_id uuid not null, unique(user_id, permission_id));
      create table public.ai_chat_message_flags (user_id uuid, acknowledged boolean);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
      create function public.user_has_permission_code(p_id uuid, p_code text) returns boolean language sql stable security definer as $$
        select exists(select 1 from public.user_permissions up join public.permissions p on p.id = up.permission_id where up.user_id = p_id and p.code = p_code)
      $$;
      grant usage on schema auth, app_private to authenticated;
      insert into auth.users values ('00000000-0000-4000-8000-000000000001', 'viewer@example.test', '{"full_name":"Viewer"}'), ('00000000-0000-4000-8000-000000000002', 'manager@example.test', '{}');
      insert into public.permissions (name, code) values ('AI', 'ai.settings.access');
      insert into public.user_permissions select '00000000-0000-4000-8000-000000000002', id from public.permissions where code = 'ai.settings.access';
    `)
      const migration = readFileSync(
        "supabase/migrations/202611190003_feedback_inbox.sql",
        "utf8"
      )
      await db.exec(migration)
      await db.exec(migration)
      const grants = await db.query<{ count: number }>(
        "select count(*)::int as count from public.user_permissions up join public.permissions p on p.id = up.permission_id where p.code = 'feedback.manage'"
      )
      expect(grants.rows[0].count).toBe(1)
      await db.exec(
        "insert into public.feedback_items (created_by, type, message) values ('00000000-0000-4000-8000-000000000002', 'idea', 'Manager feedback')"
      )
      await db.exec(
        `set role authenticated; set test.user_id = '00000000-0000-4000-8000-000000000001';`
      )
      await db.exec(
        "insert into public.feedback_items (created_by, type, message, page_path) values ('00000000-0000-4000-8000-000000000001', 'bug', 'Broken', '/wiki/1')"
      )
      expect(
        (await db.query("select id from public.feedback_items")).rows
      ).toEqual([])
      await expect(
        db.exec(
          "insert into public.feedback_items (created_by, type, message) values ('00000000-0000-4000-8000-000000000002', 'bug', 'Forged')"
        )
      ).rejects.toThrow()
      await expect(
        db.query("select * from public.feedback_submitters()")
      ).rejects.toThrow()
      await db.exec("set test.user_id = '00000000-0000-4000-8000-000000000002'")
      expect(
        (
          await db.query(
            "select message from public.feedback_items order by message"
          )
        ).rows
      ).toEqual([{ message: "Broken" }, { message: "Manager feedback" }])
      expect(
        (
          await db.query(
            "select display_name from public.feedback_submitters() order by display_name"
          )
        ).rows
      ).toEqual([
        { display_name: "Viewer" },
        { display_name: "manager@example.test" },
      ])
      await db.exec(
        "update public.feedback_items set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()"
      )
      expect(
        (await db.query("select status from public.feedback_items")).rows
      ).toEqual([{ status: "resolved" }, { status: "resolved" }])
    } finally {
      await db.close()
    }
  }
)

it("widens feedback workflow states without invalidating existing resolved rows", async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function public.user_has_permission_code(uuid, text) returns boolean language sql stable as $$ select false $$;
      insert into auth.users values
        ('00000000-0000-4000-8000-000000000001'),
        ('00000000-0000-4000-8000-000000000002');
      create table public.feedback_items (
        id uuid primary key,
        created_by uuid not null references auth.users(id),
        type text not null,
        message text not null,
        page_path text,
        status text not null check (status in ('open', 'resolved')),
        resolved_by uuid references auth.users(id),
        resolved_at timestamptz,
        created_at timestamptz not null default now(),
        check ((status = 'open' and resolved_by is null and resolved_at is null) or (status = 'resolved' and resolved_by is not null and resolved_at is not null))
      );
      create table public.ai_chat_message_flags (
        id uuid primary key,
        status text not null check (status in ('open', 'reviewed', 'closed'))
      );
      insert into public.feedback_items (id, created_by, type, message, status, resolved_by, resolved_at)
      values ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'bug', 'Already resolved', 'resolved', '00000000-0000-4000-8000-000000000002', now());
      insert into public.ai_chat_message_flags (id, status)
      values ('00000000-0000-4000-8000-000000000004', 'closed');
    `)
    const migration = readFileSync(
      "supabase/migrations/202611200002_feedback_links.sql",
      "utf8"
    )
    await db.exec(migration)
    await db.exec(migration)
    expect(
      (await db.query("select status from public.feedback_items")).rows
    ).toEqual([{ status: "resolved" }])
    await db.exec(`
      update public.feedback_items
      set status = 'in_progress', github_issue_url = 'https://github.com/grayscale-development/canopy-hub/issues/254', resolved_by = null, resolved_at = null
      where id = '00000000-0000-4000-8000-000000000003';
    `)
    await expect(
      db.exec(
        "update public.feedback_items set status = 'in_progress', github_issue_url = null"
      )
    ).rejects.toThrow()
    await expect(
      db.exec("update public.ai_chat_message_flags set status = 'in_progress'")
    ).rejects.toThrow()
    await db.exec(`
      update public.ai_chat_message_flags
      set status = 'verified', verified_by = '00000000-0000-4000-8000-000000000001', verified_at = now()
      where id = '00000000-0000-4000-8000-000000000004';
    `)
  } finally {
    await db.close()
  }
})
