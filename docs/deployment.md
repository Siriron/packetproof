# PacketProof — Deployment Guide

## Prerequisites

- MetaMask or compatible wallet configured for GenLayer StudioNet (chain ID 61999).
- Access to [studio.genlayer.com](https://studio.genlayer.com).

## Deploy the contract

1. Open [studio.genlayer.com](https://studio.genlayer.com).
2. Create a new project and paste the full contents of `contracts/packet_proof.py`.
3. Click **Deploy**. The constructor requires no arguments.
4. Copy the deployed contract address.

## Wire the frontend

Edit `src/config/chains.ts` and replace the placeholder:

```ts
export const CONTRACT_ADDRESS = "0x...your deployed address..."
```

The banner at the top of the app will disappear once this is set to a real address.

## Run the frontend

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in a browser with MetaMask installed.

## Workflow walkthrough

### As a package maintainer

1. Connect wallet in the app.
2. Click **+** (Register) and fill out:
   - Package name (e.g. `acme-utils`)
   - Ecosystem (`npm` or `pypi`)
   - Version (e.g. `1.2.3`)
   - Source commit SHA (40-character hex) — this is the exact commit being released.
   - Repository URL (`https://github.com/org/repo`)
   - Review window in seconds (300–604800; default 3600 = 1 hour).
3. Sign the transaction. State becomes `DRAFT`.
4. After publishing to the registry, return to the app and click the package.
5. Fill out the **Submit Snapshot** form:
   - Dist hashes from the registry record (e.g. `sha512:...` from npm's `dist.integrity`).
   - Package description.
   - Changelog / release notes (paste your full CHANGELOG entry).
6. Sign. State becomes `COMMIT_LOCKED`.
7. Click **Attest Release** to trigger consensus. GenLayer validators independently:
   - Fetch the registry record and verify the dist-hash.
   - Fetch the commit diff and compare to the changelog.
   - Return per-rule verdicts.
8. State becomes `VERIFIED`, `INCONCLUSIVE`, or `BLOCKED`.
9. If `INCONCLUSIVE` or `BLOCKED`, wait for retry window then re-attest (max 3 ordinary attempts).
10. Once `VERIFIED`, wait for the review window to close. **Certify Release** becomes active.
11. Click **Certify Release** to mint the permanent on-chain certification record.

### As a challenger

1. Browse packages in the left column.
2. Select a `VERIFIED` package during the review window.
3. In the **Challenge** panel, paste a publicly accessible URL containing evidence
   (e.g. a GitHub issue, a diff link, a security advisory) relevant to this release.
4. Sign. Validators fetch and judge relevance independently.
5. If evidence is relevant, the challenge is admitted and state becomes `CHALLENGED`.
6. The owner must call **Reassess Challenge** for the package to proceed.

## StudioNet chain details

| Field | Value |
|---|---|
| Chain ID | 61999 (0xF22F) |
| RPC | https://studio.genlayer.com/api |
| Explorer | https://explorer-studio.genlayer.com |
| Currency | GEN |

## Network switching

The app automatically calls `wallet_addEthereumChain` and `wallet_switchEthereumChain` when you connect MetaMask. No manual network configuration required.

## Tests and checks

```bash
pip install -r requirements-dev.txt
pytest                                  # direct-mode tests, execute the real contract under the GenVM SDK
genvm-lint check contracts/packet_proof.py
npm run check && npm run build          # lint + typecheck, then production build
```

### Testing status (what is and is not proven)

- **Proven by the direct-mode suite:** every state transition, owner/state/bounds guard, retry limit, the
  challenge -> reassess -> certify lifecycle, validator agreement and disagreement on tampered leader
  payloads, and that no storage object crosses into a nondet closure (`check_pickling`). The web and the
  LLM are mocked.
- **Not proven:** real LLM behaviour, real registry/GitHub responses, real multi-validator timing, and the
  frontend against a live deployment. No live StudioNet transaction was run during the audit.
