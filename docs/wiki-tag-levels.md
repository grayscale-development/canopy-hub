# Wiki tag levels

Tags are global or tied to a section folder. A page may use global tags and tags belonging to an ancestor folder. Moving a page leaves its tags unchanged; `wiki_page_out_of_scope_tags` lists assignments needing review. Names remain the display value, so existing `/wiki/tags?tag=Name` links continue to work.

`sync_wiki_page_tags` updates tag assignments and `wiki_nodes.tags` in one transaction, with a limit of 12 tags. Existing callers submit names and resolve or create global tags. A future picker can submit `tags_scoped` as JSON objects with `name`, `scope` and `section_id`. New names cannot collide with a global name; section names are case-insensitively unique within a section.

The migration preserves all existing tags and links, including legacy global case variants. New and renamed collisions are rejected. After the reviewed cleanup in issue 54 or 57, a later migration can add a strict case-insensitive global unique index. Issue 55 adds the scope-aware picker and move warning; 56 updates the directory, filters and search; 57 adds manager cleanup and audit.

For rollback, back up the data and review section tags and name conflicts first. The old application requires an unconditional unique `name` constraint, so restoring it requires a reviewed reverse migration; do not automatically drop section data. A forward fix is preferable once section tags are in use.
