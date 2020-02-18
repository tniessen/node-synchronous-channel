'use strict';

const assert = require('assert');
const { Worker, isMainThread, workerData } = require('worker_threads');

const { SynchronousChannel } = require('..');

const [writerError, readerError ] = (f => [f('Writer'), f('Reader')])(n => {
  return {
    name: 'Error',
    message: `Another SynchronousChannel.${n} already exists for this channel`
  };
});

if (isMainThread) {
  const channel = new SynchronousChannel({
    queueLength: 16,
    maxMessageSize: 20
  });

  new SynchronousChannel.Writer(channel);
  assert.throws(() => new SynchronousChannel.Writer(channel), writerError);

  new SynchronousChannel.Reader(channel);
  assert.throws(() => new SynchronousChannel.Reader(channel), readerError);

  new Worker(__filename, { workerData: { channel } });
} else {
  const { channel } = workerData;

  assert.throws(() => new SynchronousChannel.Writer(channel), writerError);
  assert.throws(() => new SynchronousChannel.Reader(channel), readerError);

  console.log('ok');
}
