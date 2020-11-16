const crypto = require('crypto');
const queryString = require('querystring');
const WebSocket = require('ws');
const axios = require('axios');
const keys = require('../keys.json');

if (Object.values(keys).some(v => !v)) {
    console.log('Empty keys, check keys.json');
    process.exit(1);
}

const TESTNET_HTTP_URL = 'https://testnet.binance.vision/api/v3/';
const MAINNET_HTTP_URL = 'https://api.binance.com/api/v3/';
const TESTNET_WS_URL = 'wss://testnet.binance.vision/ws/';
const MAINNET_WS_URL = 'wss://stream.binance.com:9443/ws/';
const FIRST_HTTP_WATCH_DOG_TIMEOUT = 5000;
const SECOND_HTTP_WATCH_DOG_TIMEOUT = 8000;
const RENEW_LISTEN_KEY_TIMEOUT = 30 * 60 * 1000;
const RENEW_LISTEN_KEY_TIMEOUT_ON_ERROR = 5 * 60 * 1000;

class Connector {
    constructor({ useTestnet = false } = {}) {
        this._useTestnet = useTestnet;
        this._netUrl = this._useTestnet ? TESTNET_HTTP_URL : MAINNET_HTTP_URL;
        this._wsUrl = this._useTestnet ? TESTNET_WS_URL : MAINNET_WS_URL;
    }

    async callHttpApi({ method = 'GET', point, params = {}, makeSign = false }) {
        try {
            const watchDogFlags = { currentlyInProcess: true };
            const url = this._netUrl + point;
            const headers = {
                'X-MBX-APIKEY': keys.testnet_public_key,
            };

            if (makeSign) {
                this._signParams(params);
            }

            this._makeWatchDog(watchDogFlags);

            const result = await axios({ method, url, headers, params });

            watchDogFlags.currentlyInProcess = false;

            return result.data;
        } catch (error) {
            console.log('ERROR:', error?.response?.data || error);
            process.exit(1);
        }
    }

    async getWsListenKeyWithKeepAlive(point) {
        const { listenKey } = await this.callHttpApi({
            method: 'POST',
            point,
        });

        await this._startRenewListenKeyAfterTimeout(listenKey);

        return listenKey;
    }

    async connectToStream({ target, openCb, messageCb, closeCb }) {
        const client = new WebSocket(this._wsUrl + target);
        const watchDogFlags = { currentlyInProcess: true };

        this._makeWatchDog(watchDogFlags);

        client.on('open', async () => {
            watchDogFlags.currentlyInProcess = false;

            console.log('WebSocket connection open');

            if (openCb) {
                await openCb();
            }
        });

        client.on('close', async () => {
            console.log('WebSocket connection close');

            if (closeCb) {
                await closeCb();
            }
        });

        client.on('message', async rawData => {
            const data = JSON.parse(rawData);

            if (messageCb) {
                await messageCb(data);
            }
        });
    }

    async _startRenewListenKeyAfterTimeout(listenKey, forceTimeout) {
        setTimeout(async () => {
            try {
                await this._renewListenKey(listenKey);

                console.log('Listen key renewed');

                await this._startRenewListenKeyAfterTimeout(listenKey);
            } catch (error) {
                console.log('Listen key renew error - ', error);

                await this._startRenewListenKeyAfterTimeout(
                    listenKey,
                    RENEW_LISTEN_KEY_TIMEOUT_ON_ERROR
                );
            }
        }, forceTimeout || RENEW_LISTEN_KEY_TIMEOUT);
    }

    async _renewListenKey(listenKey) {
        await this.callHttpApi({
            method: 'PUT',
            point: 'userDataStream',
            params: {
                listenKey,
            },
        });
    }

    _signParams(params) {
        const query = queryString.encode(params);
        const hmac = crypto.createHmac('sha256', keys.testnet_private_key);

        params.signature = hmac.update(query).digest('hex');
    }

    _makeWatchDog(flags) {
        setTimeout(() => {
            if (flags.currentlyInProcess === false) {
                return;
            }

            console.log(
                `In some cases ${this._useTestnet ? 'testnet' : 'network'} unstable... just wait...`
            );

            setTimeout(() => {
                if (flags.currentlyInProcess === false) {
                    return;
                }

                console.log(
                    'It looks like the same thing is happening now... but the timeout has not yet expired'
                );
            }, SECOND_HTTP_WATCH_DOG_TIMEOUT);
        }, FIRST_HTTP_WATCH_DOG_TIMEOUT);
    }
}

module.exports = Connector;
