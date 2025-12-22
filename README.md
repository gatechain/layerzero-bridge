# OFT Adapter Frontend (React + TypeScript + Vite)

This app connects a browser wallet (MetaMask / Rabby) and performs **USDT OFT-Adapter** cross-chain transfer:

- **Source**: GateLayer Testnet (EID `40421`)
- **Destination**: Sepolia (EID `40161`)

It follows the same flow as `OFT_ADAPTER_GUIDE.md` in the repo:

1. `USDT.approve(adapter, amount)`
2. `adapter.quoteSend(sendParam)`
3. `adapter.send(sendParam, fee, refundAddress)` with `value = nativeFee`

## Quick start

```bash
cd examples/oft-adapter-frontend
npm install
npm run dev
```

## Environment variables

Because `.env*` files are often ignored, we keep the list here. Create `examples/oft-adapter-frontend/.env.local` and set:

```bash
# required by RainbowKit
VITE_WALLETCONNECT_PROJECT_ID=YOUR_WC_PROJECT_ID

# optional RPC overrides
VITE_GATE_RPC_URL=https://gatelayer-testnet.gatenode.cc
VITE_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY

# optional address overrides (defaults are hardcoded from deployments/)
VITE_GATE_USDTMOCK=0xF8320A7822F70F8AC7a2bA8024FD91b5C1c8F84a
VITE_GATE_USDTOFTADAPTER=0x7E2bA79FA8bE30bE03f6FBCA3589075800Bbd92d
VITE_SEPOLIA_USDTMOCK=0xFbd2Bea9f69d41A8505b52162D935FB7D52db345
VITE_SEPOLIA_USDTOFTADAPTER=0xF8320A7822F70F8AC7a2bA8024FD91b5C1c8F84a
```

The app reads these from `src/constants/layerzero.ts`.

## Notes

- **Default `OFTAdapter` is lock/unlock**, not burn/mint. The **destination adapter must have USDT liquidity** (it transfers out from its own balance).
- For `USDTMock`, you can mint liquidity to the destination adapter via:

```bash
FUND_AMOUNT=1000 npx hardhat run --network sepolia scripts/fundAdapterUSDTMock.ts
```

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
