<div align="center">

<img src="./public/favicon.svg" width="88" alt="PacketProof logo" />

# PacketProof

### On-chain package release integrity attestation. Multi-validator consensus verifies that what you shipped matches what you claimed, before any downstream consumer trusts it.

<br />

![Runner](https://img.shields.io/badge/runner-py--genlayer%3A1jb45aa8…-7c3aed?style=flat-square)
![Network](https://img.shields.io/badge/network-StudioNet-blue?style=flat-square)
![Ecosystems](https://img.shields.io/badge/ecosystems-npm%20%C2%B7%20pypi-cb3837?style=flat-square)
![Staking](https://img.shields.io/badge/staking-none-lightgrey?style=flat-square)
![Stack](https://img.shields.io/badge/stack-React%20%C2%B7%20TypeScript%20%C2%B7%20Vite-0ea5e9?style=flat-square)
![Tests](https://img.shields.io/badge/direct--mode%20tests-118%20passing-brightgreen?style=flat-square)

<br />

`DRAFT` → `COMMIT_LOCKED` → `VERIFIED` → *review window* → `CERTIFIED` (terminal)

`BLOCKED` / `INCONCLUSIVE` / `REVOKED`

<br />

**[Contract on Explorer](https://explorer-studio.genlayer.com/address/0x1DB3E1D8707878BdA664d03916BBe4937de472bb)** &nbsp;·&nbsp; **[Docs](./docs/architecture.md)** &nbsp;·&nbsp; **[Smart Contract](./contracts/packet_proof.py)**

</div>

<br />

## Contents

[Concept & Motivation](#concept--motivation) · [Why Multi-Validator Consensus](#why-multi-validator-consensus) · [Intelligent Contract](#intelligent-contract) · [Audit & Bug Fixes](#audit--bug-fixes) · [Direct-Mode Tests](#direct-mode-tests) · [Frontend App](#frontend-app) · [Quick-Start](#quick-start) · [Deploy](#deploy) · [Project Structure](#project-structure)

<br />

---

## Concept & Motivation

### The Supply-Chain Integrity Problem

The npm and PyPI ecosystems ship billions of package installs per month. A maintainer who publishes a release with a misleading changelog, can publish a release whose registry metadata or changelog does not match the commit it claims to come from, with no on-chain record of the discrepancy. PacketProof locks a pre-commitment to a release intent before publication, then has multiple validators independently check the registry's own record and the commit patch against it.

PacketProof fills that gap. Before publishing, the maintainer locks four fields on-chain: package name, registry ecosystem, version, and source commit SHA. After publication, the contract independently derives the registry URL from those locked identifiers (the caller never supplies a URL), fetches the live registry record across multiple GenLayer validators, checks that every committed dist hash appears in that registry record, and uses consensus to judge whether the changelog honestly describes the commit patch. The result is a permanent attestation record any downstream tool can read.

**What a certified release does and does not prove.** It proves the registry record echoes the locked name and version, the committed dist hashes appear in it, the GitHub patch for the locked commit was fetched and echoes that SHA, and validators agreed the changelog is present and honest against that patch and the version bump is consistent. It does **not** prove the published package bytes were built from the commit: the contract never downloads or hashes the tarball or wheel, and dist hashes are matched against registry metadata, not recomputed. Only `github.com/<owner>/<repo>` repositories are supported, and patches longer than 12,000 characters are `INCONCLUSIVE`.

> *A supply-chain attacker who controls the registry response on one validator cannot control it on all validators simultaneously.*

<br />

## Why Multi-Validator Consensus

### The Adversarial Case

Single-party fetch cannot prove integrity. A maintainer who controls both the package registry and a single-validator chain can craft a response that makes any release look clean. GenLayer's optimistic execution model runs the same leader function on multiple independent validators, each fetching the registry live. For a `CERTIFIED` outcome to be issued:

- Every validator must independently fetch the same registry record
- Every validator must independently fetch the same commit diff
- The payload hash must match across validators (enforced by `validator_fn`)
- The deterministic verdict must be `VERIFIED` on all fields
- The certification proof must re-verify the attestation digest on-chain

The challenge window adds a second adversarial layer: any non-owner address can submit evidence during the review period. If the evidence is judged relevant by consensus, a fresh independent attestation is triggered.

<br />

## Intelligent Contract

### Evidence Binding (Rules 0.7 + 0.8)

**Deterministic URL derivation.** The caller never supplies a fetch URL. Every fetch target is derived deterministically from the locked on-chain identifiers (Rule 0.7). A caller who supplies their own URL could point the contract at an attacker-controlled mirror.

```python
# npm registry: locked package_name + version only
_registry_url("npm", "mylib", "1.2.3")
# -> https://registry.npmjs.org/mylib/1.2.3

# pypi registry
_registry_url("pypi", "requests", "2.31.0")
# -> https://pypi.org/pypi/requests/2.31.0/json

# commit patch: locked github.com repository_url + commit_sha
_commit_patch_url("https://github.com/myorg/mylib", "abc123...")
# -> https://github.com/myorg/mylib/commit/abc123....patch
```

**Rule 0.8 (echo check).** After fetching the registry record, the contract verifies the record refers back to the locked identifiers before it influences the verdict. The commit patch must begin `From <locked sha>`; a patch for another commit, an HTML page, or a failed or oversized fetch yields `INCONCLUSIVE`, never `VERIFIED`.

### Four Nondet Call Sites

<table>
<tr>
<td width="50%" valign="top">

**`leader_fn`**

- Fetches live registry endpoint
- Performs Rule 0.8 echo check
- Fetches the raw `.patch` for the locked commit (no HTML fallback)
- Adds the admitted challenge evidence to the prompt on reassessment
- Calls `exec_prompt` for semantic judgment
- Returns full payload dict with all decision fields

</td>
<td width="50%" valign="top">

**`validator_fn`**

- Checks `isinstance(leaders_res, gl.vm.Return)` first
- Reads `.calldata`, never `json.loads`
- Re-runs `leader_fn()` independently
- Uses `_payload_matches` on all non-explanation fields
- Validates `leader_explanations` shape separately

</td>
</tr>
</table>

### Verdict Rules

| Status | Meaning |
|---|---|
| `PRESERVED` | Requirement fully met |
| `CONSISTENT` | Acceptable variation |
| `INCONSISTENT` | Blocking violation |
| `MISSING` | Evidence absent |
| `UNREADABLE` | Evidence malformed |
| `CONFLICTING` | Evidence contradicts |

Any `INCONSISTENT` gives `BLOCKED`. Any `MISSING`, `UNREADABLE` or `CONFLICTING`, unavailable evidence, or a registry/dist-hash mismatch gives `INCONCLUSIVE`. All `PRESERVED` or `CONSISTENT` gives `VERIFIED`.

### Per-Rule Semantic Questions

| Rule ID | Question | BLOCKING if |
|---|---|---|
| `changelog_present` | Is a changelog, release note, or commit message present and non-empty for this version? | `INCONSISTENT` |
| `changelog_honest` | Does the changelog honestly describe the changes visible in the commit diff? Are there unmentioned additions, removals, or modifications? | `INCONSISTENT` |
| `version_consistent` | Is the version bump type (patch/minor/major) consistent with the scope of changes in the diff? | `INCONSISTENT` |

### Lifecycle Flow

1. **`register_package()`** Lock release intent on-chain. Validates semver, hex SHA, repo URL prefix, review window bounds. Returns `pkg_key`. State: `DRAFT`.
2. **`submit_snapshot()`** After publication, owner submits a post-capture snapshot. The contract independently authenticates it against the live registry via nondet consensus. State: `COMMIT_LOCKED`.
3. **`attest_release()`** Run full semantic attestation. Fetches registry + commit diff across validators; derives verdict deterministically. Up to 3 ordinary attempts per package version, 5 total per generation. State: `VERIFIED` / `INCONCLUSIVE` / `BLOCKED`.
4. **`open_challenge()`** (non-owner only) During the review window, any non-owner may submit evidence. The evidence URL is independently fetched and judged for relevance by consensus. Up to 3 challenges per generation. State: `CHALLENGED`.
5. **`reassess_challenge()`** Run a fresh attestation with the challenge context bound into the payload. Resolves the challenge and updates the package state. Anyone can call it.
6. **`certify()`** After the review window closes and all challenges are resolved, the owner calls `certify()`. The contract re-derives and verifies the attestation digest on-chain before issuing the `certification_digest`. Terminal state: `CERTIFIED`.
7. **`revoke()`** The owner can withdraw any non-terminal release, so no state is a dead end.

<br />

## Audit & Bug Fixes

The contract was audited twice against the GenLayer Agent Playbook, then corrected after steward review. The first audit found four bugs (A to D); a second audit found seven more (E1 to E7). All are fixed.

### First audit (Oct 2026)

| Bug | Defect | Fix |
|---|---|---|
| **A** | `_fetch_json` and `_fetch_text` were defined at module level containing `gl.nondet.web.get()`. The genvm-linter (E010) rejects any module-level helper with nondet calls. | Both helpers are now nested closures inside every `leader_fn` that needs them. Module level contains zero `gl.nondet.*` calls. |
| **B** | `_verify_challenge_evidence` was a plain instance method calling `gl.vm.run_nondet_unsafe()` via `self.`. The method containing `run_nondet_unsafe` must be the `@gl.public.write` body itself. | Inlined entirely into `open_challenge`. The `leader_fn`/`validator_fn` closures have zero `self.` references. |
| **C** | In `_run_attestation`, a ternary in the generation assignment was immediately overwritten by the following `if kind == "ORDINARY"` block, making it dead code. | Replaced with a single clean `if`/`else` branch. |
| **D** | All 10 view methods were annotated `-> dict` or `-> list` and returned those types directly. All views must return `str` via `json.dumps()`. | Every view returns `_dumps(...)` and is annotated `-> str`. |

### Steward review (Oct 2026)

| # | Defect | Fix |
|---|---|---|
| **S1** | `reassess_challenge` re-ran attestation without the admitted challenge evidence, so a challenge could never affect the validators' decision. | The evidence text is in the prompt, and a fourth rule, `challenge_evidence_addressed`, makes validators commit to a status on it. `INCONSISTENT` gives `BLOCKED`; uncertain gives `INCONCLUSIVE`. |
| **S2** | An unavailable commit fetch reached the model as a marker string and could still yield `VERIFIED`; an HTML fallback page could be judged as a diff. | Raw `.patch` only, must echo the locked SHA and fit 12,000 characters; otherwise `INCONCLUSIVE` with `evidence_code` `COMMIT_UNAVAILABLE`, `COMMIT_UNBOUND` or `COMMIT_TOO_LARGE`. `certify` also requires bound commit evidence. |
| **S3** | Claims implied source-to-artifact verification. | Claims narrowed to what the contract proves (above). Every committed dist hash, not any one, must appear in the registry record. |
| **S4** | Repository input accepted GitLab and Bitbucket, whose commit endpoints were not implemented. | `repository_url` is restricted to `https://github.com/<owner>/<repo>`. |

New tests cover each path, including a planted-bug check: dropping the challenge text from the prompt, or letting an unavailable patch through, fails the suite.

### Second audit

| Bug | Defect | Fix |
|---|---|---|
| **E1** | `gl.storage.copy_to_memory()` was called on plain dicts parsed from JSON strings. The SDK asserts on non-storage values, so `submit_snapshot`, `attest_release` and `open_challenge` reverted. | Detached JSON copies (`json.loads(_dumps(x))`). |
| **E2** | Timestamps used `datetime.now()`. | Integer-only parser of `gl.message_raw["datetime"]`. |
| **E3** | The ordinary-retry limit never fired: each ordinary attempt opens a fresh generation whose count is 0. | Counted per package version. |
| **E4** | `list_packages` was rebuilt from a 300-slot event ring, so older packages disappeared. | Backed by a real `package_index`. |
| **E5** | A registry reply that was valid JSON but not an object crashed `leader_fn`, so consensus could never settle. | Treated as unavailable. |
| **E6** | Dist-hash matching accepted only `key:value`, while the UI says to paste the bare registry value. | Both forms match. |
| **E7** | The consensus result was mutated in place. | Copied before fields are added. |

<br />

## Direct-Mode Tests

Tests use `genlayer-test==0.29.2` from PyPI (confirmed working with the pinned runner). They run in direct mode: every nondet call is mocked via `direct_vm.mock_llm()` and `direct_vm.mock_web()`. The suite executes the real contract and covers every reachable verdict, all guard conditions, validator re-derivation, and the full lifecycle. **82 tests, all passing.**

| Area | Cases |
|---|---|
| Registration | Happy path, every validation guard, duplicate guard, case-normalised keys, package limit |
| Snapshot | Happy path, schema guards, identity mismatches, digest mismatch, registry unavailable, auth failure |
| Attestation | `VERIFIED`, `BLOCKED`, `INCONCLUSIVE`, state and owner guards, ordinary and total retry limits, bare and keyed dist-hash forms, non-object registry reply |
| Challenge | Evidence admitted, irrelevant evidence, owner cannot challenge, window closed, challenge limit |
| Reassess | `VERIFIED` preserved, downgraded to `BLOCKED`, no open challenge |
| Certify / Revoke | Happy path, window still open, challenge open, terminal states, revoke from `CHALLENGED` |
| Views | All `get_*` views, `packages_of` with mixed-case address, `list_packages` past event-ring rollover |
| Validator | Honest leader agrees; tampered digest, findings, route or leader error rejected; pickling check |
| Lifecycle | `DRAFT` → `CERTIFIED`; `DRAFT` → `CHALLENGED` → `VERIFIED` → `CERTIFIED` |

> Direct mode does not prove real-LLM behaviour, real registry responses or multi-node consensus timing. It verifies deterministic paths, guard checks, state transitions, and validator re-derivation logic. The frontend has not been exercised against the live deployment.

### Running the Tests

```bash
pip install -r requirements-dev.txt
pytest
genvm-lint check contracts/packet_proof.py
```

<br />

## Frontend App

### Stack

| Layer | Library |
|---|---|
| Framework | React 18 + TypeScript (Vite 6) |
| Styling | Tailwind CSS v3 |
| Animations | Framer Motion (page transitions + state badge pulses) |
| Icons | Lucide React |
| Wallet | MetaMask / EIP-1193 via `window.ethereum` |
| Chain SDK | `genlayer-js` |
| Fonts | Space Grotesk (headings) · DM Sans (body) · DM Mono (code) |
| Theme | Anime dark: deep space canvas, indigo/violet/cyan glows, frosted glass surfaces |

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Header: PacketProof logo · Contract explorer link · Wallet  │
├────────────────┬────────────────────────┬────────────────────┤
│ PackageList    │  PackageDetailPanel    │  ActivityFeed      │
│ (280 px)       │  flex-1                │  (240 px)          │
│                │                        │                    │
│  · All / Mine  │  · State badge         │  · Event log       │
│  · Search      │  · Register/Snapshot   │  · Live updates    │
│                │  · Attest/Certify      │  · Tx hashes       │
│                │  · Challenge panel     │                    │
└────────────────┴────────────────────────┴────────────────────┘
Mobile: single panel with back navigation
```

<br />

## Quick-Start

```bash
# Clone
git clone https://github.com/Siriron/packetproof
cd packetproof

# Install frontend deps
npm install

# Start dev server -> http://localhost:5173
npm run dev

# Run contract tests (executes the real contract in direct mode)
pip install -r requirements-dev.txt
pytest
```

<br />

## Deploy

### 1. Deploy the Contract

1. Open [studio.genlayer.com](https://studio.genlayer.com)
2. Create a new project, paste the contents of `contracts/packet_proof.py`
3. Click **Deploy**: no constructor arguments needed
4. Copy the deployed contract address from the StudioNet explorer
5. Update `src/config/chains.ts` → `CONTRACT_ADDRESS`

Current deployment:

| Network | Address | Explorer |
|---|---|---|
| StudioNet | `0x1DB3E1D8707878BdA664d03916BBe4937de472bb` | [View](https://explorer-studio.genlayer.com/address/0x1DB3E1D8707878BdA664d03916BBe4937de472bb) |

### 2. Deploy the Frontend

```bash
# Build
npm run build

# Vercel: import the repo (framework: Vite). Netlify: drag the dist/ folder.
# vercel.json SPA rewrite is already configured
```

<br />

## Project Structure

```
packetproof/
├── contracts/
│   └── packet_proof.py       GenLayer intelligent contract
├── tests/direct/             direct-mode tests (118)
├── docs/                     architecture, contracts, deployment, frontend
├── src/                      React/TypeScript frontend
│   ├── App.tsx
│   ├── components/           panels, TxStatus (useTx), badges, background
│   ├── lib/                  genlayer.ts, useGenLayer.ts, types.ts
│   └── config/chains.ts      CONTRACT_ADDRESS + explorer URLs
├── pyproject.toml            pytest config
├── LICENSE                   MIT
└── vercel.json               SPA rewrite rule
```

### Known limitations

- Anyone can register any package name and version first, with no proof they control it on the registry.
- Challenge evidence URLs are supplied by the challenger by design; validators fetch and judge them.
- The registry is capped at 200 package versions.

<br />

---

<div align="center">

Built with **GenLayer** · Intelligent contract runner `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`

PacketProof · No staking · No value transfers · Permanent attestation record

</div>
