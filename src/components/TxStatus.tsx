/**
 * Inline transaction state surface — never simulates progress.
 * Shows: idle | signing | confirming | success | error.
 */
import { useCallback, useState } from "react"
import { Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react"
import { EXPLORER_TX } from "../config/chains"
import { TimeoutError, type OnHash, type WriteResult } from "../lib/genlayer"

export type TxState =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "confirming"; hash: string }
  | { phase: "success"; hash: string; result?: string }
  | { phase: "error"; message: string; hash?: string }

interface TxStatusProps {
  state: TxState
  onDismiss?: () => void
}

export function TxStatus({ state, onDismiss }: TxStatusProps) {
  if (state.phase === "idle") return null

  return (
    <div className="rounded-xl border border-white/10 bg-[#0C1022]/80 backdrop-blur-sm p-3 text-sm mt-3">
      {state.phase === "signing" && (
        <div className="flex items-center gap-2 text-amber-300">
          <Loader2 size={14} className="animate-spin shrink-0" />
          <span className="font-mono text-xs">Waiting for wallet signature...</span>
        </div>
      )}

      {state.phase === "confirming" && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sky-300">
            <Loader2 size={14} className="animate-spin shrink-0" />
            <span className="font-mono text-xs">Consensus in progress...</span>
          </div>
          <p className="text-[11px] text-slate-500 font-mono pl-5">This can take several minutes.</p>
          <a
            href={EXPLORER_TX(state.hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors font-mono"
          >
            <ExternalLink size={10} />
            {state.hash.slice(0, 20)}...
          </a>
        </div>
      )}

      {state.phase === "success" && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-emerald-300">
            <CheckCircle2 size={14} className="shrink-0" />
            <span className="font-mono text-xs">Transaction confirmed</span>
            {onDismiss && (
              <button onClick={onDismiss} className="ml-auto text-slate-500 hover:text-slate-300 transition-colors text-[11px]">
                dismiss
              </button>
            )}
          </div>
          {state.result && (
            <p className="text-[11px] text-slate-400 font-mono pl-5">result: {state.result}</p>
          )}
          <a
            href={EXPLORER_TX(state.hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors font-mono pl-5"
          >
            <ExternalLink size={10} />
            {state.hash.slice(0, 20)}...
          </a>
        </div>
      )}

      {state.phase === "error" && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-red-400">
            <XCircle size={14} className="shrink-0" />
            <span className="font-mono text-xs truncate">{state.message}</span>
            {onDismiss && (
              <button onClick={onDismiss} className="ml-auto text-slate-500 hover:text-slate-300 transition-colors text-[11px]">
                dismiss
              </button>
            )}
          </div>
          {state.hash && (
            <a
              href={EXPLORER_TX(state.hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors font-mono pl-5"
            >
              <ExternalLink size={10} />
              {state.hash.slice(0, 20)}...
            </a>
          )}
        </div>
      )}
    </div>
  )
}

export function extractErrorMessage(e: unknown): string {
  if (e instanceof TimeoutError) return e.message
  if (e instanceof Error) return e.message.slice(0, 200)
  return "Unknown error"
}

export function extractTxHash(e: unknown): string | undefined {
  if (e instanceof TimeoutError) return e.txHash
  if (typeof e === "object" && e !== null && "txHash" in e) {
    const h = (e as Record<string, unknown>).txHash
    return typeof h === "string" ? h : undefined
  }
  return undefined
}

const IDLE: TxState = { phase: "idle" }

/**
 * Owns the signing -> confirming -> success | error lifecycle of one write.
 * `run` resolves to the write result, or null if the write failed (error is in `tx`).
 */
export function useTx() {
  const [tx, setTx] = useState<TxState>(IDLE)
  const busy = tx.phase === "signing" || tx.phase === "confirming"

  const run = useCallback(
    async (write: (onHash: OnHash) => Promise<WriteResult>): Promise<WriteResult | null> => {
      setTx({ phase: "signing" })
      try {
        const res = await write((hash) => setTx({ phase: "confirming", hash }))
        setTx({ phase: "success", hash: res.hash, result: res.receipt?.result ?? "" })
        return res
      } catch (e: unknown) {
        setTx({ phase: "error", message: extractErrorMessage(e), hash: extractTxHash(e) })
        return null
      }
    },
    [],
  )

  const reset = useCallback(() => setTx(IDLE), [])
  return { tx, busy, run, reset }
}
