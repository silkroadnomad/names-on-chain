# Names-On-Chain 
### A Doichain - PSBT Workshop

## Description
This 3-step workshop is intended to showcase how you can register and show Doichain names and sign them via PSBT-QR-Code or PSBT-File, 
which can be scanned (by DoiWallet) or imported (into the ElectrumDOI wallet).

### Step 1)
0. Clone this repo and run ```npm i``` 
1. Connect to ElectrumX in +layout.js
2. Validate name to be registered in pricing.svelte
   - is name already registered? 
   - if yes - which address?
3. Build project and add to local ipfs node
```
npm run build
ipfs add public/
```
4. Run Brave browser an open ipfs url: ipfs://{cid of your ipfs add command}