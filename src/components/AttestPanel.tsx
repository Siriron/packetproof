/**
 * Trigger consensus attestation for a package.
 */
import { motion } from "framer-motion"
import { ShieldCheck, Loader2, AlertCircle, RefreshCw } from "lucide-react"
import { TxStatus, useTx } from "./TxStatus"
import { attestRelease, certifyRelease } from "../lib/genlayer"
import { StatusBadge } from "./StatusBadge"
import type { PackageRecord } from "../lib/types"

interface AttestPanelProps {
  account: string
  pkgKey: string
  packageRecord: PackageRecord
  onDone: () => void
}

function canAttest(state: string) {
  return ["COMMIT_LOCKED", "INCONCLUSIVE", "BLOCKED"].includes(state)
}

function canCertify(pkg: PackageRecord): boolean {
  if (pkg.state !== "VERIFIED") return false
  if (pkg.challenge_open) return false
  const now = Math.floor(Date.now() / 1000)
  return now >= pkg.review_deadline
}

function deadlineLabel(pkg: PackageRecord): string {
  if (!pkg.review_deadline) return ""
  const now = Math.floor(Date.now() / 1000)
  const remaining = pkg.review_deadline - now
  if (remaining <= 0) return "Review window closed"
  const h = Math.floor(remaining / 3600)
  const m = Math.floor((remaining % 3600) / 60)
  const s = remaining % 60
  if (h > 0) return `Review closes in ${h}h ${m}m`
  if (m > 0) return `Review closes in ${m}m ${s}s`
  return `Review closes in ${s}s`
}

export function AttestPanel({ account, pkgKey, packageRecord: pkg, onDone }: AttestPanelProps) {
  const { tx, busy, run, reset } = useTx()

  const isOwner = account.toLowerCase() === pkg.owner?.toLowerCase()

  async function runAttest() {
    if (busy) return
    const res = await run((onHash) => attestRelease(account, pkgKey, onHash))
    if (res) onDone()
  }

  async function runCertify() {
    if (busy) return
    const res = await run((onHash) => certifyRelease(account, pkgKey, onHash))
    if (res) onDone()
  }

  const attempt = pkg.generation ?? 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/8 bg-white/[0.025] backdrop-blur-sm p-5 space-y-4"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-400/30 flex items-center justify-center">
          <ShieldCheck size={15} className="text-violet-300" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white tracking-tight">Attestation</h2>
          <p className="text-[11px] text-slate-500">GenLayer multi-validator consensus</p>
        </div>
        <StatusBadge status={pkg.state} size="sm" />
      </div>

      {/* Status summary */}
      <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 space-y-1 font-mono text-[11px]">
        <div className="flex justify-between">
          <span className="text-slate-600">generation</span>
          <span className="text-slate-300 tabular-nums">{pkg.generation}</span>
        </div>
        {pkg.verified_at > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-600">verified at</span>
            <span className="text-slate-300 tabular-nums">
              {new Date(pkg.verified_at * 1000).toLocaleTimeString()}
            </span>
          </div>
        )}
        {pkg.review_deadline > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-600">review window</span>
            <span className={`tabular-nums ${canCertify(pkg) ? "text-emerald-300" : "text-amber-300"}`}>
              {deadlineLabel(pkg)}
            </span>
          </div>
        )}
        {pkg.challenge_open && (
          <div className="flex items-center gap-1 text-violet-300">
            <AlertCircle size={11} />
            <span>Challenge #{pkg.open_challenge_id} open — resolve before certifying</span>
          </div>
        )}
      </div>

      {!isOwner && (
        <p className="text-[11px] text-amber-300/70 font-mono">
          Connected wallet is not the package owner. Attestation and certify are owner-only.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {canAttest(pkg.state) && isOwner && (
          <button
            onClick={() => { runAttest().catch(() => {}) }}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-violet-500 hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400/40 min-h-[44px]"
          >
            {busy
              ? <><Loader2 size={14} className="animate-spin" />Running consensus...</>
              : <><ShieldCheck size={14} />{attempt > 0 ? "Re-attest Release" : "Attest Release"}</>}
          </button>
        )}

        {pkg.state === "VERIFIED" && isOwner && (
          <button
            onClick={() => { runCertify().catch(() => {}) }}
            disabled={busy || !canCertify(pkg)}
            title={!canCertify(pkg) ? "Review window still open or challenge unresolved" : ""}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400/40 min-h-[44px]"
          >
            {busy
              ? <><Loader2 size={14} className="animate-spin" />Processing...</>
              : <><RefreshCw size={14} />Certify Release</>}
          </button>
        )}
      </div>

      <TxStatus state={tx} onDismiss={reset} />
    </motion.div>
  )
}
