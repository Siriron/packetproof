/**
 * Shared domain types for PacketProof.
 */

// ── Ethereum provider (window.ethereum) ──────────────────────────────────────
export interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
}

export function getEthereum(): EthereumProvider | undefined {
  return (window as { ethereum?: EthereumProvider }).ethereum
}

// ── GenLayer call result ──────────────────────────────────────────────────────
export interface WriteResult {
  hash: string
  receipt: { result?: string } | null
}

// ── Package domain types ──────────────────────────────────────────────────────
export interface PackageRecord {
  pkg_key: string
  package_name: string
  ecosystem: string
  version: string
  commit_sha: string
  repository_url: string
  state: string
  owner: string
  generation: number
  verified_at: number
  review_deadline: number
  challenge_open: boolean
  open_challenge_id: number
}

export interface RuleFinding {
  rule_id: string
  status: string
  reason?: string
}

export interface AttestationRecord {
  generation: number
  attempt: number
  attempt_kind: string
  route_result: string
  registry_match: boolean
  dist_hash_match: boolean
  evidence_available: boolean
  registry_record_digest: string
  locked_snapshot_digest: string
  attestation_digest: string
  findings: RuleFinding[]
  challenge?: ChallengeInfo
}

export interface ChallengeInfo {
  id: number
  challenger: string
  evidence_url: string
  evidence_digest: string
  resolved: boolean
  route_result?: string
}

export interface CertificationRecord {
  pkg_key: string
  package_name: string
  ecosystem: string
  version: string
  commit_sha: string
  generation: number
  attestation_digest: string
  evidence_root: string
  certified_at: number
  certification_digest: string
}

export interface ContractEvent {
  index: number
  kind: string
  pkg_key: string
  data: Record<string, unknown>
}
