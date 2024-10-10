import { getUTXOSFromAddress } from "./nameDoi.js";

/**
 * Retrieves UTXOs and name operations associated with a Doichain address
 *
 * @async
 * @param {Object} electrumClient - The Electrum client instance
 * @param {string} doichainAddress - The Doichain address to query
 * @returns {Promise<Object>} An object containing UTXO and name operation data
 * @property {Array<string>} nameOpTxs - List of name operation transactions
 * @property {Array<Object>} utxoAddresses - List of UTXO details
 * @property {number} totalUtxoValue - Sum of all UTXO values
 * @throws {Error} If there's an issue querying the Electrum server
 *
 * @example
 * const result = await getUtxosAndNamesOfAddress(electrumClient, 'DKj2jL8Ns3eWjgXbwPrLwZ');
 */
export async function getUtxosAndNamesOfAddress(electrumClient, doichainAddress) {
    let nameOpTxs = []
    let utxoAddresses = []
    let totalUtxoValue = 0
    const result = await getUTXOSFromAddress(electrumClient, doichainAddress)
    for (let utxo of result) {
        const scriptPubKey = utxo.fullTx.scriptPubKey;
        console.log("scriptPubKey?.nameOp",utxo)
        if (!scriptPubKey?.nameOp) {
            utxoAddresses.push({
                formattedBlocktime: utxo.fullTx.formattedBlocktime,
                txid: utxo.fullTx.txid,
                hex: utxo.fullTx.hex,
                scriptPubKey: utxo.fullTx.scriptPubKey,
                hash: utxo.tx_hash,
                n: utxo.tx_pos,
                value: utxo.value,
                height: utxo.height,
                address: utxo.fullTx?.scriptPubKey?.addresses[0]})
        } else {
            nameOpTxs.push({
                name: scriptPubKey.nameOp.name,
                nameValue: scriptPubKey.nameOp.value,
                expires: utxo.height+36000,
                txid: utxo.fullTx.txid,
                hex: utxo.fullTx.hex,
                scriptPubKey: utxo.fullTx.scriptPubKey,
                hash: utxo.tx_hash,
                n: utxo.tx_pos,
                value: utxo.value,
                height: utxo.height,
                address: utxo.fullTx?.scriptPubKey?.addresses[0]
            })
        }
        totalUtxoValue+=utxo.value;
    }
    return { nameOpTxs, utxoAddresses, totalUtxoValue }
}