/**
 * PacketProof — on-chain package release integrity attestation.
 * Built on GenLayer intelligent contracts (StudioNet).
 *
 * Layout: anime dark — deep space canvas, indigo/violet/cyan glows,
 * grid scanlines, frosted glass surfaces.
 */
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ShieldCheck, Wifi, WifiOff, ChevronLeft, ExternalLink } from "lucide-react"
import { AnimeBackground } from "./components/AnimeBackground"
import { PackageListPanel } from "./components/PackageListPanel"
import { PackageDetailPanel } from "./components/PackageDetailPanel"
import { ActivityFeed } from "./components/ActivityFeed"
import { useGenLayer } from "./lib/useGenLayer"
import { EXPLORER_CONTRACT, CONTRACT_ADDRESS } from "./config/chains"

function WalletButton({ account, connecting, connect, disconnect }: ReturnType<typeof useGenLayer>) {
  if (connecting) {
    return (
      <button disabled className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-mono text-slate-400 cursor-not-allowed min-h-[44px]">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        Connecting...
      </button>
    )
  }
  if (account) {
    return (
      <button
        onClick={disconnect}
        className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/5 hover:bg-emerald-500/10 px-4 py-2 text-xs font-mono text-emerald-300 transition-all min-h-[44px] group"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className="tabular-nums">{account.slice(0, 6)}...{account.slice(-4)}</span>
        <WifiOff size={11} className="text-emerald-500/50 group-hover:text-rose-400 transition-colors" />
      </button>
    )
  }
  return (
    <button
      onClick={() => { void connect() }}
      className="flex items-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/10 hover:bg-indigo-500/20 px-4 py-2 text-xs font-mono text-indigo-300 transition-all min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
    >
      <Wifi size={12} />
      Connect Wallet
    </button>
  )
}

export default function App() {
  const wallet = useGenLayer()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<"list" | "detail">("list")

  function handleSelect(key: string) {
    setSelectedKey(key)
    setMobileView("detail")
  }

  function handleBack() {
    setMobileView("list")
  }

  return (
    <div className="min-h-dvh relative font-['DM_Sans',sans-serif] text-white">
      <AnimeBackground />

      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <header className="relative z-20 flex items-center justify-between px-4 md:px-6 py-3 border-b border-white/[0.06] bg-[#060914]/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="relative w-9 h-9 rounded-xl border border-indigo-400/30 bg-indigo-500/10 flex items-center justify-center shrink-0">
            <ShieldCheck size={18} className="text-indigo-300" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-violet-400 border border-[#060914]" />
          </div>
          <div>
            <h1
              className="text-sm font-bold tracking-[-0.02em] text-white leading-none"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              PacketProof
            </h1>
            <p className="text-[10px] text-slate-600 font-mono leading-tight">
              GenLayer integrity attestation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Contract link */}
          {CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000" && (
            <a
              href={EXPLORER_CONTRACT(CONTRACT_ADDRESS)}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1 text-[10px] font-mono text-slate-600 hover:text-slate-300 transition-colors"
            >
              <ExternalLink size={10} />
              {CONTRACT_ADDRESS.slice(0, 8)}...
            </a>
          )}
          <WalletButton {...wallet} />
        </div>
      </header>

      {/* ── Main layout ─────────────────────────────────────────────────── */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 md:px-6 py-6">

        {/* No contract deployed banner */}
        {CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000" && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs font-mono text-amber-300"
          >
            <span className="font-semibold">Contract not deployed.</span>{" "}
            Deploy <code className="text-amber-200">contracts/packet_proof.py</code> via{" "}
            <a href="https://studio.genlayer.com" target="_blank" rel="noopener noreferrer" className="underline">
              studio.genlayer.com
            </a>
            , then update <code className="text-amber-200">src/config/chains.ts</code> with the address.
          </motion.div>
        )}

        {/* Desktop: 3-column layout. Mobile: single panel with back button. */}

        {/* Mobile back button */}
        <AnimatePresence>
          {mobileView === "detail" && selectedKey && (
            <motion.button
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={handleBack}
              className="mb-4 flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-white transition-colors md:hidden"
            >
              <ChevronLeft size={14} /> Back to list
            </motion.button>
          )}
        </AnimatePresence>

        <div className="grid md:grid-cols-[280px_1fr_240px] gap-6">

          {/* ── Column 1: Package list ─────────────────────────────────── */}
          <aside className={`min-h-0 ${mobileView !== "list" ? "hidden md:flex md:flex-col" : "flex flex-col"}`}>
            <PackageListPanel
              account={wallet.account}
              selectedKey={selectedKey}
              onSelect={handleSelect}
            />
          </aside>

          {/* ── Column 2: Detail panel ─────────────────────────────────── */}
          <section className={`min-h-0 ${mobileView !== "detail" ? "hidden md:block" : "block"}`}>
            <AnimatePresence mode="wait">
              {selectedKey ? (
                <PackageDetailPanel
                  key={selectedKey}
                  pkgKey={selectedKey}
                  account={wallet.account}
                />
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-64 rounded-2xl border border-dashed border-white/8 text-center px-6"
                >
                  <ShieldCheck size={32} className="text-indigo-400/30 mb-3" />
                  <p className="text-sm text-slate-600 font-mono">Select a package to view details</p>
                  {!wallet.account && (
                    <p className="mt-1 text-[11px] text-slate-700 font-mono">Connect wallet to register a release</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* ── Column 3: Activity feed ────────────────────────────────── */}
          <aside className="hidden md:block">
            <ActivityFeed />
          </aside>
        </div>
      </main>
    </div>
  )
}
