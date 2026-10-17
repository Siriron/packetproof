# PacketProof — Contract Reference

## Overview

`packet_proof.py` is a GenLayer intelligent contract that implements a
multi-validator, on-chain package release integrity attestation protocol.
It runs on GenLayer StudioNet with the pinned runner:

```
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
```

---

## State Machine

```
DRAFT
  │
  └─ submit_snapshot() ──► COMMIT_LOCKED
                                │
                          attest_release()
                          ┌─────┴──────────┐
                        VERIFIED      INCONCLUSIVE / BLOCKED
                          │                 │
                    (review window)   (retry up to 3×)
                          │
               open_challenge() ──► CHALLENGED
                          │               │
                    (window closes) reassess_challenge()
                          │               │
                      certify()      VERIFIED / BLOCKED / INCONCLUSIVE
                          │
                       CERTIFIED  (terminal)

  Any non-terminal state ──► revoke() ──► REVOKED (terminal)
```

---

## Write Methods

### `register_package(package_name, ecosystem, version, commit_sha, repository_url, review_window_seconds) → str`

Locks a release intent on-chain before the package is published.

**Parameters:**

| Name | Type | Constraint |
|------|------|------------|
| `package_name` | str | Matches `[@A-Za-z0-9][A-Za-z0-9.\-_/]{0,213}` |
| `ecosystem` | str | `"npm"` or `"pypi"` |
| `version` | str | Semver (e.g. `1.2.3`, `2.0.0-rc.1`) |
| `commit_sha` | str | 40-char hex (Git SHA-1) |
| `repository_url` | str | `https://github.com/<owner>/<repo>` only (no `.git`, trailing slash, query or extra path) |
| `review_window_seconds` | int | 300–604800 (5 minutes–7 days) |

**Returns:** `pkg_key` — the deterministic storage key `"{ecosystem}:{pkg_name_lower}:{version}"`.

**Reverts:** duplicate registration, invalid identifiers, package limit exceeded.

---

### `submit_snapshot(pkg_key, snapshot_json, expected_digest) → None`

Submits a post-publication snapshot and authenticates it via GenLayer consensus.
The contract independently fetches the live registry record and uses consensus to
verify the snapshot faithfully represents it.

**Snapshot schema (`packetproof.snapshot.v1`):**

```json
{
  "schema_version": "packetproof.snapshot.v1",
  "package_name": "mylib",
  "ecosystem": "npm",
  "version": "1.2.3",
  "commit_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "captured_at": "2026-10-09T12:00:00Z",
  "dist_hashes": ["shasum:abc123..."],
  "description": "A test library",
  "repository_url": "https://github.com/myorg/mylib",
  "changelog_excerpt": "Fix: resolved null-pointer in widget.render()"
}
```

`expected_digest` must equal `SHA-256(canonical_json(snapshot))` where canonical
JSON is `json.dumps(v, sort_keys=True, separators=(",",":"))`.

**Evidence binding (Rule 0.8):** The registry fetch URL is derived
deterministically from the locked `ecosystem + package_name + version` —
the caller never supplies it. The fetched record must echo the locked
identifiers before it influences the verdict.

**Transitions:** `DRAFT → COMMIT_LOCKED`

---

### `attest_release(pkg_key) → str`

Owner-only. Runs multi-validator consensus attestation. Independently fetches
the registry record and the commit diff, checks dist-hash consistency, then
uses consensus to classify per-rule changelog accuracy.

**Rules assessed:**

| Rule ID | Question |
|---------|----------|
| `changelog_present` | Is a changelog, release note, or commit message present? |
| `changelog_honest` | Does the changelog honestly describe the diff? |
| `version_consistent` | Is the version bump type consistent with the change scope? |

**Per-rule statuses:** `PRESERVED` · `CONSISTENT` · `INCONSISTENT` · `MISSING` · `UNREADABLE` · `CONFLICTING`

**Verdict derivation (deterministic, off-LLM):**

- Any `INCONSISTENT` → `BLOCKED`
- Any `MISSING / UNREADABLE / CONFLICTING`, or evidence unavailable, or
  registry/dist-hash mismatch → `INCONCLUSIVE`
- All `PRESERVED / CONSISTENT` → `VERIFIED`

**Retry budget:** 3 ordinary attestations per package version, 5 total attempts per generation (ordinary + challenge reassessments). The failing call reverts with `ordinary retry limit` / `attestation attempt limit`.

**Returns:** `"VERIFIED"`, `"INCONCLUSIVE"`, or `"BLOCKED"`

---

### `open_challenge(pkg_key, evidence_url) → int`

Non-owner only. Opens a challenge during the review window. The contract
independently fetches the evidence URL and uses consensus to verify relevance
before admitting the challenge.

**Constraints:**
- Package must be in `VERIFIED` state; no challenge already open
- Caller must not be the package owner
- `_now() < review_deadline`
- Maximum 3 challenges per generation

**Returns:** `challenge_id` (int, 1-indexed)

---

### `reassess_challenge(pkg_key) → str`

Runs a fresh attestation consensus to resolve the open challenge.
Any caller may trigger this. Challenge is marked resolved regardless of verdict.

**Returns:** `"VERIFIED"`, `"INCONCLUSIVE"`, or `"BLOCKED"`

---

### `certify(pkg_key) → str`

Owner-only. Certifies a VERIFIED release once the review window has closed.
Performs deterministic re-verification of the full attestation record before
issuing the certification record.

**Guards (all checked deterministically, no nondet call):**
- No open challenge
- State is `VERIFIED` and aggregate is `VERIFIED`
- `assessed_generation == generation`
- `_now() >= review_deadline`
- Attestation record digest re-verifies against stored fields
- All finding statuses are in `PASSING`

**Returns:** `certification_digest` (SHA-256 hex)

---

### `revoke(pkg_key) → None`

Owner-only. Transitions to `REVOKED` (terminal). Not allowed from `CERTIFIED`.

---

## View Methods

All views return `str` (JSON-encoded). Parse with `json.loads()`.

| Method | Returns |
|--------|---------|
| `get_config()` | Protocol constants and supported ecosystems |
| `get_stats()` | Package count and event log counts |
| `get_package(pkg_key)` | Full package record or `{}` |
| `get_attestation(pkg_key, generation)` | Attestation record for a generation or `{}` |
| `get_attestation_attempts(pkg_key, generation, offset, limit)` | Array of attempt records |
| `get_certification(pkg_key)` | Certification record or `{}` |
| `get_challenge(pkg_key)` | Most recent challenge or `{}` |
| `get_challenges(pkg_key, generation, offset, limit)` | Paginated challenge list |
| `packages_of(address, offset, limit)` | Array of pkg_keys owned by address |
| `list_packages(offset, limit)` | Array of pkg_keys from event log |
| `get_events(offset, limit)` | Paginated event log (newest 300 retained) |

---

## Event Log

Events are stored in a ring buffer (cap 300). Each record:

```json
{
  "index": 0,
  "kind": "PACKAGE_REGISTERED",
  "pkg_key": "npm:mylib:1.2.3",
  "data": { "owner": "0x...", "ecosystem": "npm", "version": "1.2.3" }
}
```

**Event kinds:** `PACKAGE_REGISTERED` · `SNAPSHOT_SUBMITTED` ·
`PACKAGE_ATTESTED` · `CHALLENGE_OPENED` · `CHALLENGE_RESOLVED` ·
`CERTIFIED` · `REVOKED`

---

## Bug Fix Record

### Second audit

| ID | Location | Defect | Fix |
|----|----------|--------|-----|
| **E1** | `submit_snapshot`, `_run_attestation`, `open_challenge` | `gl.storage.copy_to_memory()` was called on plain dicts parsed from JSON strings. The SDK asserts on non-storage values, so these three writes reverted. | Detached JSON copies (`json.loads(_dumps(x))`). |
| **E2** | `_now()` | Used `datetime.now()`. | Integer-only parser of `gl.message_raw["datetime"]` (project default). |
| **E3** | `_run_attestation` | Ordinary-retry limit never fired: each ordinary attempt opens a fresh generation whose count is 0. | Counter keyed `"<pkg_key>:ordinary"` in `attempt_counts`. |
| **E4** | `list_packages` | Rebuilt from the 300-slot event ring; older packages disappeared. | `package_index` TreeMap. |
| **E5** | `submit_snapshot`, `_run_attestation` | A registry reply that is valid JSON but not an object raised inside `leader_fn`, so consensus could never settle. | Non-object replies are treated as unavailable. |
| **E6** | dist-hash match | Only `key:value` strings matched, while the UI/docs tell users to paste the bare registry value. | Both the bare value and `key:value` match. |
| **E7** | `_run_attestation` | Mutated the consensus result in place. | Copies it first. |

### First audit (Oct 2026)

| Bug | Location | Fix |
|-----|----------|-----|
| **A** — module-level `gl.nondet.*` calls | `_fetch_json`, `_fetch_text` | Nested inside each `leader_fn`; module level is pure helpers only |
| **B** — `run_nondet_unsafe` called from plain instance method (`_verify_challenge_evidence`) | `open_challenge` | Inlined; `leader_fn`/`validator_fn` are local closures of the `@gl.public.write` body, zero `self.` |
| **C** — dead ternary branch overwritten by `if` block | `_run_attestation` gen assignment | Single clean `if kind == "ORDINARY"` / `else` |
| **D** — all views returned raw `dict`/`list` | Every `@gl.public.view` | All views now return `str` via `_dumps()` |

---

## Security Properties

- **No staking / no value transfers.** Consequence is a public attestation record.
- **Evidence binding.** Registry and commit URLs derived from locked identifiers; caller never supplies fetch targets.
- **Rule 0.8 echo check.** Fetched registry record must name the locked package and version before influencing the verdict.
- **Deterministic authorization.** `certify()` re-verifies the attestation digest against all stored fields; a single field change causes a digest mismatch and reverts.
- **Bounded retries.** 3 ordinary per package version, 5 total per generation; 3 challenges per generation.
- **Prompt injection hardening.** All external content wrapped in `<<<UNTRUSTED_*>>>` markers, HTML-like tokens defused, `_sanitize()` strips non-printable characters.
