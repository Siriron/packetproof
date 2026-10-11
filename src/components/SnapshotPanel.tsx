/**
 * Submit a pre-captured snapshot for a registered package.
 */
import { useState } from "react"
import { motion } from "framer-motion"
import { DatabaseBackup, Loader2 } from "lucide-react"
import { TxStatus, useTx } from "./TxStatus"
import { submitSnapshot, computeSnapshotDigest } from "../lib/genlayer"
import type { PackageRecord } from "../lib/types"

interface SnapshotPanelProps {
  account: string
  pkgKey: string
  packageRecord: PackageRecord
  onDone: () => void
}

export function SnapshotPanel({ account, pkgKey, packageRecord, onDone }: SnapshotPanelProps) {
  const [changelog, setChangelog] = useState("")
  const [distHash, setDistHash] = useState("")
  const [description, setDescription] = useState("")
  const { tx, busy, run, reset } = useTx()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const snapshot = {
      schema_version: "packetproof.snapshot.v1",
      package_name: packageRecord.package_name,
      ecosystem: packageRecord.ecosystem,
      version: packageRecord.version,
      commit_sha: packageRecord.commit_sha,
      captured_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      dist_hashes: distHash.trim() ? distHash.trim().split(/[\n,]+/).map(h => h.trim()).filter(Boolean) : [],
      description: description.trim() || packageRecord.package_name,
      repository_url: packageRecord.repository_url,
      changelog_excerpt: changelog.trim(),
    }
    const digest = await computeSnapshotDigest(snapshot)
    const res = await run((onHash) => submitSnapshot(account, pkgKey, JSON.stringify(snapshot), digest, onHash))
    if (res) onDone()
  }

  const inputClass =
    "w-full bg-[#090D1E] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-400/60 focus:ring-1 focus:ring-sky-400/20 transition-colors"
  const labelClass = "block text-[11px] font-semibold tracking-widest text-slate-500 uppercase mb-1"

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/8 bg-white/[0.025] backdrop-blur-sm p-5"
    >
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center">
          <DatabaseBackup size={15} className="text-sky-300" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white tracking-tight">Submit Snapshot</h2>
          <p className="text-[11px] text-slate-500">Provide evidence captured after publish</p>
        </div>
      </div>

      {/* Package identity reminder */}
      <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 mb-4 font-mono text-[11px] text-slate-400 space-y-0.5">
        <div><span className="text-slate-600">package </span>{packageRecord.package_name} v{packageRecord.version}</div>
        <div><span className="text-slate-600">commit  </span>{packageRecord.commit_sha.slice(0, 16)}...</div>
        <div><span className="text-slate-600">repo    </span>{packageRecord.repository_url}</div>
      </div>

      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-3">
        <div>
          <label className={labelClass}>Dist hashes (one per line or comma-separated)</label>
          <textarea
            className={inputClass + " resize-none"}
            rows={2}
            value={distHash}
            onChange={e => setDistHash(e.target.value)}
            placeholder={"sha512-AAAAAA...\nshasum or integrity from the registry"}
            required
            disabled={busy}
          />
          <p className="mt-1 text-[10px] text-slate-600">Paste the dist.integrity or dist.shasum value from the registry record (PyPI: a file digest). At least one must match the live registry.</p>
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <input className={inputClass} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Short package description" maxLength={500} disabled={busy} />
        </div>

        <div>
          <label className={labelClass}>Changelog / release notes</label>
          <textarea
            className={inputClass + " resize-none"}
            rows={5}
            value={changelog}
            onChange={e => setChangelog(e.target.value)}
            placeholder={"Paste your CHANGELOG or release notes here.\nMulti-validator consensus will verify these against the commit diff."}
            required
            disabled={busy}
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400/40 min-h-[44px]"
        >
          {busy
            ? <><Loader2 size={14} className="animate-spin" />Processing...</>
            : "Submit Snapshot"}
        </button>
      </form>

      <TxStatus state={tx} onDismiss={reset} />
    </motion.div>
  )
}
