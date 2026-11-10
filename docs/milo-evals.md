# Milo retrieval evaluation

Run against a fresh **local** Supabase stack (Docker), after resetting and seeding it with the same seed used by database CI. Set `NEXT_PUBLIC_SUPABASE_URL` to `http://127.0.0.1:54321` and supply the local anon and service-role keys from `supabase status -o env` in the process environment. Then run:

```sh
corepack pnpm test:milo-evals
```

The runner requires the local URL, forces `fake-embedding`, creates its own users and synthetic wiki pages, and removes its rows afterward. It never calls a chat provider. Run it before other DB tests on a freshly seeded database: the real retrieval functions search all content visible to the viewer, so unrelated indexed data can affect the ranking. CI runs it on the nightly schedule before the DB tests, and uploads `milo-eval-report/` as an artifact. The command exits nonzero on a permission leak or a regression beyond the stored tolerance. Reports contain per-question results; they are ignored by Git.

## What the scores mean

- Hit@1 and hit@3: the share of answerable questions with an expected page among the first one or three retrieved chunks, respectively.
- Citation correctness: among expected-page chunks in the first three results, the share with the current numeric wiki URL. A missing expected page lowers hit rate; it does not count as a correct citation. With no expected-page chunks, this metric is zero.
- Abstention rate: the share of unanswerable questions with no retrieved chunks. This is a conservative retrieval proxy, **not** a judgment of whether an agent's generated answer abstains. Vector retrieval may return unrelated candidates, so zero is possible.
- Restricted cases independently fail on any forbidden draft returned through either combined retrieval or the agent's keyword tool. A manager control confirms the draft can be found. These cases are excluded from the quality rates.

This measures retrieval and source links, not the accuracy of a generated answer or citations chosen by a model. There is no real-provider mode. The examples are synthetic; production questions and flags were unavailable.

## Add a case and update the baseline

1. Edit `tests/fixtures/milo-evals/golden.json`. Add or reuse a synthetic page under `pages`, then add a unique case ID, question, kind, and page IDs under `cases`. Use `answerable` with `expectedPages`, `unanswerable` with an empty list, or `restricted` with an empty expected list and draft IDs in `forbiddenPages`. Keep 30–50 questions. A restricted question must retrieve its draft for a manager.
2. For future real questions or `ai_chat_message_flags`, have a person review and anonymize them first. Remove names, loan numbers, confidential text, and other identifiers; adapt the expected source to a synthetic fixture. Never copy production rows or credentials into this set.
3. Run the evaluation on a fresh local seed, inspect the per-case JSON and markdown report, and investigate changes. Only after reviewing an intentional change, copy the four observed metrics into `tests/fixtures/milo-evals/baseline.json`. The tolerance is an absolute fraction (0.05 means five percentage points), applied independently to each metric. Commit the fixtures and baseline together; never update the baseline merely to silence a regression.
