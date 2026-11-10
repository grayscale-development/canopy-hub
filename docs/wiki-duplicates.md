# Wiki duplicate detection

`POST /api/wiki/duplicates` requires a signed-in user with `beta.1` and `wiki.manage`. Send `{ "nodeId": "<page UUID>" }` or add `text` to check a selection from the current page. It returns the current `revisionId` and `passages`, each with `blockId`, `common`, and `matches`. Each match includes the current page ID, title, numeric `path`, snippet, score and `type` (`near-exact` or `paraphrase`). A missing or inaccessible page returns 404. A selection must belong to the current page and include at least one eligible passage of 40 normalized characters; selections spanning blocks are mapped to their individual block IDs. Oversized pages can be checked by selection.

The caller's Supabase client reads IDs from `milo_wiki_nodes`, then the current nodes and revisions. This applies live ancestry and permission checks, excludes archived pages and the page being checked, and permits visible drafts only to managers. Current paths and titles are resolved at read time. Heading-only blocks and passages shorter than 40 normalized characters are skipped; nested blocks retain their own IDs.

The cheap tier lowercases and normalizes punctuation and whitespace. Identical text scores 1; otherwise word-trigram Jaccard scores of at least **0.72** are near-exact. If a passage matches more than **3 other pages**, it is returned as `common: true` without flagged matches. If embeddings are configured, the service embeds up to 80 source passages in one batch and searches the existing chunk RPC with four concurrent requests and up to 30 candidates per passage. A current, visible wiki page chunk scoring at least **0.86** is a paraphrase candidate. Chunk boundaries are not passage boundaries, so semantic snippets and scores are chunk-level and can miss or overstate paragraph-level similarity. Old or unindexed revisions are omitted from this tier. Missing or failing embeddings leave the cheap tier available. Source passages over 5,000 characters or pages over 80 passages require a shorter selection.

Results use a 50-entry in-process LRU for 30 seconds, keyed by caller, selection, thresholds, and the visible tree's current revision IDs and paths. Visibility and page changes are rechecked before a cache hit. Index changes and provider availability can take up to 30 seconds to appear. Serverless instances do not share this cache, so a cold instance recomputes results. No new database table or migration is required.

## Synthetic threshold evaluation

`tests/fixtures/wiki-duplicates/pairs.json` contains synthetic wiki-style examples: 3 duplicates, 3 paraphrases, 4 non-duplicates, and 2 boilerplate pairs. `tests/unit/wiki-duplicates.test.ts` calculates the metrics below; boilerplate pairs are separately checked as lexical matches, and the API test checks suppression when text occurs on more than 3 pages.

| Tier                         | Positive labels         | Precision  | Recall     |
| ---------------------------- | ----------------------- | ---------- | ---------- |
| Lexical, 0.72                | duplicate               | 3/3 (100%) | 3/3 (100%) |
| Lexical or fake vector, 0.86 | duplicate or paraphrase | 3/3 (100%) | 3/6 (50%)  |

These tiny synthetic results check the implementation, not production accuracy. The fake provider is a word-hash vector and did not find the paraphrases in this fixture; it does not validate the 0.86 threshold for a real embedding model or evaluate chunk-level retrieval. Before relying on semantic flags, have a reviewer create more representative, anonymized duplicate, paraphrase, non-duplicate and boilerplate pairs; remove identifying information, add them to the fixture, evaluate the actual deployed embedding model and chunk behavior in an approved environment, and adjust the threshold and documented baseline based on precision and recall. Never copy private wiki content into the repository.

To bound local work, a check also rejects a tree over 5,000 visible nodes, more than 2,000,000 candidate characters, or more than 100,000 source-to-candidate comparisons. A selection can reduce comparisons; the other limits require a smaller visible wiki. These are limits, not a guarantee of latency under database or network load.
