import {
    connectedServer, electrumServerBanner, electrumServerVersion, network
} from '$lib/doichain/doichain-store.js'
import { browser } from '$app/environment';

export const prerender = false;
export const ssr = false;

let _network;
network.subscribe((value) => _network = value);
async function connect() {
    const connectElectrum = (await import('$lib/doichain/connectElectrum.js')).connectElectrum;

    connectElectrum(_network).then(()=>{
        console.log("electrum connected")
    })

    window.addEventListener("offline", (e) => {
        console.log("offline");
        electrumServerVersion.set('server disconnected');
        connectedServer.set('offline');
        electrumServerBanner.set('server disconnected');
    });

    window.addEventListener("online", async (e) => {
        console.log("online");
        console.log("connecting to electrum",$network)
        await connectElectrum($network)
    })
}
if (browser) connect()
