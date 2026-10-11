# PacketProof

**On-chain package release integrity attestation on GenLayer.**

PacketProof is a supply-chain security protocol that uses GenLayer's multi-validator intelligent contract consensus to independently verify every package release. Before a package reaches downstream consumers, multiple independent validators fetch the registry record and source commit, judge whether the changelog is honest, and produce a cryptographic attestation record — without any single party being able to fake it.

## What it does

1. A maintainer **locks a release intent** on-chain before publishing (package name, version, commit SHA, repository URL).
2. After publishing, they **submit a snapshot** with the dist-hash and changelog.
3. **Multi-validator consensus** independently fetches the npm/PyPI registry and the commit diff, then judges three rules:
   - Is a changelog present?
   - Does the changelog honestly describe the diff?
   - Is the version bump consistent with the scope of changes?
4. The contract deterministically derives `VERIFIED`, `INCONCLUSIVE`, or `BLOCKED`.
5. Any wallet can **challenge** a verified release with evidence during the review window.
6. After the review window, the owner can **certify** — producing a permanent on-chain attestation record.

## State machine

```
DRAFT → COMMIT_LOCKED → VERIFIED | INCONCLUSIVE | BLOCKED → CERTIFIED
                                ↓
                           CHALLENGED (open challenge)
```

## Tech stack

| Layer | Technology |
|---|---|
| Intelligent contract | GenLayer Python contract (StudioNet chain 61999) |
| Consensus | GenLayer multi-validator nondet with per-rule findings |
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS + Framer Motion |
| Wallet | MetaMask (EIP-1193) via `genlayer-js` |
| Fonts | Space Grotesk + DM Sans + DM Mono (Google Fonts) |

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Connect MetaMask; the app prompts you to add/switch to GenLayer StudioNet.

## Deployed contract

| Network | Address | Explorer |
|---|---|---|
| StudioNet | `0xCE109f5c5b75b75Cb23ee95BA778BDC44A91A117` | [View](https://explorer-studio.genlayer.com/address/0xCE109f5c5b75b75Cb23ee95BA778BDC44A91A117) |

## Deploy the contract

1. Paste `contracts/packet_proof.py` into [studio.genlayer.com](https://studio.genlayer.com) and deploy.
2. Set `CONTRACT_ADDRESS` in `src/config/chains.ts` (a single plain constant; currently the StudioNet address above).

Full guide: `docs/deployment.md`.

## Checks

```bash
pip install -r requirements-dev.txt
pytest                                      # 82 direct-mode tests against the real contract
genvm-lint check contracts/packet_proof.py
npm run check && npm run build
```

## Testing status

The direct-mode suite executes the real contract under the GenVM SDK with the web and the LLM mocked. It
proves state transitions, guards, retry bounds, the challenge lifecycle and validator agreement/disagreement.
It does **not** prove real LLM behaviour, real registry responses, or live multi-validator consensus, and
no live StudioNet run was performed for this audit.

## Known limitations

- Anyone can register any package name/version (first come, first served); there is no proof the registrant
  controls the package on the registry. Attestation says the release is internally consistent, not who the
  maintainer is.
- Challenge evidence URLs are supplied by the challenger by design; validators fetch and judge them.
- The registry is capped at 200 package versions.

## Project structure

```
contracts/packet_proof.py     GenLayer intelligent contract
tests/direct/                 direct-mode tests
docs/                         architecture, contracts, deployment, frontend
src/                          React + Vite frontend (App, components/, lib/, config/)
LICENSE                       MIT
```

## Security properties

- Registry fetch URL is derived from locked identifiers; the caller never supplies a URL.
- The fetched record must echo the expected package name and version before it influences the verdict.
- No owner bypass: cannot force-verify, force-certify, or replace a frozen snapshot.
- Time comes from the transaction (`gl.message_raw["datetime"]`); no caller-supplied timestamp.
- At most 3 challenges per generation; at most 3 ordinary attestations per package version.
- All external content is labelled untrusted and sanitised before it reaches a prompt.

## License

MIT, see `LICENSE`.
