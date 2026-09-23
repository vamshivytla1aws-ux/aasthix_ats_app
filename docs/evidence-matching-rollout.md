# Evidence-based Match Hub rollout

## Activation

Apply migration `0107_evidence_matching_nullable_score.sql` after existing migrations.
On the **web** service set `MATCH_EVIDENCE_V3_ENABLED=true` only after acceptance.
The default is OFF: existing and bulk matching behavior is preserved until rollout.
Keep `OPENAI_API_KEY` and the currently configured `RESUME_MATCH_MODEL` (or
`MATCH_OPENAI_MODEL`). The configured model must support chat JSON responses;
authentication, model access, malformed output and timeouts return no score.
No model upgrade, hybrid recompute, embeddings or premium fallback is invoked.

Run the read-only deployment check on the web service:

```text
npx tsx scripts/checkEvidenceMatching.ts
```

This verifies migration columns and model-list access without paid generation.
It is not a substitute for a generation/accuracy benchmark. The Railway startup
script applies numbered migrations unless `SKIP_STARTUP_MIGRATIONS=true`.

## What changes

The selected candidate/JD pair uses one structured requirement evaluation and
deterministic arithmetic. Existing No-AI and bulk matching remain unchanged.
Recompute always makes a new evaluation and inserts a new immutable history row;
there is no final-score cache. Old results are labeled legacy, not rewritten.
The uploaded candidate blob is authoritative; a confined current local file is
used only when no blob exists. Stored profile summaries are never substitutes.
PDF pages without readable text fail closed. DOCX uses the existing Mammoth
parser. DOC/scanned PDFs require a searchable PDF/DOCX replacement. No paid OCR
is silently invoked. Extraction checks cannot prove that a resume itself is
factually complete or truthful; human review remains necessary.

Parsing cache is bounded to 20 entries/15 minutes and keyed by candidate, current
file SHA-256 and parser version. JD extraction cache is bounded to 32 entries/15
minutes and keyed by JD hash/model/prompt/policy. These caches are process-local,
so replicas may repeat parsing/extraction but cannot reuse another version's fit.

All extracted resume text is processed in overlapping 16,000-character segments,
up to 96,000 characters. JD limit is 32,000 characters and 60 distinct requirements.
Over-budget or incomplete evaluations receive no final score, never truncation.
At most eight AI requests: one JD extraction, six resume segments, one targeted
review. Ordinary short documents use two calls, or three when review is needed.
Each output is capped at 10,000 completion tokens. Evaluation wall budget is 105
seconds; individual requests have at most 45 seconds. Large documents can exhaust
this budget and return unavailable rather than silently produce a partial score.
Confidence is explicitly uncalibrated, separate from fit. Logistics are displayed
but not scored; mandatory logistics configuration is not yet exposed.

## Validation before enabling production

Unit fixtures are synthetic and do NOT establish recruiter agreement. Obtain at
least 60 anonymized complete JD/resume pairs with independent recruiter decisions,
including technical, enterprise and nontechnical roles. Include strong delivery,
basics-only claims, transferable experience, conflicting evidence, missing evidence,
long documents and concurrent jobs. Include the actual Harshit and Dynamics cases
only with authorized full documents; no real-candidate outcome is inferred from
short mocked snippets. These documents/adjudications were not available during
implementation.

The opt-in paid harness is:

```text
npx tsx scripts/benchmarkEvidenceMatching.ts fixtures.json --allow-paid-evaluations --repeat=2
```

Each JSON fixture has `id`, `jd`, `resume`, `adjudicated_by`, ISO `adjudicated_at`,
`expected_decision`, `expected_min`, `expected_max`, `critical_case`, `role_family`
(`technical`, `enterprise_platform`, or `nontechnical`) and `case_tags` (one or
more of `strong`, `basics_only`, `transferable`, `contradictory`, `missing_evidence`,
`long_document`, `overlapping_employment`). All families and tags must be represented;
duplicate document pairs do not count. Use `--validate-only` instead of
`--allow-paid-evaluations` to check the dataset without spending model tokens.
Decisions are `Send to interview`, `Do not shortlist on current evidence`, or
`Clarification required`. Do not put candidate identities in fixture IDs. Keep
private fixtures outside source control. Output omits document text and evidence.
The gate requires >=90% agreement, no critical errors, unavailable results or
recommendation instability. Investigate every error; do not tune to a forced score.

With staging accounts, verify Match Hub live/history parity, selected-pair recompute,
source replacement, no-score states, and own/team/all authorization. Check mobile
and desktop evidence details. No automatic pipeline movement is implemented.
Rollback by setting the flag false; previously stored evidence reports remain readable.

## Local verification

```text
npm test
npx playwright test e2e/evidence-matching.spec.ts --project=desktop-chrome --workers=1
npm run lint
npm run build
```

The browser suite exercises the real Match Hub components at 1440, 768 and 390 px
with isolated API fixtures. It covers live/history parity, selected-pair recompute,
no-score rendering, and preserving the live report when a history save fails.
These tests are not a live database, authentication or AI-provider acceptance test.
Unit tests cover scope checks, source replacement, long-document coverage, eight-call
budget limits, citation/dates, overlaps, malformed/refused output and body deadlines.

The JSON boundary uses runtime schema validation and rejects truncated/refused
responses; see [official OpenAI JSON-mode guidance](https://developers.openai.com/api/docs/guides/structured-outputs#json-mode).
No live provider calls or production database changes were made during local QA.
