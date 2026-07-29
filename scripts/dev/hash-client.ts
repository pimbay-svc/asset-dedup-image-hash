import net from 'node:net';
import { FrameDecoder, encodeFrame } from '../../src/infrastructure/uds/framing.js';

const [, , socketPath, imagePath, algorithm, hashSizeRaw] = process.argv;

if (socketPath === undefined || imagePath === undefined) {
  console.error('usage: hash-client.ts <socket_path> <image_path> [algorithm] [hash_size]');
  process.exit(1);
}

const hashSize = Number.parseInt(hashSizeRaw ?? '8', 10);

const request = {
  op: 'hash',
  config: {
    algorithm: algorithm ?? 'phash',
    hash_size: hashSize,
  },
  inputs: {
    id1: { path: imagePath },
  },
};

const socket = net.connect({ path: socketPath }, () => {
  socket.write(encodeFrame(request));
});

const decoder = new FrameDecoder();

socket.on('data', (chunk: Buffer) => {
  for (const message of decoder.push(chunk)) {
    console.log(JSON.stringify(message, null, 2));
  }
  socket.end();
});

socket.on('error', (err) => {
  console.error(`connection failed: ${err.message}`);
  process.exit(1);
});
