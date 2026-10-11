# PacketProof — Frontend Reference

## Stack

| Layer | Library |
|-------|---------|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | Tailwind CSS v3 |
| Animations | Framer Motion |
| Icons | Lucide React |
| Wallet | MetaMask / EIP-1193 via `window.ethereum` |
| Chain SDK | `genlayer-js@1.1.8` |
| Fonts | Space Grotesk (headings), DM Sans (body), DM Mono (mono) |

---

## Layout

Three-column desktop layout; single-panel mobile with back navigation.

```
┌──────────────────────────────────────────────────────────┐
│  Header: Logo · Contract link · Wallet button            │
├───────────────┬──────────────────────┬───────────────────┤
│ PackageList   │  PackageDetailPanel  │  ActivityFeed     │
│ (280 px)      │  (flex-1)            │  (240 px)         │
└───────────────┴──────────────────────┴───────────────────┘
```

On mobile: `PackageListPanel` shows first; tapping a row navigates to
`PackageDetailPanel` with a back button; `ActivityFeed` is hidden.

---

## Source Structure

```
src/
  App.tsx                   # Composition root, wallet button, layout
  components/
    AnimeBackground.tsx     # Floating particles + scanline grid canvas
    PackageListPanel.tsx    # All / Mine package list; Register form
    PackageDetailPanel.tsx  # State machine view; Snapshot/Attest/Certify/Revoke actions
    AttestationDetail.tsx   # Per-generation attestation record display
    ChallengePanel.tsx      # Open/view/reassess challenge
    ActivityFeed.tsx        # Live event log (newest 20, polls every 12s)
    TxStatus.tsx            # Tx banner + useTx hook (signing -> confirming -> success | error)
  lib/
    genlayer.ts             # All contract calls (readView, sendWrite, waitForTx)
    useGenLayer.ts          # Wallet connection hook (EIP-1193)
    types.ts                # TypeScript interfaces for all domain types
  config/
    chains.ts               # CONTRACT_ADDRESS, STUDIONET config, explorer URL helpers
```

---

## Configuration

Update `src/config/chains.ts` after deploying the contract:

```ts
export const CONTRACT_ADDRESS: string = "0xYourDeployedAddress"
```

Leave it at the zero address to see the "Contract not deployed" banner.

---

## Wallet Connection

The app connects to any EIP-1193 wallet (MetaMask, etc.) via `useGenLayer`.
On mount it silently checks `eth_accounts` (no popup). On button click it
calls `eth_requestAccounts`.

The GenLayer StudioNet chain config is in `src/config/chains.ts`:

```ts
export const STUDIONET = {
  chainId: "0xF22F",      // 61999
  rpcUrls: ["https://studio.genlayer.com/api"],
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
}
```

---

## Contract Calls

`src/lib/genlayer.ts` wraps `genlayer-js` with typed helpers:

```ts
// Read a view (no wallet needed)
readView(method: string, args: unknown[]): Promise<unknown>

// Send a write (requires connected wallet)
sendWrite(account: string, method: string, args: unknown[]): Promise<WriteResult>

// Wait for a transaction to reach a terminal state
waitForTx(hash: string): Promise<{ result?: string } | null>
```

**Digest computation:** `computeSnapshotDigest(snap)` in `genlayer.ts` produces
`SHA-256(json.dumps(snap, sort_keys=True, separators=(",",":"))`), byte-exactly
matching the contract's `_digest()` function.

---

## Key UI Flows

### Register a package

1. Connect wallet.
2. Click "Register Release" in `PackageListPanel`.
3. Fill in: package name, ecosystem, version, commit SHA, repo URL, review window.
4. Submit → `register_package()` → package appears in list as `DRAFT`.

### Submit a snapshot

1. Select a `DRAFT` package.
2. Build the snapshot JSON matching `packetproof.snapshot.v1`.
3. Paste it into the snapshot field; the frontend computes the digest.
4. Submit → `submit_snapshot()` → transitions to `COMMIT_LOCKED`.

### Attest a release

1. Select a `COMMIT_LOCKED`, `INCONCLUSIVE`, or `BLOCKED` package.
2. Click "Run Attestation" → `attest_release()`.
3. GenLayer consensus fetches the registry + commit diff; returns verdict.
4. Package transitions to `VERIFIED`, `INCONCLUSIVE`, or `BLOCKED`.

### Certify

1. Select a `VERIFIED` package after the review window closes.
2. Click "Certify" → `certify()` → transitions to `CERTIFIED`.
3. The certification digest is displayed and stored permanently.

### Challenge

1. Any non-owner may challenge a `VERIFIED` package during the window.
2. Provide an evidence URL; consensus verifies relevance.
3. Package moves to `CHALLENGED`; owner calls "Reassess" to resolve.

---

## Design Tokens

The app uses an "anime dark" aesthetic:

| Token | Value |
|-------|-------|
| Background | `#060914` (deep space) |
| Accent primary | `indigo-400` / `violet-400` |
| Accent secondary | `cyan-400` |
| Success | `emerald-400` |
| Warning | `amber-400` |
| Error | `rose-400` |
| Glass surface | `bg-white/[0.04]` + `border-white/[0.07]` + `backdrop-blur-md` |
| Mono font | DM Mono |

---

## Running Locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The app hot-reloads on save.

**Lint and typecheck:**

```bash
npm run check
```

---

## Deployment

### Static hosting (Netlify, HF Spaces)

```bash
npm run build
# dist/ is the output; configure SPA rewrite to index.html
```

`vercel.json` at the project root configures the SPA rewrite for Vercel.

For Netlify, add a `_redirects` file in `public/`:
```
/*  /index.html  200
```

### Environment variables

No server-side env vars are needed. Contract address and chain config
are in `src/config/chains.ts`. All chain interaction is client-side.
