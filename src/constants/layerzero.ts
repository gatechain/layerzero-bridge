import type { Address } from 'viem'
import { defineChain } from 'viem'
import { sepolia } from 'viem/chains'

/**
 * LayerZero Endpoint IDs (EIDs)
 */
export const EID = {
    GATE_V2_TESTNET: 40421,
    SEPOLIA_V2_TESTNET: 40161,
} as const

export const TOKEN_DECIMALS = 6 as const

function env(name: string): string | undefined {
    const v = (import.meta as any).env?.[name]
    return typeof v === 'string' && v.length > 0 ? v : undefined
}

export const RPC_URL = {
    gate: env('VITE_GATE_RPC_URL') ?? 'https://gatelayer-testnet.gatenode.cc',
    sepolia: env('VITE_SEPOLIA_RPC_URL') ?? sepolia.rpcUrls.default.http[0],
} as const

/**
 * GateLayer Testnet (custom chain)
 * - chainId (hex): 0x2767
 * - chainId (dec): 10087
 */
export const gatelayerTestnet = defineChain({
    id: 10087,
    name: 'GateLayer Testnet',
    nativeCurrency: { name: 'GATE', symbol: 'GATE', decimals: 18 },
    rpcUrls: {
        default: { http: [RPC_URL.gate] },
        public: { http: [RPC_URL.gate] },
    },
    blockExplorers: {
        // If you have a GateLayer testnet explorer URL, put it here
        default: { name: 'Explorer', url: 'https://testnet.layerzeroscan.com' },
    },
})

export const CHAINS = {
    gate: gatelayerTestnet,
    sepolia,
} as const

export const CONTRACTS = {
    gate: {
        usdtMock: (env('VITE_GATE_USDTMOCK') ?? '0xF8320A7822F70F8AC7a2bA8024FD91b5C1c8F84a') as Address,
        usdtOftAdapter: (env('VITE_GATE_USDTOFTADAPTER') ??
            '0x7E2bA79FA8bE30bE03f6FBCA3589075800Bbd92d') as Address,
    },
    sepolia: {
        usdtMock: (env('VITE_SEPOLIA_USDTMOCK') ?? '0xFbd2Bea9f69d41A8505b52162D935FB7D52db345') as Address,
        usdtOftAdapter: (env('VITE_SEPOLIA_USDTOFTADAPTER') ??
            '0xF8320A7822F70F8AC7a2bA8024FD91b5C1c8F84a') as Address,
    },
} as const

export const EXPLORER = {
    layerzeroTx: (txHash: string) => `https://testnet.layerzeroscan.com/tx/${txHash}`,
    sepoliaTx: (txHash: string) => `https://sepolia.etherscan.io/tx/${txHash}`,
} as const


