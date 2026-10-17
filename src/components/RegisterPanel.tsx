/**
 * Register a new package release intent.
 */
import { useState } from "react"
import { motion } from "framer-motion"
import { Package, Loader2 } from "lucide-react"
import { TxStatus, useTx } from "./TxStatus"
import { registerPackage } from "../lib/genlayer"

interface RegisterPanelProps {
  account: string
  onRegistered: (pkgKey: string) => void
}

export function RegisterPanel({ account, onRegistered }: RegisterPanelProps) {
  const [name, setName] = useState("")
  const [eco, setEco] = useState("npm")
  const [version, setVersion] = useState("")
  const [sha, setSha] = useState("")
  const [repo, setRepo] = useState("")
  const [window_, setWindow] = useState("3600")
  const { tx, busy, run, reset } = useTx()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const res = await run((onHash) => registerPackage(
      account, name.trim(), eco, version.trim(), sha.trim().toLowerCase(), repo.trim(), Number(window_), onHash,
    ))
    if (res) {
      // Same derivation as the contract's _pkg_key (name lowercased)
      onRegistered(`${eco}:${name.trim().toLowerCase()}:${version.trim()}`)
    }
  }

  const inputClass =
    "w-full bg-[#090D1E] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-400/20 transition-colors"

  const labelClass = "block text-[11px] font-semibold tracking-widest text-slate-500 uppercase mb-1"

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/8 bg-white/[0.025] backdrop-blur-sm p-5"
    >
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
          <Package size={15} className="text-indigo-300" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white tracking-tight">Register Release Intent</h2>
          <p className="text-[11px] text-slate-500">Lock identifiers before publish</p>
        </div>
      </div>

      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className={labelClass}>Package name</label>
            <input className={inputClass} value={name} onChange={e => setName(e.target.value)}
              placeholder="acme-utils" required disabled={busy} />
          </div>
          <div>
            <label className={labelClass}>Ecosystem</label>
            <select
              className={inputClass + " cursor-pointer"}
              value={eco} onChange={e => setEco(e.target.value)} disabled={busy}
            >
              <option value="npm">npm</option>
              <option value="pypi">pypi</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Version</label>
            <input className={inputClass} value={version} onChange={e => setVersion(e.target.value)}
              placeholder="1.2.3" required disabled={busy} />
          </div>
          <div>
            <label className={labelClass}>Review window (sec)</label>
            <input className={inputClass} value={window_} onChange={e => setWindow(e.target.value)}
              placeholder="3600" type="number" min="300" max="604800" required disabled={busy} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Source commit SHA</label>
          <input className={inputClass} value={sha} onChange={e => setSha(e.target.value)}
            placeholder={"a".repeat(40)} maxLength={40} required disabled={busy} />
        </div>

        <div>
          <label className={labelClass}>Repository URL</label>
          <input className={inputClass} value={repo} onChange={e => setRepo(e.target.value)}
            placeholder="https://github.com/owner/repo (GitHub only)" pattern="https://github\.com/[A-Za-z0-9][A-Za-z0-9\-]{0,38}/[A-Za-z0-9_.\-]{1,100}" title="GitHub repository URL: https://github.com/owner/repo (no .git, trailing slash or extra path)" maxLength={200} required disabled={busy} />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400/40 min-h-[44px]"
        >
          {busy
            ? <><Loader2 size={14} className="animate-spin" />Processing...</>
            : "Register Intent"}
        </button>
      </form>

      <TxStatus state={tx} onDismiss={reset} />
    </motion.div>
  )
}
