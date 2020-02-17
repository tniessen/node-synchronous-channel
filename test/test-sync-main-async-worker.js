'use strict';

const assert = require('assert');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const { SynchronousChannel } = require('..');

if (isMainThread) {
  // Synchronous main thread.

  const channel = new SynchronousChannel({
    queueLength: 16,
    maxMessageSize: 20
  });

  const reader = new SynchronousChannel.Reader(channel);

  let gotReply = false;

  const worker = new Worker(__filename, {
    workerData: {
      channel
    }
  })
  .once('online', () => {
    let message;
    while ((message = reader.read(1000)) !== false) {
      const str = Buffer.from(message).toString('utf8');
      const match = /^hello ([0-9]+)$/.exec(str);
      worker.postMessage(+match[1]);
    }
  })
  .once('message', message => {
    assert.strictEqual(message, 'ok');
    gotReply = true;
  });

  process.on('beforeExit', () => {
    assert.strictEqual(gotReply, true);
    console.log('ok');
  });
} else {
  // Asynchronous worker.

  const { channel } = workerData;
  const writer = new SynchronousChannel.Writer(channel);

  // Number of messages to send.
  const nTotalMessages = 50;
  // Sent and received message counts.
  let nSentMessages = 0, nAcknowledgedMessages = 0;

  const interval = setInterval(() => {
    const message = Buffer.from(`hello ${++nSentMessages}`);
    assert.strictEqual(writer.write(message), true);
    if (nSentMessages === nTotalMessages)
      clearInterval(interval);
  }, 50);

  parentPort.on('message', message => {
    assert.strictEqual(message, nAcknowledgedMessages + 1);
    if (++nAcknowledgedMessages === nTotalMessages) {
      // If the main thread has acknowledged all messages, we stop sending more,
      // causing the main thread to run into a timeout. When that happens,
      // it receives this message:
      parentPort.postMessage('ok');
      parentPort.unref();
    }
  });
}
