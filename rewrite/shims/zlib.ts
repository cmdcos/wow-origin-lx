import { Buffer } from 'buffer';

const { ungzip } = require('pako');

export function gunzipSync(value: Uint8Array): Buffer {
  return Buffer.from(ungzip(value));
}
