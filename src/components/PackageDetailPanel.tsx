/**
 * Full detail view for a selected package — shows current state, attestation, cert, actions.
 */
import { useState, useEffect, useCallback, useRef } from "react"
import { motion } from "framer-motion"
import { RefreshCw, RotateCcw } from "lucide-react"
import { StatusBadge } from "./StatusBadge"
import { SnapshotPanel } from "./SnapshotPanel"
import { AttestPanel } from "./AttestPanel"
import { ChallengePanel } from "./ChallengePanel"
import { AttestationDetail, CertificationBanner } from "./AttestationDetail"
import { getPackage, getAttestation, getCertification, getChallenge, revokeRelease } from "../lib/genlayer"
import { TxStatus, useTx } from "./TxStatus"
import type { PackageRecord, AttestationRecord, CertificationRecord, ChallengeInfo } from "../lib/types"

interface PackageDetailPanelProps {
  pkgKey: string
  account: string | null
}

export function PackageDetailPanel({ pkgKey, account }: PackageDetailPanelProps) {
  const [pkg, setPkg] = useState<PackageRecord | null>(null)
  const [attestation, setAttestation] = useState<AttestationRecord | null>(null)
  const [cert, setCert] = useState<CertificationRecord | null>(null)
  const [challenge, setChallenge] = useState<ChallengeInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { tx: revokeTx, busy: revokeBusy, run: runRevoke, reset: resetRevoke } = useTx()
  const loadingRef = useRef(false)

  const load = useCallback(() => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError(null)
    getPackage(pkgKey)
      .then(async (p) => {
        setPkg(p)
        if (p.generation > 0) {
          const a = await getAttestation(pkgKey, p.generation)
          setAttestation(a)
        }
        const [c, ch] = await Promise.all([
          getCertification(pkgKey),
          getChallenge(pkgKey),
        ])
        setCert(c)
        setChallenge(ch)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load package"))
      .finally(() => {
        loadingRef.current = false
        setLoading(false)
      })
  }, [pkgKey])

  useEffect(() => {
    load()
  }, [load])

  async function handleRevoke() {
    if (!account || !pkg || revokeBusy) return
    const res = await runRevoke((onHash) => revokeRelease(account, pkgKey, onHash))
    if (res) load()
  }

  const isOwner = account != null && pkg != null && account.toLowerCase() === pkg.owner?.toLowerCase()

  if (loading && !pkg) {
    return (
      <div className="flex items-center justify-center h-32">
        <RefreshCw size={18} className="text-slate-600 animate-spin" />
      </div>
    )
  }

  if (!pkg) {
    return (
      <div className="rounded-xl border border-rose-400/20 bg-rose-500/5 px-4 py-6 text-center font-mono">
        <p className="text-[11px] text-rose-300 break-words">{error ?? "Package not found"}</p>
        <button onClick={load} className="mt-2 text-[11px] text-slate-400 hover:text-white underline">Retry</button>
      </div>
    )
  }

  const showSnapshot = pkg.state === "DRAFT"
  const showAttest = ["COMMIT_LOCKED", "INCONCLUSIVE", "BLOCKED", "VERIFIED"].includes(pkg.state) && isOwner
  const showChallenge = (pkg.state === "VERIFIED" || pkg.state === "CHALLENGED") && account != null
  const isCertified = pkg.state === "CERTIFIED"
  const isRevoked = pkg.state === "REVOKED"

  return (
    <motion.div
      key={pkgKey}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-white tracking-tight font-mono">
            {pkg.package_name}
          </h1>
          <p className="text-[11px] text-slate-500 font-mono">{pkg.pkg_key}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={pkg.state} size="md" />
          <button
            onClick={load}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-slate-500 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Identity */}
      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3 font-mono text-[11px] space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-600">ecosystem</span>
          <span className="text-slate-300">{pkg.ecosystem}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">version</span>
          <span className="text-slate-300">{pkg.version}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">commit</span>
          <span className="text-slate-300">{pkg.commit_sha?.slice(0, 20)}...</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">owner</span>
          <span className="text-slate-300">{pkg.owner?.slice(0, 12)}...</span>
        </div>
      </div>

      {/* Certification banner */}
      {isCertified && cert && <CertificationBanner cert={cert} />}

      {/* Revoked state */}
      {isRevoked && (
        <div className="rounded-xl border border-rose-400/20 bg-rose-500/5 px-3 py-2 text-[11px] font-mono text-rose-400">
          This release was revoked by the owner.
        </div>
      )}

      {/* Snapshot submission */}
      {showSnapshot && account && isOwner && (
        <SnapshotPanel account={account} pkgKey={pkgKey} packageRecord={pkg} onDone={load} />
      )}

      {/* Attestation + certify */}
      {showAttest && account && (
        <AttestPanel account={account} pkgKey={pkgKey} packageRecord={pkg} onDone={load} />
      )}

      {/* Latest attestation record */}
      {attestation && Object.keys(attestation).length > 0 && (
        <AttestationDetail attestation={attestation} />
      )}

      {/* Challenge panel */}
      {showChallenge && account && (
        <ChallengePanel
          account={account}
          pkgKey={pkgKey}
          packageRecord={pkg}
          activeChallenge={challenge}
          onDone={load}
        />
      )}

      {/* Revoke */}
      {isOwner && !["CERTIFIED", "REVOKED"].includes(pkg.state) && (
        <div className="pt-2">
          <button
            onClick={() => { void handleRevoke() }}
            disabled={revokeBusy}
            className="flex items-center gap-1.5 text-[11px] text-rose-400/60 hover:text-rose-400 transition-colors font-mono disabled:opacity-40"
          >
            <RotateCcw size={11} />
            Revoke release
          </button>
          <TxStatus state={revokeTx} onDismiss={resetRevoke} />
        </div>
      )}
    </motion.div>
  )
}
