/**
 * Anime-style package record card.
 */
import { StatusBadge } from "./StatusBadge"
import { Package, GitCommit, Globe } from "lucide-react"

interface PackageRecord {
  pkg_key: string
  package_name: string
  ecosystem: string
  version: string
  commit_sha: string
  state: string
  owner: string
  generation: number
}

interface PacketCardProps {
  pkg: PackageRecord
  onClick?: () => void
  active?: boolean
}

const ECOSYSTEM_COLOR: Record<string, string> = {
  npm:  "text-rose-300 border-rose-400/30 bg-rose-400/10",
  pypi: "text-amber-300 border-amber-400/30 bg-amber-400/10",
}

export function PacketCard({ pkg, onClick, active }: PacketCardProps) {
  const ecoStyle = ECOSYSTEM_COLOR[pkg.ecosystem] ?? "text-slate-400 border-slate-400/30 bg-slate-400/10"

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 transition-all duration-200 group
        ${active
          ? "border-indigo-400/60 bg-indigo-500/10 shadow-lg shadow-indigo-500/20"
          : "border-white/8 bg-white/[0.03] hover:border-indigo-400/40 hover:bg-white/[0.06]"
        }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Package size={15} className="text-indigo-400 shrink-0" />
          <span className="font-mono font-semibold text-white truncate text-sm">
            {pkg.package_name}
          </span>
          <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border ${ecoStyle}`}>
            {pkg.ecosystem}
          </span>
        </div>
        <StatusBadge status={pkg.state} size="sm" />
      </div>

      <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
        <span className="flex items-center gap-1">
          <Globe size={10} />
          v{pkg.version}
        </span>
        <span className="flex items-center gap-1">
          <GitCommit size={10} />
          {pkg.commit_sha.slice(0, 8)}
        </span>
        {pkg.generation > 0 && (
          <span className="text-indigo-400/60">gen {pkg.generation}</span>
        )}
      </div>
    </button>
  )
}
