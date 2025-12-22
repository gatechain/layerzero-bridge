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

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider>
                    <App />
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    </StrictMode>
)
