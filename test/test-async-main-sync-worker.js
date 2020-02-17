'use strict';

const assert = require('assert');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const { SynchronousChannel } = require('..');

if (isMainThread) {
  // Asynchronous main thread.

  const channel = new SynchronousChannel({
    queueLength: 16,
    maxMessageSize: 20
  });

  const writer = new SynchronousChannel.Writer(channel);

  // Number of messages to send.
  const nTotalMessages = 50;
  // Sent and received message counts.
  let nSentMessages = 0, nAcknowledgedMessages = 0;

  new Worker(__filename, {
    workerData: {
      channel
    }
  })
  .once('online', () => {
    const interval = setInterval(() => {
      const message = Buffer.from(`hello ${++nSentMessages}`);
      assert.strictEqual(writer.write(message), true);
      if (nSentMessages === nTotalMessages)
        clearInterval(interval);
    }, 50);
  })
  .on('message', message => {
    assert.strictEqual(message, ++nAcknowledgedMessages);
  });

  process.on('beforeExit', () => {
    assert.strictEqual(nAcknowledgedMessages, nTotalMessages);
    console.log('ok');
  });
} else {
  // Synchronous worker.

  const { channel } = workerData;
  const reader = new SynchronousChannel.Reader(channel);

  let message;
  while ((message = reader.read(1000)) !== false) {
    const str = Buffer.from(message).toString('utf8');
    const match = /^hello ([0-9]+)$/.exec(str);
    parentPort.postMessage(+match[1]);
  }

  parentPort.unref();
}
