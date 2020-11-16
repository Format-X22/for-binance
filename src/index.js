const Connector = require('./Connector');
const TestnetTasks = require('./TestnetTasks');
const MainnetTasks = require('./MainnetTasks');

(async () => {
    const testnetConnector = new Connector({ useTestnet: true });
    const mainnetConnector = new Connector();
    const testnetTasks = new TestnetTasks({ connector: testnetConnector });
    const mainnetTasks = new MainnetTasks({ connector: mainnetConnector });

    await testnetTasks.doPrintBalanceTask();
    await testnetTasks.doConnectToUserDataStreamTask();

    await mainnetTasks.doDeterminateHighVolumePairs();
    await mainnetTasks.doOpen10TradeStreamsWithLogs();
})();
