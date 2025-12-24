import './App.css'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useBalance, useChainId, useReadContract, useSwitchChain, useWalletClient } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import type { Address, Hex } from 'viem'
import { useMemo, useState } from 'react'

import {
    DEFAULT_DEST_CHAIN,
    DEFAULT_SOURCE_CHAIN,
    DEFAULT_TOKEN,
    VIEM_CHAINS,
    getChainMeta,
    getEid,
    getTokenContracts,
    getTokenDecimals,
    listChains,
    listTokens,
    type RegistryChainKey,
    type RegistryTokenKey,
} from './constants/layerzero'
import { erc20Abi } from './abi/erc20'
import { addressToBytes32 } from './utils/addressToBytes32'

const INTENTS_SERVER_BASE_URL = 'http://127.0.0.1:8082'

type PermitTypedDataApiResponse = {
    code: number
    message: string
    reason?: string
    data?: {
        fee: { native_fee_wei: string; lz_token_fee_wei: string }
        resolved: {
            send_param: {
                dst_eid: number
                amount_ld: string
                min_amount_ld: string
                extra_options: Hex
                compose_msg: Hex
                oft_cmd: Hex
            }
        }
        permit: {
            domain: {
                name: string
                version: string
                verifying_contract: Address
            }
            message: {
                spender: Address
                value: string
                nonce: string
                deadline: string
            }
        }
    }
}

function splitEcdsaSignature(sig: Hex): { v: number; r: Hex; s: Hex } {
    // 65-byte signature: r (32) + s (32) + v (1)
    if (!sig.startsWith('0x') || sig.length !== 132) throw new Error('Invalid signature hex')
    const r = sig.slice(0, 66) as Hex
    const s = (`0x${sig.slice(66, 130)}`) as Hex
    const vRaw = Number.parseInt(sig.slice(130, 132), 16)
    const v = vRaw < 27 ? vRaw + 27 : vRaw
    return { v, r, s }
}

function App() {
    const { address, isConnected } = useAccount()
    const chainId = useChainId()
    const { switchChainAsync } = useSwitchChain()

    const chainOptions = useMemo(() => listChains(), [])
    const tokenOptions = useMemo(() => listTokens(), [])

    const [srcChainKey, setSrcChainKey] = useState<RegistryChainKey>(DEFAULT_SOURCE_CHAIN)
    const [dstChainKey, setDstChainKey] = useState<RegistryChainKey>(DEFAULT_DEST_CHAIN)
    const [tokenKey, setTokenKey] = useState<RegistryTokenKey>(DEFAULT_TOKEN)

    const [to, setTo] = useState<string>('')
    const [amountHuman, setAmountHuman] = useState<string>('1.0')
    const [nativeFee, setNativeFee] = useState<bigint | null>(null)
    const [lastSignedTxHash, setLastSignedTxHash] = useState<string | null>(null)
    const [lastTaskId, setLastTaskId] = useState<string | null>(null)
    const [lastSignError, setLastSignError] = useState<string | null>(null)

    const srcChain = VIEM_CHAINS[srcChainKey]
    const dstChain = VIEM_CHAINS[dstChainKey]
    const srcChainId: number = srcChain.id
    const dstChainId: number = dstChain.id

    // We intentionally broadcast approve/send via wallet (writeContractAsync).

    const srcEid = getEid(srcChainKey)
    const dstEid = getEid(dstChainKey)
    const tokenDecimals = getTokenDecimals(tokenKey)
    const srcContracts = getTokenContracts(tokenKey, srcChainKey)
    const dstContracts = getTokenContracts(tokenKey, dstChainKey)

    const { data: walletClient } = useWalletClient({
        chainId: srcChainId,
        query: { enabled: isConnected },
    })

    const recipient: Address | null = useMemo(() => {
        const v = (to || address || '').trim()
        return v && v.startsWith('0x') && v.length === 42 ? (v as Address) : null
    }, [to, address])

    const amountLD: bigint | null = useMemo(() => {
        try {
            if (!amountHuman) return null
            return parseUnits(amountHuman, tokenDecimals)
        } catch {
            return null
        }
    }, [amountHuman, tokenDecimals])

    const sendParam = useMemo(() => {
        if (!recipient || !amountLD) return null
        return {
            dstEid: dstEid,
            to: addressToBytes32(recipient) as Hex,
            amountLD,
            minAmountLD: amountLD,
            // Options type 3 empty: 0x0003 (matches toolbox behavior when no extra options are set)
            extraOptions: '0x0003' as Hex,
            composeMsg: '0x' as Hex,
            oftCmd: '0x' as Hex,
        } as const
    }, [recipient, amountLD, dstEid])

    // ----- Source reads
    const srcToken = srcContracts.token
    const srcAdapter = srcContracts.adapter

    const { data: gateBalance } = useReadContract({
        abi: erc20Abi,
        address: srcToken,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        chainId: srcChainId,
        query: { enabled: !!address },
    })

    const { data: gateNativeBal } = useBalance({
        address,
        chainId: srcChainId,
        query: { enabled: !!address },
    })

    // ----- Destination reads
    const dstToken = dstContracts.token
    const dstAdapter = dstContracts.adapter

    const { data: sepoliaRecipientBal } = useReadContract({
        abi: erc20Abi,
        address: dstToken,
        functionName: 'balanceOf',
        args: recipient ? [recipient] : undefined,
        chainId: dstChainId,
        query: { enabled: !!recipient },
    })

    const { data: sepoliaAdapterBal } = useReadContract({
        abi: erc20Abi,
        address: dstToken,
        functionName: 'balanceOf',
        args: [dstAdapter],
        chainId: dstChainId,
        query: { enabled: true },
    })

    const hasDestLiquidity = (sepoliaAdapterBal ?? 0n) > 0n

    async function ensureOnSourceChain() {
        if (chainId !== srcChainId) {
            await switchChainAsync({ chainId: srcChainId })
        }
    }

    async function onSendWithPermit() {
        if (!address || !recipient || !sendParam || !amountLD) return
        await ensureOnSourceChain()
        setLastSignError(null)
        setLastSignedTxHash(null)
        setLastTaskId(null)

        try {
            if (!walletClient) {
                setLastSignError('Missing wallet client (connect wallet and switch to source chain)')
                return
            }

            // 1) Quote + build Permit typed-data via backend
            const resp = await fetch(`${INTENTS_SERVER_BASE_URL}/api/v0/bridge/permit/typed_data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    src_chain_key: srcChainKey,
                    dst_chain_key: dstChainKey,
                    token_key: tokenKey,
                    owner: address,
                    to: recipient,
                    amount_human: amountHuman,
                    min_amount_human: amountHuman,
                    pay_in_lz_token: false,
                    permit_ttl_seconds: 3600,
                }),
            })
            const json = (await resp.json()) as unknown as PermitTypedDataApiResponse
            if (!resp.ok || json.code !== 0 || !json.data) {
                throw new Error(json.reason || json.message || `Backend error (${resp.status})`)
            }
            const data = json.data

            const fee = {
                nativeFee: BigInt(data.fee.native_fee_wei),
                lzTokenFee: BigInt(data.fee.lz_token_fee_wei),
            } as const
            setNativeFee(fee.nativeFee)

            const bal = gateNativeBal?.value
            if (bal != null && bal <= fee.nativeFee) {
                throw new Error(
                    `Insufficient ${getChainMeta(srcChainKey).nativeCurrency.symbol}: need nativeFee (${formatUnits(fee.nativeFee, 18)}), have (${formatUnits(bal, 18)})`
                )
            }

            // 2) Sign Permit typed-data (EIP-2612)
            const permitValue = BigInt(data.permit.message.value)
            const permitNonce = BigInt(data.permit.message.nonce)
            const deadline = BigInt(data.permit.message.deadline)
            const signature = await walletClient.signTypedData({
                account: address,
                domain: {
                    name: data.permit.domain.name,
                    version: data.permit.domain.version ?? '1',
                    chainId: srcChainId,
                    verifyingContract: data.permit.domain.verifying_contract,
                },
                types: {
                    Permit: [
                        { name: 'owner', type: 'address' },
                        { name: 'spender', type: 'address' },
                        { name: 'value', type: 'uint256' },
                        { name: 'nonce', type: 'uint256' },
                        { name: 'deadline', type: 'uint256' },
                    ],
                },
                primaryType: 'Permit',
                message: {
                    owner: address,
                    spender: data.permit.message.spender,
                    value: permitValue,
                    nonce: permitNonce,
                    deadline,
                },
            })
            console.log('signature', signature)

            const { v, r, s } = splitEcdsaSignature(signature)

            // 3) Send everything to backend relayer: backend pays gas + nativeFee and submits sendWithPermit
            const relayResp = await fetch(`${INTENTS_SERVER_BASE_URL}/api/v0/bridge/tx/relay/send_with_permit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    src_chain_key: srcChainKey,
                    dst_chain_key: dstChainKey,
                    token_key: tokenKey,
                    owner: address,
                    to: recipient,
                    amount_human: amountHuman,
                    min_amount_human: amountHuman,
                    pay_in_lz_token: false,
                    permit: {
                        value: permitValue.toString(),
                        deadline: deadline.toString(),
                        v,
                        r,
                        s,
                    },
                }),
            })
            const relayJson = (await relayResp.json()) as unknown as {
                code: number
                message: string
                reason?: string
                data?: { task_id: string; tx_hash: string }
            }
            if (!relayResp.ok || relayJson.code !== 0 || !relayJson.data) {
                throw new Error(relayJson.reason || relayJson.message || `Backend relay error (${relayResp.status})`)
            }
            setLastTaskId(relayJson.data.task_id)
            setLastSignedTxHash(relayJson.data.tx_hash)
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            setLastSignError(msg)
        }
    }

    const canPayNativeFee = useMemo(() => {
        if (nativeFee == null) return true // unknown/not quoted yet
        const bal = gateNativeBal?.value
        if (bal == null) return true // unknown; let wallet decide
        // Need msg.value + gas, so require strictly more than nativeFee
        return bal > nativeFee
    }, [gateNativeBal?.value, nativeFee])

  return (
        <div style={{ maxWidth: 920, margin: '0 auto', padding: 24, textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                    <h2 style={{ margin: 0 }}>OFT-Adapter Cross-chain</h2>
                    <div style={{ opacity: 0.7, marginTop: 6 }}>
                        Source: {getChainMeta(srcChainKey).name} (EID {srcEid}) → Destination: {getChainMeta(dstChainKey).name} (EID{' '}
                        {dstEid}) — Token: {tokenKey}
                    </div>
                </div>
                <ConnectButton />
            </div>

            <div className="card" style={{ marginTop: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <label>
                        Source chain
                        <select
                            style={{ width: '100%', marginTop: 6, padding: 10 }}
                            value={srcChainKey}
                            onChange={(e) => setSrcChainKey(e.target.value as RegistryChainKey)}
                        >
                            {chainOptions.map((k) => (
                                <option key={k} value={k}>
                                    {getChainMeta(k).name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Destination chain
                        <select
                            style={{ width: '100%', marginTop: 6, padding: 10 }}
                            value={dstChainKey}
                            onChange={(e) => setDstChainKey(e.target.value as RegistryChainKey)}
                        >
                            {chainOptions.map((k) => (
                                <option key={k} value={k}>
                                    {getChainMeta(k).name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Token
                        <select
                            style={{ width: '100%', marginTop: 6, padding: 10 }}
                            value={tokenKey}
                            onChange={(e) => setTokenKey(e.target.value as RegistryTokenKey)}
                        >
                            {tokenOptions.map((k) => (
                                <option key={k} value={k}>
                                    {k}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            <div className="card" style={{ marginTop: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                        <div style={{ fontWeight: 600 }}>Source</div>
                        <div style={{ marginTop: 6 }}>
                            - Token: <code>{srcToken}</code>
                        </div>
                        <div>
                            - Adapter: <code>{srcAdapter}</code>
                        </div>
                        <div style={{ marginTop: 8 }}>
                            - Your balance: <b>{gateBalance != null ? formatUnits(gateBalance, tokenDecimals) : '-'}</b> {tokenKey}
                        </div>
                    </div>

                    <div>
                        <div style={{ fontWeight: 600 }}>Destination</div>
                        <div style={{ marginTop: 6 }}>
                            - Token: <code>{dstToken}</code>
                        </div>
                        <div>
                            - Adapter: <code>{dstAdapter}</code>
                        </div>
                        <div style={{ marginTop: 8 }}>
                            - Recipient balance:{' '}
                            <b>{sepoliaRecipientBal != null ? formatUnits(sepoliaRecipientBal, tokenDecimals) : '-'}</b> {tokenKey}
                        </div>
      <div>
                            - Adapter liquidity:{' '}
                            <b>{sepoliaAdapterBal != null ? formatUnits(sepoliaAdapterBal, tokenDecimals) : '-'}</b> {tokenKey}
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
                        Amount ({tokenKey}, {tokenDecimals} decimals)
                        <input
                            style={{ width: '100%', marginTop: 6, padding: 10 }}
                            value={amountHuman}
                            onChange={(e) => setAmountHuman(e.target.value)}
                        />
                    </label>
      </div>

                <div style={{ marginTop: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <button disabled={!address || !sendParam || !amountLD || !canPayNativeFee} onClick={onSendWithPermit}>
                        Send with Permit (quote + sign + send)
                    </button>
                </div>

                <div style={{ marginTop: 10, opacity: 0.8 }}>
                    - Native fee:{' '}
                    <b>{nativeFee != null ? `${formatUnits(nativeFee, 18)} ${getChainMeta(srcChainKey).nativeCurrency.symbol}` : '-'}</b>
                </div>
                <div style={{ marginTop: 6, opacity: 0.8 }}>
                    - Your {getChainMeta(srcChainKey).nativeCurrency.symbol} balance:{' '}
                    <b>{gateNativeBal ? `${gateNativeBal.formatted} ${gateNativeBal.symbol}` : '-'}</b>
                </div>
                {!canPayNativeFee && nativeFee != null && (
                    <div style={{ marginTop: 10, color: '#ff6b6b' }}>
                        Insufficient {getChainMeta(srcChainKey).nativeCurrency.symbol} to pay <b>nativeFee</b> + gas on source chain.
                    </div>
                )}

                {lastSignedTxHash && (
                    <div style={{ marginTop: 10 }}>
                        - Source tx hash: <code>{lastSignedTxHash}</code>
                    </div>
                )}
                {lastTaskId && (
                    <div style={{ marginTop: 10 }}>
                        - Backend task id: <code>{lastTaskId}</code>
                    </div>
                )}

                {lastSignError && (
                    <div style={{ marginTop: 10, color: '#ff6b6b' }}>
                        Sign error: <code>{lastSignError}</code>
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
