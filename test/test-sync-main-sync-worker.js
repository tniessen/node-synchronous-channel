'use strict';

const assert = require('assert');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const { SynchronousChannel } = require('..');

if (isMainThread) {
  // Synchronous main thread.

  const options = {
    queueLength: 16,
    maxMessageSize: 20
  };

  const channel1 = new SynchronousChannel(options);
  const channel2 = new SynchronousChannel(options);

  const writer = new SynchronousChannel.Writer(channel1);
  const reader = new SynchronousChannel.Reader(channel2);

  let gotReply = false;

  new Worker(__filename, {
    workerData: {
      channel1,
      channel2
    }
  })
  .once('online', () => {
    let message;
    while ((message = reader.read(1000)) !== false) {
      const str = Buffer.from(message).toString('utf8');
      const match = /^hello ([0-9]+)$/.exec(str);
      writer.write(new Uint8Array([+match[1]]));
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
  // Synchronous worker.

  const { channel1, channel2 } = workerData;
  const reader = new SynchronousChannel.Reader(channel1);
  const writer = new SynchronousChannel.Writer(channel2);

  // Number of messages to send.
  const nTotalMessages = 50;

  for (let i = 0; i < nTotalMessages; i++) {
    writer.write(Buffer.from(`hello ${i}`));
    const buf = reader.read(1000);
    assert.strictEqual(buf[0], i);
  }

  // If the main thread has acknowledged all messages, we stop sending more,
  // causing the main thread to run into a timeout. When that happens,
  // it receives this message:
  parentPort.postMessage('ok');
}
