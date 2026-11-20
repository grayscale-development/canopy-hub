import { readFileSync } from "node:fs"

import { PGlite } from "@electric-sql/pglite"
import { expect, it } from "vitest"

it("removes the retired permission and grants idempotently, preserving other permissions", async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create table public.permissions (id uuid primary key default gen_random_uuid(), name text not null, code text unique not null);
      create table public.user_permissions (user_id uuid not null, permission_id uuid not null references public.permissions(id) on delete cascade);
      create table public.permission_requests (permission_id uuid not null references public.permissions(id) on delete cascade);
      insert into public.permissions (name, code) values ('Manage Wiki', 'wiki.manage');
    `)
    await db.exec(
      readFileSync(
        "supabase/migrations/202611170002_wiki_duplicates_inspect_permission.sql",
        "utf8"
      )
    )
    await db.exec(`
      insert into public.user_permissions (user_id, permission_id)
        select gen_random_uuid(), id from public.permissions;
      insert into public.permission_requests (permission_id)
        select id from public.permissions;
    `)
    const migration = readFileSync(
      "supabase/migrations/202611200001_drop_wiki_duplicates_inspect_permission.sql",
      "utf8"
    )
    await db.exec(migration)
    await db.exec(migration)

    expect(
      (await db.query("select code from public.permissions")).rows
    ).toEqual([{ code: "wiki.manage" }])
    expect(
      (
        await db.query(
          "select p.code from public.user_permissions up join public.permissions p on p.id = up.permission_id"
        )
      ).rows
    ).toEqual([{ code: "wiki.manage" }])
    expect(
      (
        await db.query(
          "select p.code from public.permission_requests pr join public.permissions p on p.id = pr.permission_id"
        )
      ).rows
    ).toEqual([{ code: "wiki.manage" }])
  } finally {
    await db.close()
  }
}, 60_000)
