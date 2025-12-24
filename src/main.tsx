import '@rainbow-me/rainbowkit/styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'

import './index.css'
import App from './App.tsx'
import { wagmiConfig } from './wagmi'

const queryClient = new QueryClient()

// Some wallet providers throw EIP-1193 4100 during eager capability checks.
// Swallow it to avoid noisy "Uncaught (in promise)" on page refresh.
window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as unknown
    if (
        typeof reason === 'object' &&
        reason !== null &&
        'code' in reason &&
        (reason as { code?: unknown }).code === 4100
    ) {
        event.preventDefault()
    }
})

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        {/* Prevent eager wallet reconnect on refresh (can trigger EIP-1193 4100 in some wallets). */}
        <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider>
                    <App />
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    </StrictMode>
)
