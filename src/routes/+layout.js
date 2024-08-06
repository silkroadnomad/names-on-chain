import { network } from '$lib/doichain/doichain-store.js'  // import svelte store
import { browser } from '$app/environment'; // if we are not rendering on a server side this is true
import { setupElectrumConnection } from '$lib/doichain/electrumConnection.js'; // connects and manages the connection to an electrums server

export const prerender = false; // we don't want to prerender anything on the server
export const ssr = false; // thats why we switch of server side rendering here for the whole svelte app

let _network;
network.subscribe((value) => _network = value);

if (browser) {
    setupElectrumConnection(_network);
}