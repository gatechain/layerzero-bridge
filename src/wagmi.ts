import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'

import { VIEM_CHAINS, getRpcUrl, listChains, type RegistryChainKey } from './constants/layerzero'

const projectId =
    (import.meta as any).env?.VITE_WALLETCONNECT_PROJECT_ID ||
    // This must be replaced for real usage; RainbowKit requires a projectId string.
    '00000000000000000000000000000000'

const chainKeys = listChains()
const chains = chainKeys.map((k) => VIEM_CHAINS[k])
const transports = chainKeys.reduce((acc, k) => {
    const chain = VIEM_CHAINS[k]
    acc[(chain as any).id] = http(getRpcUrl(k as RegistryChainKey))
    return acc
}, {} as Record<number, ReturnType<typeof http>>)

export const wagmiConfig = getDefaultConfig({
    appName: 'LayerZero OFT Adapter (USDT)',
    projectId,
    // all supported chains from registry
    chains: chains as any,
    transports,
    ssr: false,
})


