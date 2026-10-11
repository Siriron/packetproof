<div align="center">

<img src="./public/favicon.svg" width="88" alt="PacketProof logo" />

# PacketProof

### On-chain release integrity for npm and PyPI packages, verified by independent GenLayer validators.

<br />

![Status](https://img.shields.io/badge/status-contract%20deployed-brightgreen?style=flat-square)
![Network](https://img.shields.io/badge/network-StudioNet-blue?style=flat-square)
![Tests](https://img.shields.io/badge/direct--mode%20tests-82%20passing-brightgreen?style=flat-square)
![Stack](https://img.shields.io/badge/stack-React%20%2B%20Vite%20%2B%20GenVM-7c3aed?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square)

<br />

**[Styled overview](https://htmlpreview.github.io/?https://github.com/Siriron/packetproof/blob/main/README.html)** &nbsp;·&nbsp; **[Documentation](./docs/architecture.md)** &nbsp;·&nbsp; **[Smart Contract](./contracts/packet_proof.py)** &nbsp;·&nbsp; **[Explorer](https://explorer-studio.genlayer.com/address/0xCE109f5c5b75b75Cb23ee95BA778BDC44A91A117)**

</div>

<br />

---

## What this is

A maintainer locks a release intent on-chain before publishing: package name, ecosystem, version and source commit. After publishing, GenLayer validators each fetch the live registry record and the commit diff, then agree on whether the changelog honestly describes the change. The result is a permanent attestation that downstream tools can read, with a challenge window before the release is certified.

<br />

<div align="center">

| | |
|---|---|
| **Concept** | Release integrity attestation with a public challenge window |
| **Consensus need** | A maintainer who controls one registry mirror or one validator could make any release look clean; independent validators must each fetch the same record and diff and agree |
| **Evidence source** | Registry record (npm or PyPI) and the GitHub commit diff, both fetched from URLs derived from the locked identifiers, never supplied by the caller |
| **Network** | StudioNet |

</div>

<br />

---

## How it works

`DRAFT` → `COMMIT_LOCKED` → `VERIFIED` → (review window) → `CERTIFIED`, with `INCONCLUSIVE`, `BLOCKED`, `CHALLENGED` and `REVOKED` as the other states.

1. **`register_package`** locks name, ecosystem, version, commit SHA, repo URL and review window. State: `DRAFT`.
2. **`submit_snapshot`** submits post-publish evidence, authenticated against the live registry by consensus. State: `COMMIT_LOCKED`.
3. **`attest_release`** fetches registry and commit diff across validators and derives the verdict deterministically. State: `VERIFIED`, `INCONCLUSIVE` or `BLOCKED`.
4. **`open_challenge`** lets any non-owner submit evidence during the review window; consensus judges its relevance.
5. **`reassess_challenge`** runs a fresh attestation with the challenge bound in. Anyone can call it.
6. **`certify`** after the window closes with no open challenge; the attestation digest is re-verified on-chain. Terminal.
7. **`revoke`** lets the owner withdraw any non-terminal release, so no state is a dead end.

<br />

<details>
<summary><b>Per-rule verdicts</b></summary>
<br />

Each attestation judges three rules, each answered with one of `PRESERVED`, `CONSISTENT`, `INCONSISTENT`, `MISSING`, `UNREADABLE` or `CONFLICTING`:

| Rule | Question | Blocking if |
|---|---|---|
| `changelog_present` | Is a changelog, release note or commit message present for this version? | `INCONSISTENT` |
| `changelog_honest` | Does the changelog honestly describe the changes in the commit diff? | `INCONSISTENT` |
| `version_consistent` | Is the version bump type consistent with the scope of the diff? | `INCONSISTENT` |

Any `INCONSISTENT` gives `BLOCKED`. Any `MISSING`, `UNREADABLE` or `CONFLICTING`, unavailable evidence, or a registry/dist-hash mismatch gives `INCONCLUSIVE`. All `PRESERVED` or `CONSISTENT` gives `VERIFIED`.

</details>

<br />

---

## Deployed contract

<div align="center">

| Network | Address | Explorer |
|---|---|---|
| StudioNet | `0xCE109f5c5b75b75Cb23ee95BA778BDC44A91A117` | [View](https://explorer-studio.genlayer.com/address/0xCE109f5c5b75b75Cb23ee95BA778BDC44A91A117) |

</div>

<br />

---

## Quick start

```bash
npm install
npm run dev
```

Run the contract tests (they execute the real contract under the GenVM SDK in direct mode):

```bash
pip install -r requirements-dev.txt
pytest
genvm-lint check contracts/packet_proof.py
```

Full deployment instructions: [`docs/deployment.md`](./docs/deployment.md)

<br />

---

## Project structure

```
contracts/packet_proof.py    The GenVM contract
tests/direct/                Direct-mode tests (82)
src/                         React + Vite app
docs/                        architecture.md, deployment.md, contracts.md, frontend.md
README.html                  Styled overview page
LICENSE                      MIT
```

<br />

---

## Status

<div align="center">

![Tested](https://img.shields.io/badge/contract%20logic%20and%20validators-tested-brightgreen?style=flat-square)
![Untested](https://img.shields.io/badge/live%20LLM%20consensus%20and%20frontend-untested-yellow?style=flat-square)

</div>

The direct-mode suite runs the real contract with the web and the LLM mocked. It proves state transitions, guards, retry bounds, the challenge lifecycle, and validator agreement and disagreement on tampered payloads. It does not prove real LLM behaviour, real registry responses, live multi-validator timing, or the frontend against the live deployment.

Known limitations: anyone can register any package name and version first, with no proof they control it on the registry; challenge evidence URLs are supplied by the challenger by design; the registry is capped at 200 package versions.

<br />

---

<div align="center">

Built on [GenLayer](https://genlayer.com) · Runner `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`

</div>
