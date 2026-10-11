/**
 * Anime-style status badge with glow.
 */
interface StatusBadgeProps {
  status: string
  size?: "sm" | "md" | "lg"
}

const STATUS_CONFIG: Record<string, { label: string; color: string; glow: string; dot: string }> = {
  DRAFT:         { label: "DRAFT",         color: "text-slate-400",  glow: "shadow-slate-500/20",  dot: "bg-slate-400" },
  COMMIT_LOCKED: { label: "PENDING",       color: "text-amber-300",  glow: "shadow-amber-400/30",  dot: "bg-amber-300" },
  INCONCLUSIVE:  { label: "INCONCLUSIVE",  color: "text-yellow-300", glow: "shadow-yellow-400/30", dot: "bg-yellow-300" },
  BLOCKED:       { label: "BLOCKED",       color: "text-red-400",    glow: "shadow-red-500/40",    dot: "bg-red-400" },
  VERIFIED:      { label: "VERIFIED",      color: "text-sky-300",    glow: "shadow-sky-400/40",    dot: "bg-sky-300" },
  CHALLENGED:    { label: "CHALLENGED",    color: "text-violet-300", glow: "shadow-violet-400/30", dot: "bg-violet-300" },
  CERTIFIED:     { label: "CERTIFIED",     color: "text-emerald-300",glow: "shadow-emerald-400/40",dot: "bg-emerald-300" },
  REVOKED:       { label: "REVOKED",       color: "text-rose-400",   glow: "shadow-rose-500/30",   dot: "bg-rose-400" },
  PRESERVED:     { label: "PRESERVED",     color: "text-emerald-300",glow: "shadow-emerald-400/20",dot: "bg-emerald-300" },
  CONSISTENT:    { label: "CONSISTENT",    color: "text-sky-300",    glow: "shadow-sky-400/20",    dot: "bg-sky-300" },
  INCONSISTENT:  { label: "INCONSISTENT",  color: "text-red-400",    glow: "shadow-red-400/30",    dot: "bg-red-400" },
  MISSING:       { label: "MISSING",       color: "text-amber-300",  glow: "shadow-amber-400/20",  dot: "bg-amber-300" },
  UNREADABLE:    { label: "UNREADABLE",    color: "text-slate-400",  glow: "shadow-slate-400/20",  dot: "bg-slate-400" },
  CONFLICTING:   { label: "CONFLICTING",   color: "text-violet-300", glow: "shadow-violet-400/20", dot: "bg-violet-300" },
}

const SIZE_CLASSES = {
  sm: "text-[10px] px-2 py-0.5 gap-1",
  md: "text-xs px-2.5 py-1 gap-1.5",
  lg: "text-sm px-3 py-1.5 gap-2",
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    color: "text-slate-400",
    glow: "shadow-slate-400/20",
    dot: "bg-slate-400",
  }
  return (
    <span
      className={`inline-flex items-center font-mono font-semibold tracking-widest rounded-full border border-white/10 bg-white/5 backdrop-blur-sm ${cfg.color} ${SIZE_CLASSES[size]}`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.dot} shrink-0`} />
      {cfg.label}
    </span>
  )
}
