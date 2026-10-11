/**
 * GenLayer SDK wrapper for PacketProof.
 * Uses confirmed genlayer-js subpaths: root, /chains, /types only.
 * account = plain wallet address string (never createAccount()).
 * ensureChain() before every write.
 */
import { createClient } from "genlayer-js"
import { studionet } from "genlayer-js/chains"
import { TransactionStatus } from "genlayer-js/types"
import { STUDIONET, CONTRACT_ADDRESS, EXPLORER_TX, isDeployed } from "../config/chains"
import { getEthereum } from "./types"
import type { PackageRecord, AttestationRecord, CertificationRecord, ChallengeInfo, ContractEvent, WriteResult } from "./types"

// CalldataEncodable is the arg array element type for genlayer-js write/read calls.
// It is not directly exported from the root; use Parameters to derive it.
type _GlClient = ReturnType<typeof createClient>
type _ReadParams = Parameters<_GlClient["readContract"]>[0]
type CalldataEncodable = NonNullable<_ReadParams["args"]>[number]

export { TransactionStatus }
export type { PackageRecord, AttestationRecord, CertificationRecord, ChallengeInfo, ContractEvent, WriteResult }

export async function ensureChain(): Promise<void> {
  const eth = getEthereum()
  if (!eth) return
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIONET.chainId }],
    })
  } catch (err: unknown) {
    const e = err as { code?: number }
    if (e?.code === 4902) {
      await eth.request({ method: "wallet_addEthereumChain", params: [STUDIONET] })
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: STUDIONET.chainId }],
      })
    } else if (e?.code === -32002) {
      await new Promise((r) => setTimeout(r, 3000))
    } else {
      throw err
    }
  }
}

export function makeReadClient() {
  return createClient({ chain: studionet })
}

type _ClientConfig = NonNullable<Parameters<typeof createClient>[0]>
type _GlEthereumProvider = NonNullable<_ClientConfig["provider"]>

export function makeWriteClient(account: string) {
  const eth = getEthereum()
  const client = createClient({
    chain: studionet,
    account: account as `0x${string}`,
    provider: eth,
  })
  // genlayer-js internal — connect() may not exist on all versions
  const c = client as { connect?: (n: string) => Promise<void> }
  if (typeof c.connect === "function") {
    c.connect("studionet").catch(() => {})
  }
  return client
}

export class TimeoutError extends Error {
  txHash: string
  isTimeout = true
  constructor(hash: string) {
    super(
      `Consensus is still running. Your transaction was submitted — check: ${EXPLORER_TX(hash)}`
    )
    this.txHash = hash
  }
}

type _WaitParams = Parameters<_GlClient["waitForTransactionReceipt"]>[0]
type _HashType = _WaitParams["hash"]

export async function waitForTx(client: ReturnType<typeof createClient>, hash: string): Promise<{ result?: string }> {
  try {
    return await client.waitForTransactionReceipt({
      hash: hash as _HashType,
      status: TransactionStatus.ACCEPTED,
      retries: 120,
      interval: 4000,
    }) as { result?: string }
  } catch (e: unknown) {
    // Only a polling timeout means "still running". Any other failure is a real
    // error and must not be reported as a timeout; keep the hash so the UI can link it.
    const message = e instanceof Error ? e.message : String(e)
    if (/time ?out|timed out|retries|not (yet )?(found|mined|accepted)/i.test(message)) {
      throw new TimeoutError(hash)
    }
    throw Object.assign(e instanceof Error ? e : new Error(message), { txHash: hash })
  }
}

// ── Arg builder ───────────────────────────────────────────────────────────────
function toArgs(...vals: (string | number | boolean | null)[]): CalldataEncodable[] {
  return vals
}

// ── Read helpers ──────────────────────────────────────────────────────────────

async function readView(method: string, args: CalldataEncodable[]): Promise<unknown> {
  if (!isDeployed()) throw new Error("Contract address is not configured")
  const client = makeReadClient()
  const raw = await client.readContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: method,
    args,
  })
  if (typeof raw === "string") return JSON.parse(raw) as unknown
  return raw
}

export async function getStats(): Promise<{ packages: number; events_total: number; events_retained: number }> {
  return readView("get_stats", []) as Promise<{ packages: number; events_total: number; events_retained: number }>
}

export async function getPackage(pkgKey: string): Promise<PackageRecord> {
  return readView("get_package", toArgs(pkgKey)) as Promise<PackageRecord>
}

export async function getAttestation(pkgKey: string, generation: number): Promise<AttestationRecord> {
  return readView("get_attestation", toArgs(pkgKey, generation)) as Promise<AttestationRecord>
}

export async function getCertification(pkgKey: string): Promise<CertificationRecord> {
  return readView("get_certification", toArgs(pkgKey)) as Promise<CertificationRecord>
}

export async function getChallenge(pkgKey: string): Promise<ChallengeInfo> {
  return readView("get_challenge", toArgs(pkgKey)) as Promise<ChallengeInfo>
}

export async function getEvents(offset = 0, limit = 20): Promise<ContractEvent[]> {
  return readView("get_events", toArgs(offset, limit)) as Promise<ContractEvent[]>
}

export async function packagesOf(address: string, offset = 0, limit = 20): Promise<string[]> {
  return readView("packages_of", toArgs(address, offset, limit)) as Promise<string[]>
}

export async function listPackages(offset = 0, limit = 20): Promise<string[]> {
  return readView("list_packages", toArgs(offset, limit)) as Promise<string[]>
}

// ── Write helpers ─────────────────────────────────────────────────────────────

export type OnHash = (hash: string) => void

async function sendWrite(
  account: string,
  method: string,
  args: CalldataEncodable[],
  onHash?: OnHash
): Promise<WriteResult> {
  if (!isDeployed()) throw new Error("Contract address is not configured")
  await ensureChain()
  const client = makeWriteClient(account)
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: method,
    args,
    value: BigInt(0),
  }) as string
  onHash?.(hash)
  const receipt = await waitForTx(client, hash)
  return { hash, receipt }
}

export async function registerPackage(
  account: string,
  packageName: string,
  ecosystem: string,
  version: string,
  commitSha: string,
  repositoryUrl: string,
  reviewWindowSeconds: number,
  onHash?: OnHash
): Promise<WriteResult> {
  return sendWrite(account, "register_package", toArgs(
    packageName, ecosystem, version, commitSha, repositoryUrl, reviewWindowSeconds
  ), onHash)
}

export async function submitSnapshot(
  account: string,
  pkgKey: string,
  snapshotJson: string,
  expectedDigest: string,
  onHash?: OnHash
): Promise<WriteResult> {
  return sendWrite(account, "submit_snapshot", toArgs(pkgKey, snapshotJson, expectedDigest), onHash)
}

export async function attestRelease(account: string, pkgKey: string, onHash?: OnHash): Promise<WriteResult> {
  return sendWrite(account, "attest_release", toArgs(pkgKey), onHash)
}

export async function openChallenge(account: string, pkgKey: string, evidenceUrl: string, onHash?: OnHash): Promise<WriteResult> {
  return sendWrite(account, "open_challenge", toArgs(pkgKey, evidenceUrl), onHash)
}

export async function reassessChallenge(account: string, pkgKey: string, onHash?: OnHash): Promise<WriteResult> {
  return sendWrite(account, "reassess_challenge", toArgs(pkgKey), onHash)
}

export async function certifyRelease(account: string, pkgKey: string, onHash?: OnHash): Promise<WriteResult> {
  return sendWrite(account, "certify", toArgs(pkgKey), onHash)
}

export async function revokeRelease(account: string, pkgKey: string, onHash?: OnHash): Promise<WriteResult> {
  return sendWrite(account, "revoke", toArgs(pkgKey), onHash)
}

// ── Snapshot digest helper ────────────────────────────────────────────────────
// Produces SHA-256 of canonical JSON matching Python:
//   json.dumps(v, sort_keys=True, separators=(",",":"), ensure_ascii=False)
// The contract uses _dumps() which is exactly that call.
function _canonicalize(val: unknown): string {
  if (val === null) return "null"
  if (typeof val === "boolean") return val ? "true" : "false"
  if (typeof val === "number") {
    return Number.isInteger(val) ? val.toString() : JSON.stringify(val)
  }
  if (typeof val === "string") {
    return JSON.stringify(val)
  }
  if (Array.isArray(val)) {
    return "[" + val.map(_canonicalize).join(",") + "]"
  }
  if (typeof val === "object" && val !== null) {
    const sorted = Object.keys(val).sort()
    return "{" + sorted.map((k) =>
      JSON.stringify(k) + ":" + _canonicalize((val as Record<string, unknown>)[k])
    ).join(",") + "}"
  }
  return JSON.stringify(val)
}

export async function computeSnapshotDigest(snapshot: object): Promise<string> {
  const canon = _canonicalize(snapshot)
  const enc = new TextEncoder().encode(canon)
  const buf = await crypto.subtle.digest("SHA-256", enc)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
