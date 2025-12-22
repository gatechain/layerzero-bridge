import './App.css'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useBalance, useChainId, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { readContract } from 'wagmi/actions'
import { parseUnits, formatUnits } from 'viem'
import type { Address, Hex } from 'viem'
import { useMemo, useState } from 'react'

import { CONTRACTS, EID, EXPLORER, TOKEN_DECIMALS, CHAINS } from './constants/layerzero'
import { erc20Abi } from './abi/erc20'
import { usdtOftAdapterAbi } from './abi/usdtOftAdapter'
import { addressToBytes32 } from './utils/addressToBytes32'
import { wagmiConfig } from './wagmi'

function App() {
    const { address } = useAccount()
    const chainId = useChainId()
    const { switchChainAsync } = useSwitchChain()
    const { writeContractAsync } = useWriteContract()

    const [to, setTo] = useState<string>('')
    const [amountHuman, setAmountHuman] = useState<string>('1.0')
    const [nativeFee, setNativeFee] = useState<bigint | null>(null)
    const [lastSrcTx, setLastSrcTx] = useState<string | null>(null)

    const gateChainId = CHAINS.gate.id
    const sepoliaChainId = CHAINS.sepolia.id

    const recipient: Address | null = useMemo(() => {
        const v = (to || address || '').trim()
        return v && v.startsWith('0x') && v.length === 42 ? (v as Address) : null
    }, [to, address])

    const amountLD: bigint | null = useMemo(() => {
        try {
            if (!amountHuman) return null
            return parseUnits(amountHuman, TOKEN_DECIMALS)
        } catch {
            return null
        }
    }, [amountHuman])

    const sendParam = useMemo(() => {
        if (!recipient || !amountLD) return null
        return {
            dstEid: EID.SEPOLIA_V2_TESTNET,
            to: addressToBytes32(recipient) as Hex,
            amountLD,
            minAmountLD: amountLD,
            // Options type 3 empty: 0x0003 (matches toolbox behavior when no extra options are set)
            extraOptions: '0x0003' as Hex,
            composeMsg: '0x' as Hex,
            oftCmd: '0x' as Hex,
        } as const
    }, [recipient, amountLD])

    // ----- Gate reads (source)
    const gateUsdt = CONTRACTS.gate.usdtMock
    const gateAdapter = CONTRACTS.gate.usdtOftAdapter

    const { data: gateBalance } = useReadContract({
        abi: erc20Abi,
        address: gateUsdt,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        chainId: gateChainId,
        query: { enabled: !!address },
    })

    const { data: gateAllowance } = useReadContract({
        abi: erc20Abi,
        address: gateUsdt,
        functionName: 'allowance',
        args: address ? [address, gateAdapter] : undefined,
        chainId: gateChainId,
        query: { enabled: !!address },
    })

    const { data: gateNativeBal } = useBalance({
        address,
        chainId: gateChainId,
        query: { enabled: !!address },
    })

    // ----- Sepolia reads (destination)
    const sepoliaUsdt = CONTRACTS.sepolia.usdtMock
    const sepoliaAdapter = CONTRACTS.sepolia.usdtOftAdapter

    const { data: sepoliaRecipientBal } = useReadContract({
        abi: erc20Abi,
        address: sepoliaUsdt,
        functionName: 'balanceOf',
        args: recipient ? [recipient] : undefined,
        chainId: sepoliaChainId,
        query: { enabled: !!recipient },
    })

    const { data: sepoliaAdapterBal } = useReadContract({
        abi: erc20Abi,
        address: sepoliaUsdt,
        functionName: 'balanceOf',
        args: [sepoliaAdapter],
        chainId: sepoliaChainId,
        query: { enabled: true },
    })

    const hasDestLiquidity = (sepoliaAdapterBal ?? 0n) > 0n

    async function ensureOnGate() {
        if (chainId !== gateChainId) {
            await switchChainAsync({ chainId: gateChainId })
        }
    }

    async function onApprove() {
        if (!address || !amountLD) return
        await ensureOnGate()
        const txHash = await writeContractAsync({
            abi: erc20Abi,
            address: gateUsdt,
            functionName: 'approve',
            args: [gateAdapter, amountLD],
        })
        setLastSrcTx(txHash)
    }

    async function onQuote() {
        if (!sendParam) return
        await ensureOnGate()
        const msgFee = (await readContract(wagmiConfig, {
            abi: usdtOftAdapterAbi,
            address: gateAdapter,
            functionName: 'quoteSend',
            args: [sendParam, false],
            chainId: gateChainId,
        })) as { nativeFee: bigint; lzTokenFee: bigint }
        setNativeFee(msgFee.nativeFee)
    }

    async function onSend() {
        if (!address || !sendParam || nativeFee == null) return
        await ensureOnGate()
        const txHash = await writeContractAsync({
            abi: usdtOftAdapterAbi,
            address: gateAdapter,
            functionName: 'send',
            args: [sendParam, { nativeFee, lzTokenFee: 0n }, address],
            value: nativeFee,
        })
        setLastSrcTx(txHash)
        setNativeFee(null)
    }

    const canPayNativeFee = useMemo(() => {
        if (nativeFee == null) return false
        const bal = gateNativeBal?.value
        if (bal == null) return true // unknown; let wallet decide
        // Need msg.value + gas, so require strictly more than nativeFee
        return bal > nativeFee
    }, [gateNativeBal?.value, nativeFee])

    return (
        <div style={{ maxWidth: 920, margin: '0 auto', padding: 24, textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                    <h2 style={{ margin: 0 }}>USDT OFT-Adapter Cross-chain (GateLayer → Sepolia)</h2>
                    <div style={{ opacity: 0.7, marginTop: 6 }}>
                        Source: {CHAINS.gate.name} (EID {EID.GATE_V2_TESTNET}) → Destination: {CHAINS.sepolia.name} (EID{' '}
                        {EID.SEPOLIA_V2_TESTNET})
                    </div>
                </div>
                <ConnectButton />
            </div>

            <div className="card" style={{ marginTop: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                        <div style={{ fontWeight: 600 }}>Source (GateLayer)</div>
                        <div style={{ marginTop: 6 }}>
                            - USDTMock: <code>{gateUsdt}</code>
                        </div>
                        <div>
                            - Adapter: <code>{gateAdapter}</code>
                        </div>
                        <div style={{ marginTop: 8 }}>
                            - Your balance: <b>{gateBalance != null ? formatUnits(gateBalance, TOKEN_DECIMALS) : '-'}</b> USDT
                        </div>
                        <div>
                            - Allowance to Adapter:{' '}
                            <b>{gateAllowance != null ? formatUnits(gateAllowance, TOKEN_DECIMALS) : '-'}</b> USDT
                        </div>
                    </div>

                    <div>
                        <div style={{ fontWeight: 600 }}>Destination (Sepolia)</div>
                        <div style={{ marginTop: 6 }}>
                            - USDTMock: <code>{sepoliaUsdt}</code>
                        </div>
                        <div>
                            - Adapter: <code>{sepoliaAdapter}</code>
                        </div>
                        <div style={{ marginTop: 8 }}>
                            - Recipient balance:{' '}
                            <b>{sepoliaRecipientBal != null ? formatUnits(sepoliaRecipientBal, TOKEN_DECIMALS) : '-'}</b> USDT
                        </div>
                        <div>
                            - Adapter liquidity:{' '}
                            <b>{sepoliaAdapterBal != null ? formatUnits(sepoliaAdapterBal, TOKEN_DECIMALS) : '-'}</b> USDT
                        </div>
                        {!hasDestLiquidity && (
                            <div style={{ marginTop: 8, color: '#ff6b6b' }}>
                                Destination Adapter has 0 liquidity. With default OFTAdapter (lock/unlock), receive will fail until
                                you fund the destination adapter.
                                <div style={{ marginTop: 6 }}>
                                    Run:{' '}
                                    <code>
                                        FUND_AMOUNT=1000 npx hardhat run --network sepolia scripts/fundAdapterUSDTMock.ts
                                    </code>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="card" style={{ marginTop: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <label>
                        Recipient (defaults to your address)
                        <input
                            style={{ width: '100%', marginTop: 6, padding: 10 }}
                            value={to}
                            placeholder={address ?? '0x...'}
                            onChange={(e) => setTo(e.target.value)}
                        />
                    </label>
                    <label>
                        Amount (USDT, 6 decimals)
                        <input
                            style={{ width: '100%', marginTop: 6, padding: 10 }}
                            value={amountHuman}
                            onChange={(e) => setAmountHuman(e.target.value)}
                        />
                    </label>
                </div>

                <div style={{ marginTop: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <button disabled={!address || !amountLD} onClick={onApprove}>
                        1) Approve
                    </button>
                    <button disabled={!address || !sendParam} onClick={onQuote}>
                        2) Quote fee
                    </button>
                    <button disabled={!address || !sendParam || nativeFee == null || !canPayNativeFee} onClick={onSend}>
                        3) Send (pay nativeFee)
                    </button>
                </div>

                <div style={{ marginTop: 10, opacity: 0.8 }}>
                    - Native fee:{' '}
                    <b>{nativeFee != null ? `${formatUnits(nativeFee, 18)} ${CHAINS.gate.nativeCurrency.symbol}` : '-'}</b>
                </div>
                <div style={{ marginTop: 6, opacity: 0.8 }}>
                    - Your {CHAINS.gate.nativeCurrency.symbol} balance:{' '}
                    <b>{gateNativeBal ? `${gateNativeBal.formatted} ${gateNativeBal.symbol}` : '-'}</b>
                </div>
                {!canPayNativeFee && nativeFee != null && (
                    <div style={{ marginTop: 10, color: '#ff6b6b' }}>
                        Insufficient {CHAINS.gate.nativeCurrency.symbol} to pay <b>nativeFee</b> + gas on GateLayer. You need some
                        GateLayer testnet native token in your wallet.
                    </div>
                )}

                {lastSrcTx && (
                    <div style={{ marginTop: 10 }}>
                        - Source tx: <code>{lastSrcTx}</code> ({' '}
                        <a href={EXPLORER.layerzeroTx(lastSrcTx)} target="_blank" rel="noreferrer">
                            LayerZeroScan
                        </a>{' '}
                        )
                    </div>
                )}
            </div>

            <div style={{ marginTop: 16, opacity: 0.7 }}>
                Env config is in <code>src/constants/layerzero.ts</code> (uses Vite env vars like <code>VITE_GATE_RPC_URL</code>,{' '}
                <code>VITE_WALLETCONNECT_PROJECT_ID</code>, etc.). See <code>README.md</code> in this folder.
            </div>
        </div>
    )
}

export default App
