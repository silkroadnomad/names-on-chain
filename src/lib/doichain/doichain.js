export const DOICHAIN = {
    name: 'doichain-mainnet',
    messagePrefix: '\x19Doichain Signed Message:\n',
    bech32: 'dc',
    bip32: {
        public: 0x0488b21e,
        private: 0x0488ade4
    },
    pubKeyHash: 52, //D=30 d=90 (52=M) https://en.bitcoin.it/wiki/List_of_address_prefixes
    scriptHash: 13,
    wif: 180, //???
};

export const DOICHAIN_TESTNET = {
    name: 'doichain-testnet',
    messagePrefix: '\x19Doichain-Testnet Signed Message:\n',
    bech32: 'td',
    bip32: {
        public: 0x043587CF,
        private: 0x04358394
    },
    pubKeyHash: 111, //D=30 d=90 (52=N) (111=m/n) https://en.bitcoin.it/wiki/List_of_address_prefixes
    scriptHash: 196,
    wif: 239, //???
};

export const DOICHAIN_REGTEST = {
    name: "doichain-regtest",
    messagePrefix: "\x19Doichain-Regtest Signed Message:\n",
    bech32: "ncrt",
    bip32: {
        public: 0x043587cf,
        private: 0x04358394,
    },
    pubKeyHash: 111,
    scriptHash: 196,
    wif: 239,
};

import sb from 'satoshi-bitcoin'

export const VERSION = 0x7100

export const NETWORK_FEE = {
    btc: 0.01,
    satoshis: sb.toSatoshi(0.01)
}
// //0.01 for DOI storage, 0.01 DOI for reward for validator, 0.01 revokation reserved
// export const VALIDATOR_FEE = {
//     btc: 0.03,
//     satoshis: sb.toSatoshi(0.03)
// }
// //0.01 for Email Verification storage, 0.01 DOI for reward for validator
// export const EMAIL_VERIFICATION_FEE = {
//     btc: 0.02,
//     satoshis:sb.toSatoshi(0.02)
// }
// this is the tx fee itself
export const TRANSACTION_FEE = {
    btc: 0.005,
    satoshis: sb.toSatoshi(0.005)
}

export const toSchwartz = (doicoin) => sb.toSatoshi(doicoin)
export const toDOI = (schwartz) => sb.toBitcoin(schwartz)