# synchronous-channel

This package provides synchronous message channels for Node.js Worker Threads
and Web Workers in modern browsers.

Synchronous message passing should be avoided if possible, and existing
asynchronous APIs such as `postMessage` should be used instead.

## Communication model

We call a thread synchronous if it requires blocking the event loop for large
amounts of time. While generally undesirable, it is sometimes difficult to
prevent, for example, when running WebAssembly code in a background thread.

| Sending thread type | Receiving thread type | Recommended mechanism |
| ------------------- | --------------------- | --------------------- |
| Asynchronous        | Asynchronous          | `postMessage`         |
| Asynchronous        | Synchronous           | `SynchronousChannel`  |
| Synchronous         | Asynchronous          | `postMessage`         |
| Synchronous         | Synchronous           | `SynchronousChannel`  |

## Examples

Node.js example:

```js
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { SynchronousChannel } = require('synchronous-channel');

if (isMainThread) {
  // Create a new channel that can store up to 16 messages, each having a size
  // of up to 32 bytes.
  const channel = new SynchronousChannel({
    queueLength: 16,
    maxMessageSize: 32
  });

  // The main thread will write to the channel.
  const writer = new SynchronousChannel.Writer(channel);

  // Start a new thread.
  new Worker(__filename, {
    workerData: {
      channel
    }
  })
  .once('online', () => {
    // As soon as the thread is ready, start sending the current time as a
    // string, and keep doing it forever.
    setInterval(() => {
      const message = Buffer.from(new Date().toISOString());
      if (!writer.write(message)) {
        console.error('Queue is full!');
      }
    }, 500);
  })
  .on('message', message => {
    console.log(`Worker says: ${message}`);
  });
} else {
  // The worker thread will read from the channel.
  const { channel } = workerData;
  const reader = new SynchronousChannel.Reader(channel);

  // Keep reading messages... forever.
  let message;
  while ((message = reader.read(true)) !== false) {
    const time = Buffer.from(message).toString('ascii');
    parentPort.postMessage(`The time is ${time}`);
  }
}
```

## API

### Class `SynchronousChannel`

Options:
- `queueLength`: Maximum numbers of messages to queue.
- `maxMessageSize`: The maximum size of each message, in bytes.

Each channel uses approximately `queueLength * maxMessageSize` bytes of memory.
It is currently not possible to resize shared memory.

It is not possible to create more than one `Writer` or more than one `Reader`
for a single `SynchronousChannel`. Attempting to create additional `Writer` or
`Reader` instances will throw.

Example:

```js
const channel = new SynchronousChannel({
  queueLength: 64,
  maxMessageSize: 1024
});
```

### Class `SynchronousChannel.Writer`

Example:

```js
const writer = new SynchronousChannel.Writer(channel);
writer.write(message);
```

### Class `SynchronousChannel.Reader`

Example:

```js
const reader = new SynchronousChannel.Reader(channel);
const message = reader.read();
```

## Blocking operations and timeouts

This module supports both blocking and non-blocking read and write operations.
For blocking operations, a timeout can be specified in milliseconds. Setting a
`timeout` to `true` is equivalent to setting it to `+Infinity`, and the
operation will potentially never return.

Browsers usually do not allow the main (renderer) thread to use blocking memory
operations. Using a timeout will throw an exception in these cases.

## Browser support

Currently, the `SharedArrayBuffer` class is the only way to implement
synchronous communication between threads. Due to security concerns, it has been
disabled in most browsers, and at the time of writing, only Chrome fully
supports `SharedArrayBuffer`.
