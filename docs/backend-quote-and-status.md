# Backend API notes: quoting fees + tracking completion

This document explains how `src/App.tsx` interacts with the OFT Adapter contracts, and how to move **read-only** parts (quoting fees, polling destination events) into a backend API.

## What `App.tsx` does on-chain

The core contract interaction data structure is `sendParam` in `src/App.tsx`:

```73:85:examples/oft-adapter-frontend/src/App.tsx
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
```

- `dstEid`: destination LayerZero endpoint id (EID)
- `to`: recipient address padded to `bytes32`
- `amountLD`: amount in local decimals (“LD”), derived from `amountHuman` + token decimals
- `minAmountLD`: slippage minimum (demo uses equal to `amountLD`)
- `extraOptions/composeMsg/oftCmd`: advanced options; demo uses the simplest defaults

Then the flow is:

1. **Approve** (write): `ERC20.approve(adapter, amountLD)` so the adapter can `transferFrom(msg.sender, ...)` when sending.
2. **Quote** (read): `adapter.quoteSend(sendParam, payInLzToken=false)` to get the message fee.
3. **Send** (write): `adapter.send(sendParam, fee, refundAddress)` and attach `value = nativeFee`.

In code:

```157:182:examples/oft-adapter-frontend/src/App.tsx
    async function onQuote() {
        if (!sendParam) return
        await ensureOnSourceChain()
        const msgFee = (await readContract(wagmiConfig, {
            abi: usdtOftAdapterAbi,
            address: srcAdapter,
            functionName: 'quoteSend',
            args: [sendParam, false],
            chainId: srcChainId,
        })) as { nativeFee: bigint; lzTokenFee: bigint }
        setNativeFee(msgFee.nativeFee)
    }

    async function onSend() {
        if (!address || !sendParam || nativeFee == null) return
        await ensureOnSourceChain()
        const txHash = await writeContractAsync({
            abi: usdtOftAdapterAbi,
            address: srcAdapter,
            functionName: 'send',
            args: [sendParam, { nativeFee, lzTokenFee: 0n }, address],
            value: nativeFee,
        })
        setLastSrcTx(txHash)
        setNativeFee(null)
    }
```

## Backend API: quote send fee (`quoteSend`)

If you want the backend to compute the fee, you can move step (2) to an API endpoint.

### Endpoint

`POST /api/oft/quote-send`

### Request body (recommended)

The backend should resolve chain/token/contract addresses from a **server-side registry** (white-list), not from client-provided RPC URLs or contract addresses.

Minimal request:

```json
{
  "srcChainKey": "gate-testnet",
  "dstChainKey": "sepolia",
  "tokenKey": "USDT",
  "to": "0xYourRecipient",
  "amountHuman": "1.0"
}
```

Optional fields (if you need flexibility):

```json
{
  "minAmountHuman": "1.0",
  "extraOptions": "0x0003",
  "composeMsg": "0x",
  "oftCmd": "0x",
  "payInLzToken": false
}
```

### Backend behavior

- Validate:
  - `srcChainKey`, `dstChainKey`, `tokenKey` are supported by the server registry
  - `to` is a valid `0x` address
  - `amountHuman` parses with token decimals
- Build `sendParam` exactly like the frontend:
  - `amountLD = parseUnits(amountHuman, decimals)`
  - `toBytes32 = addressToBytes32(to)`
- Call `adapter.quoteSend(sendParam, payInLzToken)` using a public RPC for `srcChainKey`.

### Response body

Because JSON cannot safely represent `bigint`, return amounts as strings:

```json
{
  "ok": true,
  "fee": {
    "nativeFeeWei": "1234567890000000",
    "lzTokenFeeWei": "0"
  },
  "resolved": {
    "srcChainKey": "gate-testnet",
    "dstChainKey": "sepolia",
    "tokenKey": "USDT",
    "srcAdapter": "0xAdapterOnSource",
    "tokenDecimals": 6,
    "sendParam": {
      "dstEid": 40161,
      "to": "0x...(bytes32)",
      "amountLD": "1000000",
      "minAmountLD": "1000000",
      "extraOptions": "0x0003",
      "composeMsg": "0x",
      "oftCmd": "0x"
    }
  }
}
```

## Backend API: poll destination completion via `OFTReceived(guid, ...)`

To know if a cross-chain send is “fully completed” without a database, you can poll destination logs for the adapter’s `OFTReceived` event using `guid`.

### “But the frontend only has `srcTxHash`”

That’s normal: `writeContractAsync(...)` returns only the transaction hash.

Your backend can derive `guid` from `srcTxHash` by:

1. Fetching the **source chain** tx receipt (`eth_getTransactionReceipt`).
2. Decoding the **source adapter** log `OFTSent(bytes32 guid, ...)` and reading `guid` from it.

This is the recommended approach because `OFTSent` is emitted by the OFT core logic immediately after `_lzSend(...)` returns the LayerZero `MessagingReceipt` (which contains `guid`).

> Alternative (more low-level): decode the source Endpoint’s `PacketSent(bytes encodedPayload, ...)` event and extract `guid` from the payload. This works, but is more complex than reading `OFTSent`.

### Endpoint

Recommended (accept `srcTxHash`, backend resolves `guid`):

`GET /api/oft/status?srcChainKey=gate-testnet&dstChainKey=sepolia&tokenKey=USDT&srcTxHash=0x...`

Optional advanced form (if client already knows `guid`):

`GET /api/oft/status?dstChainKey=sepolia&tokenKey=USDT&guid=0x...&fromBlock=...&toBlock=...`

### Required query params

- `srcChainKey`: source chain key (server registry) — required if you pass `srcTxHash`
- `dstChainKey`: destination chain key (server registry)
- `tokenKey`: token key (server registry)
- One of:
  - `srcTxHash`: the source chain transaction hash (preferred)
  - `guid`: `bytes32` message id (32 bytes hex)

### Optional query params

- `fromBlock`: default to a “recent window” to avoid scanning the whole chain
- `toBlock`: default `latest`

### Response body

```json
{
  "ok": true,
  "status": "completed",
  "found": true,
  "event": {
    "guid": "0x...",
    "srcEid": 40421,
    "toAddress": "0xRecipient",
    "amountReceivedLD": "1000000",
    "blockNumber": 123456,
    "transactionHash": "0xDstTx"
  }
}
```

If not found in the queried block range:

```json
{
  "ok": true,
  "status": "inflight",
  "found": false
}
```

### Security note (important)

For both endpoints:

- Do **not** accept arbitrary `rpcUrl` or `adapter` from the client.
- Use a server-side registry (or a hard-coded allow-list) to resolve RPC + contract addresses.


