/// <reference types="react" />
/// <reference types="react-dom" />

interface ImportMetaEnv {
    readonly VITE_WALLETCONNECT_PROJECT_ID?: string
    readonly VITE_GATE_RPC_URL?: string
    readonly VITE_SEPOLIA_RPC_URL?: string

    readonly VITE_GATE_USDTMOCK?: string
    readonly VITE_GATE_USDTOFTADAPTER?: string
    readonly VITE_SEPOLIA_USDTMOCK?: string
    readonly VITE_SEPOLIA_USDTOFTADAPTER?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

// Vite-style asset imports (so TS doesn't error on `import './App.css'`, etc.)
declare module '*.css'
declare module '*.svg'
declare module '*.png'
declare module '*.jpg'
declare module '*.jpeg'
declare module '*.webp'


