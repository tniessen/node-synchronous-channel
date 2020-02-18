'use strict';

function realIndex(index) {
  return index & 0x7fffffff;
}

function nextIndex(index, nIndices) {
  const real = index & 0x7fffffff;
  const parity = (index >> 31) ^ +(real === nIndices - 1);
  return ((real + 1) % nIndices) | (parity << 31);
}

function isPositiveUint32(num) {
  return typeof num === 'number' && num !== 0 && (num >>> 0) === num;
}

class SynchronousChannel {
  constructor(options) {
    if (typeof options !== 'object')
      throw new TypeError(`"options" must be an object, not ${typeof options}`);

    const { queueLength, maxMessageSize } = options;
    if (!isPositiveUint32(queueLength))
      throw new TypeError(`"queueLength" must be a positive integer, not ${queueLength}`);
    if (!isPositiveUint32(maxMessageSize))
      throw new TypeError(`"maxMessageSize" must be a positive integer, not ${maxMessageSize}`);

    this.queueLength = queueLength;
    this.maxMessageSize = maxMessageSize;

    const stateBuffer = new SharedArrayBuffer(12 + 4 * queueLength);
    // TODO: It would be more elegant to use a single array, which allows
    // variably sized messages to be transmitted using less memory.
    // For example, a 2048 byte buffer could be used to transmit a 1536 byte
    // message along with a 512 byte message, which is currently impossible
    // for maxMessageSize === 1024.
    const messageBuffer = new SharedArrayBuffer(queueLength * maxMessageSize);

    this.sharedData = { stateBuffer, messageBuffer };
  }
}

const kReader = 0;
const kWriter = 1;

class ChannelUser {
  constructor(channel, role) {
    const {
      queueLength,
      maxMessageSize,
      sharedData: {
        stateBuffer,
        messageBuffer
      }
    } = channel;

    const owners = new Uint8Array(stateBuffer, 0, 2);
    if (Atomics.compareExchange(owners, role, 0, 1) !== 0) {
      throw new Error(`Another SynchronousChannel.${role ? 'Writer' : 'Reader'} already exists for this channel`);
    }

    const rwOffsets = new Int32Array(stateBuffer, 4, 2);
    const messageLengths = new Uint32Array(stateBuffer, 12, queueLength);

    const messages = new Array(queueLength);
    for (let i = 0; i < messages.length; i++) {
      messages[i] = new Uint8Array(messageBuffer,
                                   maxMessageSize * i,
                                   maxMessageSize);
    }

    Object.defineProperties(this, {
      queueLength: { value: queueLength },
      maxMessageSize: { value: maxMessageSize },
      rwOffsets: { value: rwOffsets },
      messageLengths: { value: messageLengths },
      messages: { value: messages }
    });
  }
}

class Writer extends ChannelUser {
  constructor(channel) {
    super(channel, kWriter);
  }

  write(data, timeout = 0) {
    if (data.length > this.maxMessageSize)
      return false;

    const writeOffset = this.rwOffsets[kWriter];

    const readOffsetIfFull = writeOffset ^ (1 << 31);

    if (timeout === true)
      timeout = Infinity;

    if (timeout > 0) {
      // Wait for the receiver to release the next element.
      const m = Atomics.wait(this.rwOffsets, kReader, readOffsetIfFull, timeout);
      if (m === 'timed-out')
        return false;
      // If m is 'ok', then the receiver incremented the read index.
      // If m is 'not-equal', then it was unnecessary to wait.
    } else {
      // Check if there is room for an additional message.
      const readOffset = Atomics.load(this.rwOffsets, kReader);
      if (readOffset === readOffsetIfFull)
        return false;
    }

    // Store the message.
    const realWriteOffset = realIndex(writeOffset);
    this.messages[realWriteOffset].set(data);
    this.messageLengths[realWriteOffset] = data.byteLength;

    // Notify the receiver.
    Atomics.store(this.rwOffsets, kWriter, nextIndex(writeOffset, this.queueLength));
    Atomics.notify(this.rwOffsets, kWriter);
    return true;
  }
}

class Reader extends ChannelUser {
  constructor(channel) {
    super(channel, kReader);
  }

  read(timeout = 0) {
    const readOffset = this.rwOffsets[kReader];

    if (timeout === true)
      timeout = Infinity;

    if (timeout > 0) {
      // Wait for the sender to put something into the queue.
      const m = Atomics.wait(this.rwOffsets, kWriter, readOffset, timeout);
      if (m === 'timed-out')
        return false;
      // If m is 'ok', then the sender incremented the write index.
      // If m is 'not-equal', then it was unnecessary to wait.
    } else {
      // Check if there is a message.
      const writeOffset = Atomics.load(this.rwOffsets, kWriter);
      if (readOffset === writeOffset)
        return false;
    }

    const realReadOffset = realIndex(readOffset);
    const length = this.messageLengths[realReadOffset];
    const array = this.messages[realReadOffset].slice(0, length);

    Atomics.store(this.rwOffsets, kReader, nextIndex(readOffset, this.queueLength));
    Atomics.notify(this.rwOffsets, kReader);
    return array;
  }
}

SynchronousChannel.Writer = Writer;
SynchronousChannel.Reader = Reader;

module.exports = { SynchronousChannel };
