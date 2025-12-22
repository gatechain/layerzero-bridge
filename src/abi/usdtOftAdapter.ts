export const usdtOftAdapterAbi = [
    {
        type: 'function',
        name: 'token',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'address' }],
    },
    {
        type: 'function',
        name: 'approvalRequired',
        stateMutability: 'pure',
        inputs: [],
        outputs: [{ type: 'bool' }],
    },
    {
        type: 'function',
        name: 'quoteSend',
        stateMutability: 'view',
        inputs: [
            {
                name: '_sendParam',
                type: 'tuple',
                components: [
                    { name: 'dstEid', type: 'uint32' },
                    { name: 'to', type: 'bytes32' },
                    { name: 'amountLD', type: 'uint256' },
                    { name: 'minAmountLD', type: 'uint256' },
                    { name: 'extraOptions', type: 'bytes' },
                    { name: 'composeMsg', type: 'bytes' },
                    { name: 'oftCmd', type: 'bytes' },
                ],
            },
            { name: '_payInLzToken', type: 'bool' },
        ],
        outputs: [
            {
                name: 'msgFee',
                type: 'tuple',
                components: [
                    { name: 'nativeFee', type: 'uint256' },
                    { name: 'lzTokenFee', type: 'uint256' },
                ],
            },
        ],
    },
    {
        type: 'function',
        name: 'send',
        stateMutability: 'payable',
        inputs: [
            {
                name: '_sendParam',
                type: 'tuple',
                components: [
                    { name: 'dstEid', type: 'uint32' },
                    { name: 'to', type: 'bytes32' },
                    { name: 'amountLD', type: 'uint256' },
                    { name: 'minAmountLD', type: 'uint256' },
                    { name: 'extraOptions', type: 'bytes' },
                    { name: 'composeMsg', type: 'bytes' },
                    { name: 'oftCmd', type: 'bytes' },
                ],
            },
            {
                name: '_fee',
                type: 'tuple',
                components: [
                    { name: 'nativeFee', type: 'uint256' },
                    { name: 'lzTokenFee', type: 'uint256' },
                ],
            },
            { name: '_refundAddress', type: 'address' },
        ],
        outputs: [
            {
                name: 'msgReceipt',
                type: 'tuple',
                components: [
                    { name: 'guid', type: 'bytes32' },
                    { name: 'nonce', type: 'uint64' },
                    {
                        name: 'fee',
                        type: 'tuple',
                        components: [
                            { name: 'nativeFee', type: 'uint256' },
                            { name: 'lzTokenFee', type: 'uint256' },
                        ],
                    },
                ],
            },
            {
                name: 'oftReceipt',
                type: 'tuple',
                components: [
                    { name: 'amountSentLD', type: 'uint256' },
                    { name: 'amountReceivedLD', type: 'uint256' },
                ],
            },
        ],
    },
] as const


