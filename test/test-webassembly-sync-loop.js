'use strict';

const assert = require('assert');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const { SynchronousChannel } = require('..');

if (isMainThread) {
  // Asynchronous main thread.

  const channel = new SynchronousChannel({
    queueLength: 16,
    maxMessageSize: 4
  });

  const writer = new SynchronousChannel.Writer(channel);

  // Number of blocks to send. One block consists of 16 messages.
  let nRemainingBlocks = 10;
  let wasmIsDone = false;

  new Worker(__filename, {
    workerData: {
      channel
    }
  })
  .once('online', () => {
    const message = Buffer.alloc(4);
    const interval = setInterval(() => {
      if (nRemainingBlocks === 0) {
        message.writeUInt32BE(0);
        clearInterval(interval);
        assert(writer.write(message));
      } else {
        for (let i = 0; i < 16; i++) {
          const event = 1 + Math.floor(Math.random() * 0xfffffffe);
          message.writeUInt32BE(event);
          // The WebAssembly worker should have had enough time to process all
          // previous messages, so check that we are able to fill the queue
          // without waiting.
          assert(writer.write(message));
        }

        nRemainingBlocks--;
      }
    }, 50);
  })
  .on('message', message => {
    assert.strictEqual(message, 'done');
    assert.strictEqual(nRemainingBlocks, 0);
    wasmIsDone = true;
  });

  process.on('beforeExit', () => {
    assert(wasmIsDone);
    console.log('ok');
  });
} else {
  // Synchronous WebAssembly worker.

  const { channel } = workerData;
  const reader = new SynchronousChannel.Reader(channel);

  // Exports an "eventLoop" function, which keeps calling nextEvent until
  // nextEvent returns zero.
  const wasmModule = new WebAssembly.Module(Buffer.from(
    '0061736D010000000108026000017F60000002110103656E76096E6578744576' +
    '656E74000003020101070D01096576656E744C6F6F7000010A0C010A00034010' +
    '00690D000B0B0027046E616D65011902000A6E6578745F6576656E74010A6576' +
    '656E745F6C6F6F7002050200000100', 'hex'));

  const wasmInstance = new WebAssembly.Instance(wasmModule, {
    env: {
      nextEvent() {
        const event = reader.read(true);
        assert.strictEqual(event.length, 4);
        return Buffer.from(event).readUInt32BE();
      }
    }
  });

  wasmInstance.exports.eventLoop();
  parentPort.postMessage('done');
}
