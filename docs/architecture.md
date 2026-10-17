# PacketProof — Architecture

## Summary

PacketProof is an on-chain package release integrity attestation protocol built on GenLayer. Before a package maintainer publishes a release, they lock a release intent on-chain. After publication, multi-validator GenLayer consensus independently fetches the registry record and source commit, verifies the dist-hash commitment, and semantically judges whether the changelog honestly describes the changes. The contract deterministically derives a lifecycle state from those verdicts.

## Why multi-validator consensus is necessary

A single-party fetch cannot settle whether a changelog honestly describes a commit. Multiple independent validators each fetching the same registry record and commit patch, then independently judging the changelog, means no single actor can fake a `CERTIFIED` state.

Scope: PacketProof does not download or hash the published package bytes and does not prove they were built from the commit. It attests registry-metadata consistency (name, version, committed dist hashes), the commit patch bound to the locked SHA, and the changelog judgment.

## State machine

```
DRAFT ─── submit_snapshot ──> COMMIT_LOCKED
COMMIT_LOCKED ─── attest_release ──> VERIFIED | INCONCLUSIVE | BLOCKED
VERIFIED ─── open_challenge (non-owner) ──> CHALLENGED
CHALLENGED ─── reassess_challenge (owner) ──> VERIFIED | INCONCLUSIVE | BLOCKED
VERIFIED + deadline passed + no open challenge ─── certify ──> CERTIFIED
* ─── revoke (owner, any pre-CERTIFIED) ──> REVOKED
```

**States:**
| State | Meaning |
|---|---|
| DRAFT | Intent registered; snapshot not yet submitted. |
| COMMIT_LOCKED | Snapshot submitted and committed; awaiting attestation. |
| VERIFIED | All per-rule findings passed; review window open. |
| INCONCLUSIVE | Evidence unavailable, malformed, or conflicting. |
| BLOCKED | At least one rule verdict is INCONSISTENT. |
| CHALLENGED | Open challenge; certification blocked until reassessment. |
| CERTIFIED | Survived review window; permanent terminal state. |
| REVOKED | Owner-revoked before CERTIFIED; terminal. |

## Evidence binding (Rules 0.7 + 0.8)

Registry fetch URL is deterministically derived from locked identifiers — the caller never supplies a URL:

```
npm:  https://registry.npmjs.org/{name}/{version}
pypi: https://pypi.org/pypi/{name}/{version}/json
```

Commit fetch URL is derived from the locked repository URL + commit SHA:
```
https://github.com/{org}/{repo}/commit/{sha}.patch
```

Only `github.com` repositories are accepted. The patch must begin `From <locked sha>`, must be at most 12,000 characters, and an unavailable, unbound or oversized patch gives `INCONCLUSIVE` (`evidence_code` `COMMIT_UNAVAILABLE`, `COMMIT_UNBOUND`, `COMMIT_TOO_LARGE`), never `VERIFIED`. Every dist hash the maintainer committed to must appear in the registry record.

The fetched registry record must echo back the claimed package name and version before it influences the verdict (echo-check rule). A record that does not contain the expected identifiers produces INCONCLUSIVE rather than BLOCKED.

## Per-rule semantic findings

Three rules are evaluated by consensus:

| Rule ID | Question |
|---|---|
| `changelog_present` | Is a changelog/release note present for this version? |
| `changelog_honest` | Does the changelog honestly describe the diff? |
| `version_consistent` | Is the version bump consistent with the scope of changes? |

Each rule returns one of: `PRESERVED`, `CONSISTENT`, `INCONSISTENT`, `MISSING`, `UNREADABLE`, `CONFLICTING`.

Aggregate derivation (deterministic, no LLM):
- Any `INCONSISTENT` → `BLOCKED`
- Any `MISSING`, `UNREADABLE`, or `CONFLICTING`, or evidence unavailable → `INCONCLUSIVE`
- All `PRESERVED` or `CONSISTENT`, evidence available, registry match, dist-hash match → `VERIFIED`

## Challenge system

- Any connected wallet (non-owner) may open a challenge against a `VERIFIED` release during the review window.
- Evidence must be a publicly accessible URL. Validators independently fetch and judge whether it is relevant to this release.
- Irrelevant evidence is rejected without consuming an attempt.
- Maximum 3 admitted challenges per generation.
- An admitted challenge blocks certification until the owner reassesses with `reassess_challenge`.
- Reassessment runs a fresh consensus round with the admitted challenge evidence in the prompt. A fourth rule, `challenge_evidence_addressed`, is judged alongside the three above: `INCONSISTENT` gives `BLOCKED`, `MISSING`/`UNREADABLE`/`CONFLICTING` gives `INCONCLUSIVE`, `CONSISTENT` leaves the release `VERIFIED`.

## Generation tracking

`submit_snapshot` increments the package generation. Old attestation keys include the old generation and cannot satisfy current completeness checks. Stale results from a previous snapshot cannot be replayed.

## Authorization record

`certify` writes a permanent `CertificationRecord` binding:
- package identity (name, ecosystem, version, commit SHA)
- generation number
- attestation digest (cryptographic commitment to all decision-bearing fields)
- evidence root (SHA-256 of all evidence sources)
- certified timestamp

This record is the on-chain artifact downstream consumers read to trust a release.

## Retry bounds

- Owner ordinary attestation: max 3 per package version. (Every ordinary attempt opens a new generation, so a per-generation count could never trip; the counter is keyed to the package.)
- Total attempts per generation (ordinary + challenge reassessment): max 5.
- An owner can always `revoke` a non-terminal release, so a stuck `CHALLENGED`/`INCONCLUSIVE` state has a bounded exit.
- Both bounds prevent liveness griefing from repeated failed fetches.

## Security properties

- **No owner bypass:** Owner cannot force-verify, force-certify, or replace a frozen snapshot.
- **No clock forgery:** `certify` uses GenVM transaction time; no caller-supplied timestamp.
- **Prompt injection resistance:** All external content is labelled untrusted, closing delimiters and backticks are defused, inputs are bounded, output schemas are a closed enum.
- **Expectation bias mitigation:** The candidate observation (registry fetch) happens before the baseline and rules are introduced in the prompt.
