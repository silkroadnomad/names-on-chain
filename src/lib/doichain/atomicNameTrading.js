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
 * @param ownerOfName a flag which indicates that we are the owner of that name. In such case we don't sign a funding input, only the input of name_op to transfer
 * @param nameExists flag indicating if name exists on the blockchain
 * @param transferPrice the amount in DOI to transfer to the seller
 * @param storageFee the fee in swartz necessary to store a new name onto the blockchain
 * @returns {Promise<void>}
 */
export const generateAtomicNameTradingPSBT = async (name, fundingUtxoAddresses, nameOpTxs, ownerOfName, nameExists, transferPrice, storageFee, network) => {
    console.log("generateAtomicNameTradingPSBT", {
        name,
        fundingUtxoAddresses,
        nameOpTxs,
        ownerOfName,
        nameExists,
        transferPrice,
        storageFee,
        network
    });
    if(!nameExists) return
    if(!fundingUtxoAddresses || fundingUtxoAddresses.length === 0) return
    if(!nameOpTxs || nameOpTxs.length === 0) return
    if(transferPrice<0) return

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
    const filteredNameOpTxs = nameOpTxs.filter(tx => tx.nameOp.name === name);
    console.log("generateAtomicNameTradingPSBT:filteredNameOpTxs", filteredNameOpTxs)
    if(!filteredNameOpTxs || filteredNameOpTxs.length === 0) return

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
    
    // Set the version for name operations
    psbt.setVersion(VERSION);

    if(!ownerOfName){
        fundingUtxoAddresses.forEach(utxo => {
            console.log("fundingUtxoAddresses->",utxo)
            console.log("utxo.fullTx.scriptPubKey.type",utxo?.fullTx?.scriptPubKey?.type)
            // if (!utxo.scriptPubKey.nameOp) {
            const scriptPubKeyHex = utxo.hex;
            const isSegWit = utxo?.scriptPubKey?.type === "witness_v0_keyhash" || scriptPubKeyHex?.startsWith('0014') || scriptPubKeyHex?.startsWith('0020');
            // const isSegWit =  scriptPubKeyHex?.startsWith('0014') || scriptPubKeyHex?.startsWith('0020');
            if (isSegWit) {
                console.log("adding segwit coin utxo as input",utxo)
                psbt.addInput({
                    hash: utxo.hash,
                    index: utxo.n,
                    witnessUtxo: {
                        script: Buffer.from(utxo.scriptPubKey.hex, 'hex'),
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
            // }
        })
    }

    filteredNameOpTxs.forEach(utxo => {
        console.log("filteredNameOpTxs->",utxo)
        console.log("utxo.fullTx.scriptPubKey.type",utxo?.fullTx?.scriptPubKey?.type)
        const scriptPubKeyHex = utxo.hex;
        const isSegWit = utxo?.scriptPubKey?.type === "witness_v0_keyhash" || scriptPubKeyHex?.startsWith('0014') || scriptPubKeyHex?.startsWith('0020');

        // const isSegWit = scriptPubKeyHex?.startsWith('0014') || scriptPubKeyHex?.startsWith('0020');
        
        const input = {
            hash: utxo.hash,
            index: utxo.n,
            sequence: 0xfffffffe, // Enable RBF
        };

        if (isSegWit) {
            console.log("adding segwit name_op as input", utxo);
            input.witnessUtxo = {
                script: Buffer.from(utxo.scriptPubKey.hex, 'hex'),
                value: Math.floor(utxo.value),
            };
            if (utxo.witnessScript) {
                input.witnessScript = Buffer.from(utxo.witnessScript, 'hex');
            }
        } else {
            console.log("adding non-segwit name_op as input", utxo);
            input.nonWitnessUtxo = Buffer.from(utxo.hex, 'hex');
        }

        if (utxo.redeemScript) {
            input.redeemScript = Buffer.from(utxo.redeemScript, 'hex');
        }

        psbt.addInput(input);
        totalInputAmount += Math.floor(utxo.value);
    })
    if( _transferPrice < 0 ) return
    // console.log("_transferPrice",_transferPrice)
    //add coin output which pays the transfer price to Alice
    psbt.addOutput({
        address: sellerAddress,
        value: _transferPrice
    });
    console.log("added transferPrice to psbt", _transferPrice)
    totalOutputAmount = totalOutputAmount + _transferPrice;

    //add change output which pays back totalInputAmount-storageFee-miningFee-transferPrice to the buyer
    if(!ownerOfName){ //don't add  change if we don't know the buyer address
        const transactionFee = getTransactionFee(fundingUtxoAddresses.length+1)
        console.log("transactionFee", transactionFee)
        const changeAmount = Math.floor(totalInputAmount - storageFee - transactionFee - _transferPrice)
        if (changeAmount < 0) {
            console.error("Error: Negative change amount calculated")
            return // or throw an error, depending on how you want to handle this situation
        }
        psbt.addOutput({
            address: changeAddress,
            value: changeAmount
        });
        console.log("added changeAmount to psbt", changeAmount)
        totalOutputAmount = totalOutputAmount + changeAmount;

        //add name op output which goes to the seller
        try {
            const opCodesStackScript = getNameOPStackScript(name, ' ', buyerAddress, network);
            psbt.addOutput({
                script: opCodesStackScript,
                value: storageFee
            });
            totalOutputAmount += storageFee;
        } catch( ex ) { console.error(ex) }
    }

    console.log(`added nameOp ${name} storageFee to psbt`, storageFee);
    console.log("totalInputAmount",totalInputAmount)
    console.log("totalOutputAmount",totalOutputAmount)

    const psbtFile = psbt.toBase64();
    // const psbtFile = psbt.extractTransaction()
    console.log("generateAtomicNameTradingPSBT:psbt",psbtFile)
    return psbtFile
}