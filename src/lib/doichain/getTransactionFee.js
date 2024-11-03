
/**
 * TransactionFee
 * //TODO read fee from network
 * @returns {number}
 */
export const getTransactionFee = (utxoAmount) => {
    const feeRate = 34 * 500; // TODO: get feeRate from electrumx
    const transactionFee = (utxoAmount + 1) * 180 + 3 * feeRate;
    return transactionFee;
}


