<script>
    import { nameShow } from "$lib/doichain/nameShow.js";
    import { electrumClient, network, connectedServer, scanOpen } from "../doichain/doichain-store.js";
    import { getUTXOSFromAddress} from "$lib/doichain/nameDoi.js";
    import { getNameOPStackScript } from "$lib/doichain/getNameOPStackScript.js"
    import { renderBBQR, renderBCUR } from "$lib/doichain/renderQR.js";
    import { VERSION } from "$lib/doichain/doichain.js";
    import ScanModal from "$lib/doichain/ScanModal.svelte";
    import sb from "satoshi-bitcoin";
    import { Psbt } from "bitcoinjs-lib";
    import {onDestroy} from "svelte";

    let names = ''
    let storageFee = 1000000
    let totalAmount = 0
    let nameErrorMessage = '';
    let utxoErrorMessage = ''
    let nameCount = 0;

    let currentNameAddress
    let isNameValid = true;
    let isUTXOAddressValid = true;
    let validNames = [];
    let utxoAddresses = []
    let totalUtxoValue = 0;
    let bbqr =  localStorage.getItem('bbqr') || false;
    let doichainAddress = localStorage.getItem('doichainAddress') || '';
    let recipientAddress = doichainAddress
    let changeAddress = doichainAddress
    let transactionFee = 0
    let serviceFee = 100000000
    let changeAmount = 0;
    let psbtBaseText;
    let qrCode
    let qrCodeData = [];
    let currentSvgIndex = 0;
    let animationFrame;
    let debounceTimeout;
    let totalOutputAmount = 0 ;
    let nameOpTxs = []

    $: doichainAddress?localStorage.setItem('doichainAddress', doichainAddress):null;
    $: doichainAddress && (isConnected)  ? getUtxosAndNamesOfAddress() : null;

    $:names ? debounceCheckNames(names) : null;

    $:{
        if(validNames && isUTXOAddressValid && isNameValid){
            const oldPsbt = psbtBaseText
            psbtBaseText = signTransaction(utxoAddresses, names.split(' ').length, $network, storageFee, recipientAddress, changeAddress)
            if(oldPsbt===psbtBaseText) console.log("old and new psbt is the same")
            else console.log("old and new psbt is NOT same",names.split(' '))

            if(bbqr)
                renderBBQR(psbtBaseText).then(imgurl => qrCodeData = imgurl)
            else
                renderBCUR(psbtBaseText).then(_qr => {
                    qrCodeData = _qr;
                    displayQrCodes();
                }).catch(error => {
                    console.error('Error generating QR code:', error);
                });
        }
    }
    let animationTimeout
    function displayQrCodes() {
        currentSvgIndex = 0;
        if (animationTimeout) clearTimeout(animationTimeout);
        animateQrCodes();
    }

    function animateQrCodes() {
        qrCode = qrCodeData[currentSvgIndex];
        currentSvgIndex = (currentSvgIndex + 1) % qrCodeData.length;
        console.log("currentSvgIndex", currentSvgIndex);
        animationTimeout = setTimeout(animateQrCodes, 500);
    }

    // Clean up timeout on component destroy
    onDestroy(() => {
        if (animationTimeout) clearTimeout(animationTimeout);
    });

    $: totalAmount = sb.toBitcoin(totalOutputAmount + transactionFee) // sb.toBitcoin(unitPrice * nameCount);
    $: (connectedServer && doichainAddress)?getUtxosAndNamesOfAddress() : null;
    $: recipientAddress = doichainAddress;
    $: changeAddress = doichainAddress;
    $: totalUtxoValue = utxoAddresses.reduce((sum, utxo) => sum + utxo.value, 0);

    async function getUtxosAndNamesOfAddress () {
        nameOpTxs = []
        const result = await getUTXOSFromAddress($electrumClient, doichainAddress)
        utxoAddresses = []
        totalUtxoValue = 0
        for (let utxo of result) {
            const scriptPubKey = utxo.fullTx.scriptPubKey;
            if (!scriptPubKey.nameOp) {
                utxoAddresses.push({
                    formattedBlocktime: utxo.fullTx.formattedBlocktime,
                    txid: utxo.fullTx.txid,
                    hex: utxo.fullTx.hex,
                    hash: utxo.tx_hash,
                    n: utxo.fullTx.n,
                    value: utxo.value,
                    address: utxo.fullTx.scriptPubKey.addresses[0]})
                utxoAddresses = utxoAddresses
            } else {
                console.log("adding nameOp",scriptPubKey)
                nameOpTxs.push(scriptPubKey.nameOp.name)
                nameOpTxs = nameOpTxs
            }
        }
    }

    function debounceCheckNames(_names) {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            checkNames(_names);
        }, 500);
    }

    async function checkNames(_names) {
        if(!_names) return
        nameCount = 0;
        nameErrorMessage = '';
        utxoErrorMessage = '';
        isNameValid = true;
        isUTXOAddressValid = true;
        nameCount = 0;
        validNames = [];
        if(_names.split(' ').length>1) return
        const nameArray = [...new Set(_names.split(' '))];
        nameCount = nameArray.length

        for (let name of nameArray) {

            if (name.length>3) {
                const res = await nameShow($electrumClient,name)
                if ( res.length>0 ) {
                    console.log("res",res)
                    for (let utxo of res) {
                        const scriptPubKey = utxo.scriptPubKey;
                        if (scriptPubKey && scriptPubKey.nameOp) {
                            currentNameAddress = scriptPubKey.addresses[0];
                            if(!doichainAddress) doichainAddress=currentNameAddress
                        }
                    }
                    nameErrorMessage = `Name "${name}" already registered under address ${currentNameAddress}`;
                    isNameValid = false;
                    return
                }
                else if(nameCount>0 && totalUtxoValue <= sb.toSatoshi(totalAmount)){
                    utxoErrorMessage = `Funds on ${doichainAddress} are insufficient for this Doichain name`;
                    isUTXOAddressValid = false;
                    return
                }
                else if(name.length <= 3 ){
                    nameErrorMessage = `Name "${name}" is too short`;
                    isNameValid = false;
                    return
                }
                else {
                    if(validNames.indexOf(name)===-1 && name) validNames.push(name);
                    console.log("adding name to validNames",validNames)
                }
            }
        }
        nameErrorMessage = '';
        isNameValid = true;
        validNames = validNames
    }

    /**
     * Take the utxos as inputs and all validNames as outputs + change back
     *
     * @param _utxoAddresses,
     * @param  _network,
     * @param _storageFee,
     * @param _recipientAddress,
     * @param _changeAddress
     */
    function signTransaction(_utxoAddresses,
                             _validNames,
                             _network,
                             _storageFee,
                             _recipientAddress,
                             _changeAddress) {

        if(!_validNames || _utxoAddresses.length===0 || !_recipientAddress || !_changeAddress) return
        // console.log("singing transaction with names:",_validNames)
        const psbt = new Psbt({ network: _network });
        let totalInputAmount = 0;

        _utxoAddresses.forEach(utxo => {
            //TODO https://bitcoin.stackexchange.com/questions/116128/how-do-i-determine-whether-an-input-or-output-is-segwit-revisited

            const scriptPubKeyHex = utxo.hex
            const isSegWit = scriptPubKeyHex?.startsWith('0014') || scriptPubKeyHex?.startsWith('0020');
            if (isSegWit) {
                psbt.addInput({
                    hash: utxo.hash,
                    index: utxo.n,
                    witnessUtxo: {
                        script: Buffer.from(utxo.hex, 'hex'),
                        value: utxo.value,
                    }
                });
            } else {
                psbt.addInput({
                    hash: utxo.hash,
                    index: utxo.n,
                    nonWitnessUtxo: Buffer.from(utxo.hex, 'hex')
                });
            }
            totalInputAmount += utxo.value;
        })

        totalOutputAmount = 0;
        console.log("validNames",validNames)
        if(validNames.length > 0) {

            validNames.forEach(_name => {
                console.log(`recipientAddress: ${_recipientAddress} name_op output ${_name} ` );

                const opCodesStackScript = getNameOPStackScript(_name, 'empty', _recipientAddress, _network);
                psbt.setVersion(VERSION); //for name transactions
                psbt.addOutput({
                    script: opCodesStackScript,
                    value: _storageFee
                });
                totalOutputAmount = totalOutputAmount + _storageFee;
            })
        }

        // psbt.addOutput({
        //     address: "N8YtTBMRqMq9E45VMT9KVbfwt5X5oLD4vt",
        //     value: serviceFee,
        // });
        //
        // totalOutputAmount = totalOutputAmount + serviceFee;
        const feeRate = 34*500 // get feeRate from an API
        transactionFee = (utxoAddresses.length)+(nameCount>0?nameCount:2) * 180 + 3 * feeRate
        changeAmount = totalInputAmount - totalOutputAmount - transactionFee;
        totalAmount = totalOutputAmount
        totalAmount = totalAmount
        
        if(changeAmount < 0) {
            isUTXOAddressValid = false
            utxoErrorMessage = `Funds on ${doichainAddress} are insufficient for this Doichain name`
            return
        }
        psbt.addOutput({
            address: _changeAddress || doichainAddress,
            value: changeAmount, // temporary value
        });

        const psbtFile = psbt.toBase64();
        // console.log("psbtFile", psbtFile);
        return psbtFile;
    }

    $: isConnected = $connectedServer && $connectedServer !== 'offline' && $connectedServer.indexOf('retry')===-1;
    $: connectedServerName = $connectedServer || 'No server connected';
</script>

<style>
    .fade-red-to-green {
        transition: color 1s;
        color: red;
    }
    .fade-red-to-green.connected {
        color: green;
    }
    .blinking {
        animation: blinkingText 1.5s infinite;
    }
    @keyframes blinkingText {
        0% { opacity: 1; }
        50% { opacity: 0; }
        100% { opacity: 1; }
    }
</style>

{#if $scanOpen}
    <ScanModal bind:scanOpen={ $scanOpen } bind:scanData={ doichainAddress } />
{/if}
<div class="bg-white py-24 sm:py-32">
    <div class="mx-auto max-w-7xl px-6 lg:px-8">
        <div class="mx-auto max-w-2xl sm:text-center">
            <h2  class="text-3xl font-bold tracking-tight sm:text-4xl fade-red-to-green {isConnected ? 'connected' : ''}">Names-On-Chain</h2>
            <h2  class="font-bold tracking-tight sm:text-1xl fade-red-to-green {isConnected ? 'connected' : ''}">A Doichain Name Registration Transaction Generator</h2>
            <h3 class="text-sm font-semibold tracking-tight fade-red-to-green {isConnected ? 'connected' : 'blinking'} ">{connectedServerName}</h3>
        </div>
        <div class="mx-auto mt-16 max-w-2xl rounded-3xl ring-1 ring-gray-200 sm:mt-20 lg:mx-0 lg:flex lg:max-w-none">
            <div class="p-8 sm:p-10 lg:flex-auto">
                <p class="mt-6 text-base leading-7 text-gray-600">Register your favourite Doichain name!</p>
                {#if isConnected}
                <p>&nbsp;</p>
                    <div>
                        <label for="email" class="block text-sm font-medium leading-6 text-gray-900">Doichain Registration Address</label>
                        <div class="relative mt-2 rounded-md shadow-sm flex items-center">
                            <input bind:value={doichainAddress}
                                   on:change={() => checkNames()}
                                   type="address" name="address" id="address"
                                   class="{isNameValid?'block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6':'block w-full rounded-md border-0 py-1.5 pr-10 text-red-900 ring-1 ring-inset ring-red-300 placeholder:text-red-300 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6'}"
                                   placeholder="address"
                                   aria-invalid="{isUTXOAddressValid}"
                                   aria-describedby="name-error">
                            {#if !isUTXOAddressValid}
                                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                                    <svg class="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
                                    </svg>
                                </div>
                            {/if}
                            <button on:click={ () => { $scanOpen=true }} class="ml-2"><svg class="h-8 w-8 text-orange-600"  width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">  <path stroke="none" d="M0 0h24v24H0z"/>  <path d="M4 7v-1a2 2 0 0 1 2 -2h2" />  <path d="M4 17v1a2 2 0 0 0 2 2h2" />  <path d="M16 4h2a2 2 0 0 1 2 2v1" />  <path d="M16 20h2a2 2 0 0 0 2 -2v-1" />  <line x1="5" y1="12" x2="19" y2="12" /></svg></button>
                        </div>

                        {#if !isUTXOAddressValid}
                            <p class="mt-2 text-sm text-red-600" id="name-error"><b>Total UTXO value: { sb.toBitcoin(totalUtxoValue) }</b> {utxoErrorMessage}</p>
                        {:else}
                            <p class="mt-2 text-sm text-gray red-600" id="name-error">Total UTXO value: { sb.toBitcoin(totalUtxoValue) }</p>
                            {#each nameOpTxs as n}
                                {n} &nbsp;
                            {/each}
                        {/if}
                    </div>
                <p>&nbsp;</p>
                <div>
                    <label for="name" class="block text-sm font-medium leading-6 text-gray-900">Name to be registered</label>
                    <div class="relative mt-2 rounded-md shadow-sm">
                        <input bind:value={names}  name="name" id="name"
                               type="text"
                               class="{isNameValid?'block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6':'block w-full rounded-md border-0 py-1.5 pr-10 text-red-900 ring-1 ring-inset ring-red-300 placeholder:text-red-300 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6'}"
                               placeholder="name"
                               aria-invalid="{isNameValid}"
                               aria-describedby="name-error"/>
                        {#if !isNameValid}
                            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                                <svg class="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
                                </svg>
                            </div>
                        {/if}
                    </div>
                    {#if !isNameValid}
                        <p class="mt-2 text-sm text-red-600" id="name-error">{nameErrorMessage}</p>
                    {/if}
                </div>
                    {:else}
                    <p class="mt-2 text-sm text-red-600" id="name-error">offline - please check internet connection or reload browser</p>
                {/if}
                <div class="mt-10 flex items-center gap-x-4">
                    <h4 class="flex-none text-sm font-semibold leading-6 text-indigo-600">Features:</h4>
                    <div class="h-px flex-auto bg-gray-100"></div>
                </div>
                <ul role="list" class="mt-8 grid grid-cols-1 gap-4 text-sm leading-6 text-gray-600 sm:grid-cols-2 sm:gap-6">
                    <li class="flex gap-x-3">
                        <svg class="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                        </svg>
                        Serverless
                    </li>
                    <li class="flex gap-x-3">
                        <svg class="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                        </svg>
                        No Data Processing
                    </li>
                    <li class="flex gap-x-3">
                        <svg class="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                        </svg>
                        No Tracking
                    </li>
                    <li class="flex gap-x-3">
                        <svg class="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                        </svg>
                        IPFS only
                    </li>
                    <li class="flex gap-x-3">
                        <svg class="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                        </svg>
                        Scan PSBT QR-code or Copy & Paste PSBT file
                    </li>
                    <li class="flex gap-x-3">
                        <svg class="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                        </svg>
                       Payment via DoiWallet or ElectrumDoi
                    </li>
                    <li class="flex gap-x-3">
                        <svg class="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                        </svg>
                        auto renewal (coming soon)
                    </li>
                    <li class="flex gap-x-3">
                        <svg class="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                        </svg>
                        Create offer on marketplace (coming soon!)
                    </li>
                </ul>
            </div>
            <div class="-mt-2 p-2 lg:mt-0 lg:w-full lg:max-w-md lg:flex-shrink-0">
                <div class="rounded-2xl bg-gray-50 py-10 text-left ring-1 ring-inset ring-gray-900/5 lg:flex lg:flex-col lg:justify-center lg:py-16">
                    <div class="mx-auto max-w-xs px-8">
                        <p class="text-base font-semibold text-gray-600">Register {nameCount}
                            {nameCount === 1 ? 'Doichain name' : 'Doichain names'}
                            for 31,968 blocks (approximately 222 days)</p>
                        <div class="mt-6">
                            <div class="flex justify-between mt-2">
                                <span class="text-sm font-bold tracking-tight text-gray-900">Storage Fee:</span>
                                <span class="text-sm font-semibold leading-6 tracking-wide text-gray-600">{sb.toBitcoin(storageFee)} DOI</span>
                            </div>
                            <div class="flex justify-between mt-2">
                                <span class="text-sm font-bold tracking-tight text-gray-900">Mining Fee:</span>
                                <span class="text-sm font-semibold leading-6 tracking-wide text-gray-600">{sb.toBitcoin(transactionFee)} DOI</span>
                            </div>
<!--                            <div class="flex justify-between mt-2">-->
<!--                                <span class="text-sm font-bold tracking-tight text-gray-900">Service Fee:</span>-->
<!--                                <span class="text-sm font-semibold leading-6 tracking-wide text-gray-600">{sb.toBitcoin(serviceFee)} DOI</span>-->
<!--                            </div>-->
                            <div class="flex justify-between">
                                <span class="text-sm font-bold tracking-tight text-gray-900">Total Amount:</span>
                                <span class="text-sm font-semibold leading-6 tracking-wide text-gray-600">{totalAmount} DOI</span>
                            </div>
                            <div class="flex justify-between mt-2">
                                <span class="text-sm font-bold tracking-tight text-gray-900">Change:</span>
                                <span class="text-sm font-semibold leading-6 tracking-wide text-gray-600">{sb.toBitcoin(changeAmount)} DOI</span>
                            </div>
                        </div>
                        <div id="qr-container"></div>
                        {#if qrCodeData && psbtBaseText }
                            {@html qrCode}
<!--                            <img src={bbqrCode} class="mt-6" />-->
                            <div class="mt-4">
                                <label for="name" class="block text-sm font-medium leading-6 text-gray-900">PSBT File</label>
                                <div class="relative mt-2 rounded-md shadow-sm">
                                    <textarea bind:value={psbtBaseText} rows="4" name="comment" id="comment"
                                          class="{isNameValid?'block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6':'block w-full rounded-md border-0 py-1.5 pr-10 text-red-900 ring-1 ring-inset ring-red-300 placeholder:text-red-300 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6'}"
                                          placeholder="psbt file"
                                          aria-invalid="{!psbtBaseText}"
                                          aria-describedby="name-error"/>
                                            {#if !psbtBaseText}
                                                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                                                    <svg class="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
                                                    </svg>
                                                </div>
                                            {/if}
                                </div>
                                {#if !psbtBaseText}
                                    <p class="mt-2 text-sm text-red-600" id="name-error">{nameErrorMessage}</p>
                                {/if}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
