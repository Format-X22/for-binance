const METRICS_LOG_INTERVAL = 60 * 1000;

class MainnetTasks {
    constructor({ connector }) {
        this._connector = connector;
        this._highestVolumes = [];
        this._collectedMetrics = [];
    }

    async doDeterminateHighVolumePairs() {
        const activeSpot = await this._extractActiveSpotSymbols();

        await this._extractHighVolumes(activeSpot);
    }

    async doOpen10TradeStreamsWithLogs() {
        const streams = [];
        const requestedSymbols = this._highestVolumes.length;
        let readyCount = 0;

        console.log('Connect to trade streams...');

        for (const { symbol } of this._highestVolumes) {
            const promise = this._connector.connectToStream({
                target: symbol.toLowerCase() + '@trade',
                openCb: () => {
                    if (++readyCount === requestedSymbols) {
                        this._startMetricsAggregationInterval();
                    }
                },
                messageCb: data => {
                    if (readyCount === requestedSymbols) {
                        this._collectTradeMetrics(data);
                    }
                },
            });

            streams.push(promise);
        }

        await Promise.all(streams);
    }

    _isActiveSymbol({ status }) {
        return status === 'TRADING';
    }

    _isSpotSymbol({ permissions }) {
        return permissions.includes('SPOT');
    }

    async _extractActiveSpotSymbols() {
        const { symbols: symbolsData } = await this._connector.callHttpApi({
            method: 'GET',
            point: 'exchangeInfo',
        });
        const active = symbolsData.filter(this._isActiveSymbol.bind(this));
        const activeSpot = active.filter(this._isSpotSymbol.bind(this));
        const quoteAssets = new Set();
        const quoteAssetsForActiveSpots = new Set();

        for (const symbolData of symbolsData) {
            quoteAssets.add(symbolData.quoteAsset);

            if (this._isActiveSymbol(symbolData) && this._isSpotSymbol(symbolData)) {
                quoteAssetsForActiveSpots.add(symbolData.quoteAsset);
            }
        }

        console.log('\nExplore the available symbols\n');
        console.log(`Found ${symbolsData.length} symbols.`);
        console.log(`${active.length} active symbols (in status "TRADING").`);
        console.log(`${activeSpot.length} active symbols in SPOT markets.`);
        console.log(`${quoteAssets.size} is quote assets total.`);
        console.log(`${quoteAssetsForActiveSpots.size} is active and spot quote assets.`);

        return activeSpot;
    }

    async _extractHighVolumes(activeSpot) {
        console.log(
            '\nRate limit will not allow us to quickly download all active tickers in SPOT, ' +
                'calculate their price in USD, including calculating a chain of pairs to ' +
                'bring everything to USD (or BTC, as an option). So that the launch of the ' +
                'test task does not turn into a long slow download with updating - I made ' +
                'a calculation of the volume of only those pairs that are traded to BTC.\n'
        );

        console.log('Extract tickers for BTC pairs...');

        const volume = [];
        const tickers = [];

        for (const symbolData of activeSpot) {
            if (symbolData.quoteAsset !== 'BTC') {
                continue;
            }

            tickers.push(
                this._connector.callHttpApi({
                    point: 'ticker/24hr',
                    params: {
                        symbol: symbolData.symbol,
                    },
                })
            );
        }

        for (const ticker of await Promise.all(tickers)) {
            volume.push({ symbol: ticker.symbol, volume: Number(ticker.quoteVolume) });
        }

        const sorted = volume.sort((a, b) => b.volume - a.volume);

        this._highestVolumes = sorted.slice(0, 10);
    }

    _collectTradeMetrics({ E: eventTime }) {
        this._collectedMetrics.push({ eventTime, collectedTime: Date.now() });
    }

    _aggregateAndLogMetrics() {
        const data = this._collectedMetrics;
        let min = Number.MAX_SAFE_INTEGER;
        let max = 0;
        let sum = 0;

        this._collectedMetrics = [];

        for (const { eventTime, collectedTime } of data) {
            const latency = collectedTime - eventTime;

            sum += latency;

            if (latency < min) {
                min = latency;
            }

            if (latency > max) {
                max = latency;
            }
        }

        const mean = (sum / data.length) ^ 0;
        const date = new Date();
        const time = `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}:${date.getMilliseconds()}`;

        console.log(`[${time}] Latency report - min: ${min}, mean: ${mean}, max: ${max}`);
    }

    _startMetricsAggregationInterval() {
        console.log('Data collection for latency measurement started...');

        setInterval(() => this._aggregateAndLogMetrics(), METRICS_LOG_INTERVAL);
    }
}

module.exports = MainnetTasks;
