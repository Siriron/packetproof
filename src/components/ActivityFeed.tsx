/**
 * Live event feed from the contract — reads getEvents().
 */
import { useEffect, useState, useRef } from "react"
import { Activity, RefreshCw } from "lucide-react"
import { getEvents, getStats } from "../lib/genlayer"
import { isDeployed } from "../config/chains"
import type { ContractEvent } from "../lib/types"

const KIND_COLOR: Record<string, string> = {
  PACKAGE_REGISTERED: "text-indigo-300",
  SNAPSHOT_SUBMITTED: "text-sky-300",
  PACKAGE_ATTESTED:   "text-violet-300",
  CHALLENGE_OPENED:   "text-rose-300",
  CHALLENGE_RESOLVED: "text-amber-300",
  CERTIFIED:          "text-emerald-300",
  REVOKED:            "text-red-400",
}

export function ActivityFeed() {
  const [events, setEvents] = useState<ContractEvent[]>([])
  const [loading, setLoading] = useState(false)
  const loadingRef = useRef(false)

  function refresh() {
    if (!isDeployed() || loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    // get_events pages from the oldest retained event, so ask for the newest 20 explicitly
    getStats()
      .then((st) => getEvents(Math.max(0, st.events_total - 20), 20))
      .then((ev) => {
        setEvents(Array.isArray(ev) ? ev.slice().reverse() : [])
      })
      .catch(() => {})
      .finally(() => {
        loadingRef.current = false
        setLoading(false)
      })
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 12000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] backdrop-blur-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-indigo-400" />
          <span className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">Activity</span>
        </div>
        <button
          onClick={refresh}
          className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:text-slate-300 transition-colors"
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {events.length === 0 ? (
        <p className="text-[11px] text-slate-600 font-mono text-center py-4">No events yet</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {events.map((e) => (
            <div key={e.index} className="flex items-start gap-2 py-1 border-b border-white/5 last:border-0">
              <span className={`text-[10px] font-mono font-semibold shrink-0 ${KIND_COLOR[e.kind] ?? "text-slate-400"}`}>
                {e.kind.replace(/_/g, " ")}
              </span>
              <span className="text-[10px] font-mono text-slate-600 truncate min-w-0">
                {e.pkg_key}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
