import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'

import { CHAINS, RPC_URL } from './constants/layerzero'

const projectId =
    (import.meta as any).env?.VITE_WALLETCONNECT_PROJECT_ID ||
    // This must be replaced for real usage; RainbowKit requires a projectId string.
    '00000000000000000000000000000000'

export const wagmiConfig = getDefaultConfig({
    appName: 'LayerZero OFT Adapter (USDT)',
    projectId,
    chains: [CHAINS.gate, CHAINS.sepolia],
    transports: {
        [CHAINS.gate.id]: http(RPC_URL.gate),
        [CHAINS.sepolia.id]: http(RPC_URL.sepolia),
    },
    ssr: false,
})


