class TestnetTasks {
    constructor({ connector }) {
        this._testnetBalances = {};
        this._connector = connector;
    }

    async doPrintBalanceTask() {
        console.log('\nGet balances via HTTP...');

        const accountData = await this._connector.callHttpApi({
            point: 'account',
            params: {
                timestamp: Date.now(),
            },
            makeSign: true,
        });

        for (const { asset, free, locked } of accountData.balances) {
            if (!Number(free) && !Number(locked)) {
                continue;
            }

            this._testnetBalances[asset] = { free, locked };
        }

        this._printBalances();
    }

    doConnectToUserDataStreamTask() {
        return new Promise(async (resolve, reject) => {
            try {
                const listenKey = await this._connector.getWsListenKeyWithKeepAlive(
                    'userDataStream'
                );

                await this._connector.connectToStream({
                    target: listenKey,
                    openCb: () => this._makeDemoTrade(),
                    messageCb: data => {
                        this._handleTestnetStreamMessage(data, resolve);
                    },
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async _makeDemoTrade() {
        console.log('Make MARKET BUY order...');

        const result = await this._connector.callHttpApi({
            method: 'POST',
            point: 'order',
            useTestnet: true,
            makeSign: true,
            params: {
                symbol: 'BTCUSDT',
                side: 'BUY',
                type: 'MARKET',
                quantity: 0.02,
                timestamp: Date.now(),
            },
        });

        if (result.status === 'EXPIRED') {
            console.log(
                'Testnet replied that the order is expired.\n' +
                    'OK, this happens to him every other time, ' +
                    'in any case, we will get an websocket ' +
                    'balance event...'
            );
        }
    }

    _handleTestnetStreamMessage(data, resolve) {
        console.log(`>>> Incoming balance message - ${data.e}`);

        if (data.e === 'outboundAccountInfo') {
            for (const { a: asset, f: free, l: locked } of data.B) {
                this._testnetBalances[asset] = { free, locked };
            }

            this._printBalances();
        }

        if (data.e === 'outboundAccountPosition') {
            resolve();
        }
    }

    _printBalances() {
        console.log('\nLog balances from testnet\n');

        let anyBalanceFound = false;

        for (const [asset, { free, locked }] of Object.entries(this._testnetBalances)) {
            if (!Number(free) && !Number(locked)) {
                continue;
            }

            anyBalanceFound = true;

            console.log(`${asset} - free ${free}, locked ${locked}`);
        }

        if (!anyBalanceFound) {
            console.log('Empty account balances!');
        }

        console.log('');
    }
}

module.exports = TestnetTasks;
