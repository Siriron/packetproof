// PacketProof — GenLayer StudioNet configuration
// Contract address: update this after deploying via studio.genlayer.com

export const CONTRACT_ADDRESS: string = "0x130e93332dc795702c5546BDaf59B3990658B796"

export const isDeployed = (): boolean => /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS) && !/^0x0{40}$/.test(CONTRACT_ADDRESS)

export const STUDIONET = {
  chainId: "0xF22F", // 61999
  chainName: "GenLayer StudioNet",
  rpcUrls: ["https://studio.genlayer.com/api"],
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
}

export const EXPLORER_BASE = "https://explorer-studio.genlayer.com"
export const EXPLORER_TX = (hash: string) => `${EXPLORER_BASE}/tx/${hash}`
export const EXPLORER_CONTRACT = (addr: string) => `${EXPLORER_BASE}/address/${addr}`
