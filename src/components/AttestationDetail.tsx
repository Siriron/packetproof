/**
 * Shows the latest attestation record and per-rule findings.
 */
import { StatusBadge } from "./StatusBadge"
import { ShieldAlert, CheckCircle2 } from "lucide-react"
import type { AttestationRecord, CertificationRecord } from "../lib/types"

interface AttestationDetailProps {
  attestation: AttestationRecord
}

export function AttestationDetail({ attestation: a }: AttestationDetailProps) {
  if (!a || Object.keys(a).length === 0) return null

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert size={13} className="text-slate-500" />
          <span className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">
            Latest Attestation
          </span>
        </div>
        <StatusBadge status={a.route_result} size="sm" />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
        <div className="flex justify-between">
          <span className="text-slate-600">generation</span>
          <span className="text-slate-300 tabular-nums">{a.generation}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">attempt</span>
          <span className="text-slate-300 tabular-nums">{a.attempt}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">registry match</span>
          <span className={a.registry_match ? "text-emerald-300" : "text-red-400"}>
            {a.registry_match ? "yes" : "no"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">dist hash</span>
          <span className={a.dist_hash_match ? "text-emerald-300" : "text-red-400"}>
            {a.dist_hash_match ? "matched" : "mismatch"}
          </span>
        </div>
      </div>

      {Array.isArray(a.findings) && a.findings.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">Per-rule findings</p>
          {a.findings.map((f, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
              <span className="font-mono text-[11px] text-slate-400">{f.rule_id}</span>
              <StatusBadge status={f.status} size="sm" />
            </div>
          ))}
        </div>
      )}

      {a.attestation_digest && (
        <div className="rounded-lg border border-white/5 bg-white/[0.015] px-2.5 py-1.5 font-mono text-[10px]">
          <span className="text-slate-600">attestation digest </span>
          <span className="text-slate-500">{a.attestation_digest.slice(0, 32)}...</span>
        </div>
      )}
    </div>
  )
}

interface CertificationBannerProps {
  cert: CertificationRecord
}

export function CertificationBanner({ cert }: CertificationBannerProps) {
  if (!cert || !cert.certification_digest) return null
  return (
    <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={15} className="text-emerald-300" />
        <span className="text-sm font-semibold text-emerald-300">CERTIFIED</span>
      </div>
      <div className="font-mono text-[11px] space-y-1 text-slate-400">
        <div className="flex justify-between">
          <span className="text-slate-600">evidence root</span>
          <span>{cert.evidence_root?.slice(0, 20)}...</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">certified at</span>
          <span className="tabular-nums">
            {cert.certified_at ? new Date(cert.certified_at * 1000).toLocaleString() : "-"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">cert digest</span>
          <span>{cert.certification_digest.slice(0, 20)}...</span>
        </div>
      </div>
    </div>
  )
}
