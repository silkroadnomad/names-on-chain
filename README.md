# Names-On-Chain 
### A Doichain - PSBT Workshop

## Description
This 4-step workshop is intended to showcase how you can register and show Doichain names. 
How to create and sign NameOp transactions via PSBT-QR-Codes and PSBT-File.
PSBTs can be scanned (by DoiWallet) or imported (into the ElectrumDOI wallet).
See: ipfs://QmZmvtgcxNof3QvKgC73SmbDawHCwxTnkMpWukTLokcgHS/ 

### Step 1)
0. Clone this repo and run ```npm i``` 
1. Connect to ElectrumX in src/routes/+layout.js
2. Validate name to be registered in src/lib/components/pricing.svelte
   - is name already registered? 
   - if yes - which address?
3. Build project and add to local ipfs node
```
npm run build
ipfs add public/
```
4. Run Brave browser an open ipfs url: ipfs://{cid of your ipfs add command}
5. Checkout Step 2)