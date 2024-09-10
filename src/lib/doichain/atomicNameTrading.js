import { Psbt } from "bitcoinjs-lib";
import { VERSION } from "$lib/doichain/doichain.js";
import sb from "satoshi-bitcoin";
import { getTransactionFee } from "$lib/doichain/getTransactionFee.js";
import { getNameOPStackScript } from "$lib/doichain/getNameOPStackScript.js";

/**
 * 
 * @param name the name we want to sell/buy
 * @param fundingUtxoAddresses the utxos of the paying party (buyer) - Bob
 * @param nameOpTxs the nameOpUtxos of the transferring party (seller) - Alice (owner of the n
 * @param ownerOfName the address which owns the name
 * @param nameExists flag indicating if name exists on the blockchain
 * @param transferPrice the amount in DOI to transfer to the seller
 * @param storageFee the fee in swartz necesssary to store a new name onto the blockchain
 * @returns {Promise<void>}
 */
export const generateAtomicNameTradingPSBT = async (name, fundingUtxoAddresses, nameOpTxs, ownerOfName, nameExists, transferPrice, storageFee, network) => {
    if(!nameExists) return
    if(!fundingUtxoAddresses || fundingUtxoAddresses.length===0) return
    if(!nameOpTxs || nameOpTxs.length===0) return

    let _transferPrice = 0

    try {
        _transferPrice = sb.toSatoshi(transferPrice)
        console.log("_transferPrice in swartz", _transferPrice)
    } catch(ex) {
        console.log("transferPrice incorrect", transferPrice)
        return
    }

    console.log("generateAtomicNameTradingPSBT:name", name)
    console.log("generateAtomicNameTradingPSBT:utxoAddresses", fundingUtxoAddresses)
    console.log("generateAtomicNameTradingPSBT:nameOpTxs", nameOpTxs)
    console.log("generateAtomicNameTradingPSBT:ownerOfName", ownerOfName)
    console.log("generateAtomicNameTradingPSBT:nameExists", nameExists)

    // Filter nameOpTxs to include only transactions for the specified name
    const filteredNameOpTxs = nameOpTxs.filter(tx => tx.name === name);
    console.log("generateAtomicNameTradingPSBT:filteredNameOpTxs", filteredNameOpTxs)

    const sellerAddress = filteredNameOpTxs[0].address
    console.log("sellerAddress", sellerAddress)

    const changeAddress = fundingUtxoAddresses[0].address //TODO generate a new changeAddress
    const buyerAddress = changeAddress
    console.log("changeAddress", changeAddress)

    //1. Get the name_op input data
    //2. If Bob creates the buy offer add his coin inputs
    let totalInputAmount = 0;
    let totalOutputAmount = 0;
    const psbt = new Psbt({ network: network });
    fundingUtxoAddresses.forEach(utxo => {
        const scriptPubKeyHex = utxo.hex;
        const isSegWit = scriptPubKeyHex?.startsWith('0014') || scriptPubKeyHex?.startsWith('0020');
        if (isSegWit) {
            console.log("adding segwit coin utxo as input",utxo)
            psbt.addInput({
                hash: utxo.hash,
                index: utxo.n,
                witnessUtxo: {
                    script: Buffer.from(utxo.hex, 'hex'),
                    value: utxo.value,
                }
            });
        } else {
            console.log("adding non-segwit coin utxo as input",utxo)
            psbt.addInput({
                hash: utxo.hash,
                index: utxo.n,
                nonWitnessUtxo: Buffer.from(utxo.hex, 'hex')
            });
        }
        totalInputAmount += utxo.value;
    })

    filteredNameOpTxs.forEach(utxo => {
        const scriptPubKeyHex = utxo.hex;
        const isSegWit = scriptPubKeyHex?.startsWith('0014') || scriptPubKeyHex?.startsWith('0020');
        if (isSegWit) {
            console.log("adding segwit name_op as input", utxo)
            psbt.addInput({
                hash: utxo.hash,
                index: utxo.n,
                witnessUtxo: {
                    script: Buffer.from(utxo.hex, 'hex'),
                    value: utxo.value,
                }
            });
        } else {
            console.log("adding non-segwit name_op as input", utxo)
            psbt.addInput({
                hash: utxo.hash,
                index: utxo.n,
                nonWitnessUtxo: Buffer.from(utxo.hex, 'hex')
            });
        }
        totalInputAmount += utxo.value;
    });

    //add coin output which pays the transfer price to Alice
    psbt.addOutput({
        address: sellerAddress,
        value: _transferPrice
    });
    console.log("added transferPrice to psbt", _transferPrice)
    totalOutputAmount = totalOutputAmount + _transferPrice;

    //add change output which pays back totalInputAmount-storageFee-miningFee-transferPrice to the buyer
    const transactionFee = getTransactionFee(fundingUtxoAddresses.length+1)
    const changeAmount = totalInputAmount-storageFee-transactionFee-_transferPrice
    psbt.addOutput({
        address: changeAddress,
        value: changeAmount
    });
    console.log("added changeAmount to psbt", changeAmount)
    totalOutputAmount = totalOutputAmount + changeAmount;

    //add name op output which goes to the seller
    try {
        const opCodesStackScript = getNameOPStackScript(name, ' ', buyerAddress, network);
        psbt.setVersion(VERSION); // for name transactions
        psbt.addOutput({
            script: opCodesStackScript,
            value: storageFee
        });
        totalOutputAmount += storageFee;
    } catch( ex ) { console.error(ex) }
    console.log(`added nameOp ${name} storageFee to psbt`, storageFee);
    console.log("totalInputAmount",totalInputAmount)
    console.log("totalOutputAmount",totalOutputAmount)
    const psbtFile = psbt.toBase64();
    // const psbtFile = psbt.extractTransaction()
    console.log("generateAtomicNameTradingPSBT:psbt",psbtFile)
    return psbtFile
}