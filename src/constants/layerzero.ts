import type { Address } from 'viem'
import { defineChain } from 'viem'
import { sepolia } from 'viem/chains'

import { REGISTRY, type RegistryChainKey, type RegistryTokenKey } from './generated'

export type { RegistryChainKey, RegistryTokenKey }

/**
 * Runtime overrides (optional) – still compile-time bundled, but lets you override defaults locally.
 */
function env(name: string): string | undefined {
    const v = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.[name]
    return typeof v === 'string' && v.length > 0 ? v : undefined
}

/**
 * Resolve RPC URL for a registry chain key.
 */
export function getRpcUrl(chainKey: RegistryChainKey): string {
    const override =
        chainKey === 'gate-testnet'
            ? env('VITE_GATE_RPC_URL')
            : chainKey === 'sepolia'
              ? env('VITE_SEPOLIA_RPC_URL')
              : undefined

    const fromRegistry = REGISTRY.chains[chainKey].rpcUrl

    // If registry contains a placeholder (e.g. Alchemy "YOUR_KEY"), fall back to viem's default public RPC.
    const fallback =
        chainKey === 'sepolia' && fromRegistry.includes('rfdRP2gPYwl28VMWGwyA480qNKpB0h2f') ? sepolia.rpcUrls.default.http[0] : fromRegistry

    return override ?? fallback
}

/**
 * viem chain instances (static, since wagmi needs them at init)
 */
export const VIEM_CHAINS: Record<RegistryChainKey, ReturnType<typeof defineChain> | typeof sepolia> = {
    'gate-testnet': defineChain({
        id: REGISTRY.chains['gate-testnet'].chainId,
        name: REGISTRY.chains['gate-testnet'].name,
        nativeCurrency: REGISTRY.chains['gate-testnet'].nativeCurrency,
        rpcUrls: {
            default: { http: [getRpcUrl('gate-testnet')] },
            public: { http: [getRpcUrl('gate-testnet')] },
        },
        blockExplorers: {
            default: {
                name: 'Explorer',
                url: REGISTRY.chains['gate-testnet'].explorerUrl || 'https://testnet.layerzeroscan.com',
            },
        },
    }),
    sepolia,
}

export const DEFAULT_SOURCE_CHAIN: RegistryChainKey = 'gate-testnet'
export const DEFAULT_DEST_CHAIN: RegistryChainKey = 'sepolia'
export const DEFAULT_TOKEN: RegistryTokenKey = 'USDT'

export function listChains(): RegistryChainKey[] {
    return Object.keys(REGISTRY.chains) as RegistryChainKey[]
}

export function listTokens(): RegistryTokenKey[] {
    return Object.keys(REGISTRY.tokens) as RegistryTokenKey[]
}

export function getChainMeta(chainKey: RegistryChainKey) {
    return REGISTRY.chains[chainKey]
}

export function getEid(chainKey: RegistryChainKey): number {
    return REGISTRY.chains[chainKey].eid
}

export function getTokenMeta(tokenKey: RegistryTokenKey) {
    return REGISTRY.tokens[tokenKey]
}

export function getTokenDecimals(tokenKey: RegistryTokenKey): number {
    return REGISTRY.tokens[tokenKey].decimals
}

export function getTokenContracts(tokenKey: RegistryTokenKey, chainKey: RegistryChainKey): { token: Address; adapter: Address } {
    const perChain = REGISTRY.tokens[tokenKey].perChain as Partial<Record<RegistryChainKey, { token: string; adapter: string }>>
    const per = perChain[chainKey]
    if (!per) {
        throw new Error(`Token ${tokenKey} not configured on chain ${chainKey}`)
    }

    // Optional overrides via env (generic, supports USDT/USDC/...):
    // - VITE_GATE_<TOKEN>MOCK, VITE_GATE_<TOKEN>OFTADAPTER
    // - VITE_SEPOLIA_<TOKEN>MOCK, VITE_SEPOLIA_<TOKEN>OFTADAPTER
    const chainPrefix = chainKey === 'gate-testnet' ? 'GATE' : chainKey.toUpperCase()
    const tokenKeyUpper = String(tokenKey).toUpperCase()
    const tokenEnvKey = `VITE_${chainPrefix}_${tokenKeyUpper}MOCK`
    const adapterEnvKey = `VITE_${chainPrefix}_${tokenKeyUpper}OFTADAPTER`

    const token = (env(tokenEnvKey) ?? per.token) as Address
    const adapter = (env(adapterEnvKey) ?? per.adapter) as Address
    return { token, adapter }
}

export const EXPLORER = {
    layerzeroTx: (txHash: string) => `https://testnet.layerzeroscan.com/tx/${txHash}`,
    tx: (chainKey: RegistryChainKey, txHash: string) => {
        const base = REGISTRY.chains[chainKey].explorerUrl
        if (!base) return undefined
        return `${base.replace(/\/+$/, '')}/tx/${txHash}`
    },
} as const


