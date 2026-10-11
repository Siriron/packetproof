/**
 * Challenge a VERIFIED release (non-owner only) and show challenge history.
 */
import { useState } from "react"
import { motion } from "framer-motion"
import { Swords, Loader2, CheckCircle2 } from "lucide-react"
import { TxStatus, useTx } from "./TxStatus"
import { openChallenge, reassessChallenge } from "../lib/genlayer"
import { StatusBadge } from "./StatusBadge"
import type { PackageRecord, ChallengeInfo } from "../lib/types"

interface ChallengePanelProps {
  account: string
  pkgKey: string
  packageRecord: PackageRecord
  activeChallenge: ChallengeInfo | null
  onDone: () => void
}

export function ChallengePanel({
  account, pkgKey, packageRecord: pkg, activeChallenge, onDone
}: ChallengePanelProps) {
  const [evidenceUrl, setEvidenceUrl] = useState("")
  const { tx, busy, run, reset } = useTx()

  const isOwner = account.toLowerCase() === pkg.owner?.toLowerCase()
  const canChallenge = pkg.state === "VERIFIED" && !pkg.challenge_open && !isOwner
  const canReassess = pkg.state === "CHALLENGED" && pkg.challenge_open

  async function handleChallenge(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const res = await run((onHash) => openChallenge(account, pkgKey, evidenceUrl.trim(), onHash))
    if (res) {
      setEvidenceUrl("")
      onDone()
    }
  }

  async function handleReassess() {
    if (busy) return
    const res = await run((onHash) => reassessChallenge(account, pkgKey, onHash))
    if (res) onDone()
  }

  const inputClass =
    "w-full bg-[#090D1E] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-400/60 focus:ring-1 focus:ring-violet-400/20 transition-colors"
  const labelClass = "block text-[11px] font-semibold tracking-widest text-slate-500 uppercase mb-1"

  if (!canChallenge && !canReassess && !activeChallenge) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/8 bg-white/[0.025] backdrop-blur-sm p-5 space-y-4"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-400/30 flex items-center justify-center">
          <Swords size={15} className="text-rose-300" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white tracking-tight">Challenge</h2>
          <p className="text-[11px] text-slate-500">Dispute a verified release</p>
        </div>
      </div>

      {/* Active challenge info */}
      {activeChallenge && Object.keys(activeChallenge).length > 0 && (
        <div className="rounded-lg border border-violet-400/20 bg-violet-500/5 px-3 py-2.5 space-y-1.5 font-mono text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-violet-300 font-semibold">Challenge #{activeChallenge.id}</span>
            {activeChallenge.resolved
              ? <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 size={11} />Resolved</span>
              : <StatusBadge status="CHALLENGED" size="sm" />}
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">challenger</span>
            <span className="text-slate-400">{activeChallenge.challenger?.slice(0, 10)}...</span>
          </div>
          {activeChallenge.evidence_digest && (
            <div className="flex justify-between">
              <span className="text-slate-600">evidence digest</span>
              <span className="text-slate-400">{activeChallenge.evidence_digest.slice(0, 12)}...</span>
            </div>
          )}
          {activeChallenge.resolved && activeChallenge.route_result && (
            <div className="flex justify-between">
              <span className="text-slate-600">result</span>
              <StatusBadge status={activeChallenge.route_result} size="sm" />
            </div>
          )}
        </div>
      )}

      {/* Open new challenge */}
      {canChallenge && (
        <form onSubmit={(e) => { void handleChallenge(e) }} className="space-y-3">
          <div>
            <label className={labelClass}>Evidence URL (publicly accessible)</label>
            <input
              className={inputClass}
              type="url"
              value={evidenceUrl}
              onChange={e => setEvidenceUrl(e.target.value)}
              placeholder="https://..."
              required
              disabled={busy}
            />
            <p className="mt-1 text-[10px] text-slate-600">
              Must be directly relevant to this release (dist-hash, changelog, or integrity issue).
              Validators independently fetch and judge relevance — irrelevant evidence is rejected without consuming your attempt.
            </p>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-rose-500 hover:bg-rose-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-400/40 min-h-[44px]"
          >
            {busy
              ? <><Loader2 size={14} className="animate-spin" />Submitting challenge...</>
              : <><Swords size={14} />Open Challenge</>}
          </button>
        </form>
      )}

      {/* Reassess open challenge */}
      {canReassess && (
        <div className="space-y-3">
          <p className="text-[11px] text-slate-400 font-mono">
            An open challenge requires a fresh consensus attestation including the challenge evidence.
          </p>
          <button
            onClick={() => { handleReassess().catch(() => {}) }}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-violet-500 hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400/40 min-h-[44px]"
          >
            {busy
              ? <><Loader2 size={14} className="animate-spin" />Running consensus...</>
              : "Reassess Challenge"}
          </button>
        </div>
      )}

      <TxStatus state={tx} onDismiss={reset} />
    </motion.div>
  )
}
