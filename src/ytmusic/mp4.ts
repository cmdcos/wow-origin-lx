import { Transform } from 'node:stream';

export const MP4_INIT_BYTES = 64 * 1024;

export function rebaseMp4Range(range: string | undefined): { start: number; end?: number; upstreamRange: string } | null {
  const match = /^bytes=(\d+)-(\d*)$/.exec(range || '');
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : undefined;
  if (!Number.isSafeInteger(start) || start >= MP4_INIT_BYTES ||
      (end !== undefined && (!Number.isSafeInteger(end) || end < start))) return null;
  return { start, end, upstreamRange: `bytes=0-${end === undefined ? '' : Math.max(end, MP4_INIT_BYTES - 1)}` };
}

type Box = { type: string; start: number; end: number };

function uint32(data: Uint8Array, offset: number): number {
  return ((data[offset] * 0x1000000) + (data[offset + 1] << 16) +
    (data[offset + 2] << 8) + data[offset + 3]) >>> 0;
}

function boxType(data: Uint8Array, offset: number): string {
  return String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]);
}

function boxes(data: Uint8Array, start: number, end: number): Box[] {
  const result: Box[] = [];
  for (let offset = start; offset + 8 <= end;) {
    const size = uint32(data, offset);
    if (size < 8 || offset + size > end) break;
    result.push({ type: boxType(data, offset), start: offset, end: offset + size });
    offset += size;
  }
  return result;
}

function moovEnd(data: Uint8Array): number | undefined {
  for (let offset = 0; offset + 8 <= data.length;) {
    const size = uint32(data, offset);
    if (size < 8) return undefined;
    const type = boxType(data, offset);
    if (type === 'moov') return offset + size;
    if (offset + size > data.length) return undefined;
    offset += size;
  }
  return undefined;
}

/** YouTube's fragmented AAC has both mdhd duration and fragment durations; AVFoundation adds them. */
export function normalizeFragmentedMp4Duration(data: Buffer): Buffer {
  const movie = boxes(data, 0, data.length).find((box) => box.type === 'moov');
  if (!movie) return data;
  const children = boxes(data, movie.start + 8, movie.end);
  if (!children.some((box) => box.type === 'mvex')) return data;

  let patched: Buffer | undefined;
  for (const track of children.filter((box) => box.type === 'trak')) {
    const media = boxes(data, track.start + 8, track.end).find((box) => box.type === 'mdia');
    if (!media) continue;
    const header = boxes(data, media.start + 8, media.end).find((box) => box.type === 'mdhd');
    if (!header) continue;
    const version = data[header.start + 8];
    const offset = header.start + (version === 1 ? 32 : 24);
    const length = version === 1 ? 8 : 4;
    if ((version !== 0 && version !== 1) || offset + length > header.end) continue;
    const target = patched ?? (patched = Buffer.from(data));
    target.fill(0, offset, offset + length);
  }
  return patched || data;
}

/** Buffer only the MP4 initialization segment, then pass the remaining bytes through unchanged. */
export function normalizeFragmentedMp4Stream(): Transform {
  let head = Buffer.alloc(0);
  let forwarded = false;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      if (forwarded) {
        this.push(chunk);
        callback();
        return;
      }
      head = Buffer.concat([head, chunk]);
      const required = moovEnd(head);
      if (head.length >= Math.min(required || MP4_INIT_BYTES, MP4_INIT_BYTES)) {
        this.push(normalizeFragmentedMp4Duration(head));
        head = Buffer.alloc(0);
        forwarded = true;
      }
      callback();
    },
    flush(callback) {
      if (!forwarded && head.length) this.push(normalizeFragmentedMp4Duration(head));
      callback();
    }
  });
}

/** Return only the requested absolute byte range after the MP4 header has been normalized. */
export function sliceByteRange(start: number, endExclusive: number): Transform {
  let offset = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      const from = Math.max(0, start - offset);
      const to = Math.min(chunk.length, endExclusive - offset);
      if (from < to) this.push(chunk.subarray(from, to));
      offset += chunk.length;
      callback();
    }
  });
}
