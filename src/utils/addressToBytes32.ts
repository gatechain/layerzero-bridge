import type { Address, Hex } from 'viem'

/**
 * Left-pad a 20-byte EVM address to bytes32 (LayerZero uses bytes32 for recipient).
 */
export function addressToBytes32(addr: Address): Hex {
    const hex = addr.toLowerCase() as Hex
    // remove 0x, pad to 64 chars, then re-add 0x
    return (`0x${hex.slice(2).padStart(64, '0')}`) as Hex
}


