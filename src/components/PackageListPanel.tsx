/**
 * Left-column package list. "All" shows every registered release (so any wallet can
 * find one to challenge); "Mine" shows the connected wallet's own releases.
 */
import { useState, useEffect, useCallback, useRef } from "react"
import { RefreshCw, Plus, Search } from "lucide-react"
import { PacketCard } from "./PacketCard"
import { getPackage, packagesOf, listPackages } from "../lib/genlayer"
import { isDeployed } from "../config/chains"
import { RegisterPanel } from "./RegisterPanel"
import { motion, AnimatePresence } from "framer-motion"
import type { PackageRecord } from "../lib/types"

interface PackageListPanelProps {
  account: string | null
  selectedKey: string | null
  onSelect: (key: string) => void
}

export function PackageListPanel({ account, selectedKey, onSelect }: PackageListPanelProps) {
  const [packages, setPackages] = useState<PackageRecord[]>([])
  const [loading, setLoading] = useState(isDeployed())
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<"all" | "mine">("all")
  const [showRegister, setShowRegister] = useState(false)
  const [query, setQuery] = useState("")
  const loadingRef = useRef(false)

  const effectiveScope = account ? scope : "all"

  const load = useCallback(() => {
    if (!isDeployed() || loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError(null)
    const fetchKeys = effectiveScope === "mine" && account
      ? packagesOf(account, 0, 50)
      : listPackages(0, 50)
    fetchKeys
      .then((keys) => {
        const k = Array.isArray(keys) ? keys : []
        return Promise.all(k.map((key) => getPackage(key).catch(() => null)))
      })
      .then((records) => {
        setPackages(records.filter((r): r is PackageRecord => r !== null))
      })
      .catch((e: unknown) => {
        setPackages([])
        setError(e instanceof Error ? e.message : "Could not load packages")
      })
      .finally(() => {
        loadingRef.current = false
        setLoading(false)
      })
  }, [account, effectiveScope])

  useEffect(() => {
    load()
  }, [load])

  function handleRegistered(pkgKey: string) {
    setShowRegister(false)
    load()
    onSelect(pkgKey)
  }

  const filtered = query
    ? packages.filter(p =>
        p.package_name?.toLowerCase().includes(query.toLowerCase()) ||
        p.version?.includes(query) ||
        p.ecosystem?.includes(query)
      )
    : packages

  return (
    <div className="flex flex-col gap-3 min-h-0">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">
          {effectiveScope === "mine" ? "My Packages" : "All Packages"}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={load}
            className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:text-slate-300 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          </button>
          {account && (
            <button
              onClick={() => setShowRegister(v => !v)}
              className="w-6 h-6 flex items-center justify-center rounded border border-indigo-400/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 transition-colors"
              title="Register new package"
            >
              <Plus size={11} />
            </button>
          )}
        </div>
      </div>

      {account && (
        <div className="flex gap-1 text-[11px] font-mono">
          {(["all", "mine"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`flex-1 rounded-lg border px-2 py-1 transition-colors ${
                effectiveScope === s
                  ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-200"
                  : "border-white/10 text-slate-500 hover:text-slate-300"
              }`}
            >
              {s === "all" ? "All" : "Mine"}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      {packages.length > 3 && (
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
          <input
            className="w-full bg-[#090D1E] border border-white/8 rounded-lg pl-7 pr-3 py-1.5 text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-400/40 transition-colors"
            placeholder="search..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      )}

      {/* Register form */}
      <AnimatePresence>
        {showRegister && account && (
          <motion.div
            key="register-form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <RegisterPanel account={account} onRegistered={handleRegistered} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Package list */}
      <div className="flex flex-col gap-2 overflow-y-auto flex-1">
        {loading && packages.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw size={16} className="text-slate-600 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-400/20 bg-rose-500/5 px-3 py-4 text-center">
            <p className="text-[11px] text-rose-300 font-mono break-words">{error}</p>
            <button onClick={load} className="mt-2 text-[11px] text-slate-400 hover:text-white underline">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 py-8 text-center">
            <p className="text-[11px] text-slate-600 font-mono">
              {effectiveScope === "mine" ? "You have no packages yet. Click + to register a release." : "No packages registered."}
            </p>
          </div>
        ) : (
          filtered.map(p => (
            <PacketCard
              key={p.pkg_key}
              pkg={p}
              active={p.pkg_key === selectedKey}
              onClick={() => onSelect(p.pkg_key)}
            />
          ))
        )}
      </div>
    </div>
  )
}
