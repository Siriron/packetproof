/**
 * React hook for wallet connection + GenLayer write state.
 * Persists account across reloads; listens for accountsChanged.
 */
import { useState, useEffect, useCallback } from "react"
import { getEthereum } from "./types"

export interface GenLayerState {
  account: string | null
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => void
}

export function useGenLayer(): GenLayerState {
  const [account, setAccount] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  // On mount: silently check if already authorised (no prompt)
  useEffect(() => {
    const eth = getEthereum()
    if (!eth) return
    eth
      .request({ method: "eth_accounts" })
      .then((res) => {
        const accounts = res as string[]
        if (accounts[0]) setAccount(accounts[0])
      })
      .catch(() => {})

    const handleChange = (...args: unknown[]) => {
      const accounts = args[0] as string[]
      setAccount(accounts[0] ?? null)
    }
    if (eth.on) eth.on("accountsChanged", handleChange)
    return () => {
      if (eth.removeListener) eth.removeListener("accountsChanged", handleChange)
    }
  }, [])

  const connect = useCallback(async () => {
    const eth = getEthereum()
    if (!eth) {
      alert("No wallet found. Please install MetaMask.")
      return
    }
    setConnecting(true)
    try {
      const res = await eth.request({ method: "eth_requestAccounts" })
      const accounts = res as string[]
      if (accounts[0]) setAccount(accounts[0])
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => setAccount(null), [])

  return { account, connecting, connect, disconnect }
}
