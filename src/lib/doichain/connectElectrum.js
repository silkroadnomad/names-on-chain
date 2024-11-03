import {
	electrumBlockchainBlockHeadersSubscribe,
	electrumBlockchainRelayfee,
	electrumClient,
	electrumServerBanner,
	electrumServers,
	electrumServerVersion, network, connectedServer
} from './doichain-store.js';
import { ElectrumxClient } from '$lib/doichain/electrumx-client.js';

let _electrumClient;
electrumClient.subscribe((value) => _electrumClient = value);
let _network;
network.subscribe((value) => _network = value);

const MAX_RETRIES = 25;
const RETRY_DELAY = 5000;

/**
 * Connect to a random electrumx server in the electrumServers list
 * with a certain network (doichain-mainnet,doichain-testnet,..)
 *
 * sets a couple of svelte store variables
 *
 * @param _network
 * @returns {Promise<string>} the connected server url
 */
export const connectElectrum = async (_network) => {
	if (!_network) return;
	
	let retries = 0;
	let randomServer
	while (retries < MAX_RETRIES) {

		const networkNodes = electrumServers.filter(n => n.network === _network.name);
		randomServer = networkNodes[Math.floor(Math.random() * networkNodes.length)];
		_electrumClient = new ElectrumxClient(randomServer.host, randomServer.port, randomServer.protocol);

		try {
			electrumClient.set(_electrumClient);
			await _electrumClient.connect("electrum-client-js", "1.4.2");
			break;
		} catch (error) {
			console.error("Connection failed, retrying...", error);
			retries++;
			if (retries < MAX_RETRIES) {
				electrumServerVersion.set(`retrying (${retries})`);
				connectedServer.set(`retrying (${retries} - ${randomServer.host})`)
				await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
			} else {
				throw new Error("Max retries reached. Unable to connect to Electrum server.");
			}
		}
	}

	const _electrumServerVersion = await _electrumClient.request('server.version');
	electrumServerVersion.set(_electrumServerVersion);
	console.log("electrumServerVersion", _electrumServerVersion);

	const _connectedServer = randomServer.protocol + "://" + randomServer.host + ":" + randomServer.port;
	connectedServer.set(_connectedServer);
	console.log("network", _connectedServer);

	const _electrumServerBanner = await _electrumClient.request('server.banner');
	console.log("electrumServerBanner", _electrumServerBanner);
	electrumServerBanner.set(_electrumServerBanner);

	const _electrumBlockchainBlockHeadersSubscribe = await _electrumClient.request('blockchain.headers.subscribe');
	electrumBlockchainBlockHeadersSubscribe.set(_electrumBlockchainBlockHeadersSubscribe);

	const _electrumBlockchainRelayfee = await _electrumClient.request('blockchain.relayfee');
	electrumBlockchainRelayfee.set(_electrumBlockchainRelayfee);

	return _connectedServer;
};

export function getConnectionStatus(server) {
	if (!server || server === 'offline' || server.includes('retry')) {
		return {
			isConnected: false,
			serverName: server || 'No server connected'
		};
	}
	return {
		isConnected: true,
		serverName: server
	};
}