# What is `endpointAddress` (LayerZero EndpointV2)?

In this repo, **`endpointAddress` means the LayerZero core contract address on a given chain**:

- **LayerZero Endpoint V2 (EVM)**: `ILayerZeroEndpointV2`
- Your OApp / OFT Adapter calls it to:
  - quote fees (`endpoint.quote(...)`)
  - send messages (`endpoint.send(...)`)
  - receive delivery (`endpoint.lzReceive(...)` is called by executor and then forwards into your OApp)

## Where it appears in this project

Your `USDTOFTAdapter` constructor takes `_lzEndpoint`:

```14:22:contracts/USDTOFTAdapter.sol
contract USDTOFTAdapter is OFTAdapter {
    constructor(
        address _usdtToken,      // USDT token address on this chain
        address _lzEndpoint,     // LayerZero endpoint address
        address _delegate        // Owner/admin address
    ) OFTAdapter(_usdtToken, _lzEndpoint, _delegate) Ownable(_delegate) {
        // No additional initialization needed
    }
}
```

And the deploy script resolves the chain’s EndpointV2 address via `deployments.get('EndpointV2')` (provided by the LayerZero toolbox/hardhat-deploy integration):

```18:55:deploy/USDTOFTAdapter.ts
    // Get LayerZero EndpointV2 address (automatically resolved by toolbox based on eid)
    const endpointV2Deployment = await hre.deployments.get('EndpointV2')
    // ...
    console.log(`LayerZero EndpointV2: ${endpointV2Deployment.address}`)
    // ...
    const { address } = await deploy(contractName, {
        from: deployer,
        args: [
            usdtAddress,                    // USDT token address
            endpointV2Deployment.address,  // LayerZero EndpointV2 address
            deployer,                       // owner/delegate
        ],
        log: true,
        skipIfAlreadyDeployed: false,
    })
```

So:

- `endpointAddress` is **NOT** your adapter address.
- It is **the protocol endpoint contract address** on that chain (different per chain, per environment).

## Why backends sometimes need `endpointAddress`

If you only want a “business-level success” signal for OFT transfers, the simplest criterion is:

- **Completed** = destination adapter emitted `OFTReceived(guid, ...)`.

But if you want richer status and debugging (e.g. why it’s stuck / why it failed), you will also query **Endpoint** events, especially:

- `PacketVerified(...)` (DVN/commit phase done)
- `PacketDelivered(...)` (delivered/executed phase)
- `LzReceiveAlert(...)` (**destination execution reverted**; includes revert `reason`)

These events are defined on the Endpoint interface:

```35:57:node_modules/@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol
interface ILayerZeroEndpointV2 is IMessageLibManager, IMessagingComposer, IMessagingChannel, IMessagingContext {
    event PacketSent(bytes encodedPayload, bytes options, address sendLibrary);

    event PacketVerified(Origin origin, address receiver, bytes32 payloadHash);

    event PacketDelivered(Origin origin, address receiver);

    event LzReceiveAlert(
        address indexed receiver,
        address indexed executor,
        Origin origin,
        bytes32 guid,
        uint256 gas,
        uint256 value,
        bytes message,
        bytes extraData,
        bytes reason
    );
    // ...
}
```

## How to obtain the endpoint address (practically)

- **From Hardhat (recommended in this repo)**:
  - any script/task can do `await hre.deployments.get('EndpointV2')` on that network
  - the deploy script already prints it: `LayerZero EndpointV2: 0x...`
- **From LayerZero official metadata / definitions**:
  - endpoints are part of the chain metadata LayerZero publishes (what your `layerzero.config.ts` metadata tooling is based on)

> For most frontend-only “did my OFT arrive?” UI, you can ignore `endpointAddress` and just poll destination `OFTReceived(guid, ...)`.
> For a backend status API that explains *why* something is stuck/failed, you typically include both:
> - destination adapter address (OFTReceived)
> - destination endpoint address (LzReceiveAlert / protocol-level progress)


