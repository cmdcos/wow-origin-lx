import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { MusicAccountSession } from '../accounts';

function accountId(account: MusicAccountSession): string {
  return createHash('sha256').update(account.apiAccessKey).digest('hex').slice(0, 16);
}

function signature(account: MusicAccountSession, videoId: string, quality: string, expires: number): string {
  return createHmac('sha256', account.apiAccessKey)
    .update(`${accountId(account)}\n${videoId}\n${quality}\n${expires}`)
    .digest('hex');
}

export function createStreamUrl(origin: string, account: MusicAccountSession, videoId: string, quality: string): string {
  const expires = Math.floor(Date.now() / 1000) + 6 * 3600;
  const query = new URLSearchParams({ account: accountId(account), quality, expires: String(expires), signature: signature(account, videoId, quality, expires) });
  return `${origin}/v1/ytmusic/audio/${encodeURIComponent(videoId)}?${query}`;
}

export function verifyStreamRequest(
  accounts: MusicAccountSession[],
  videoId: string,
  query: Record<string, unknown>
): { account: MusicAccountSession; quality: string } | null {
  if (!/^[\w-]{11}$/.test(videoId)) return null;
  const id = String(query.account || '');
  const quality = String(query.quality || '');
  const expires = Number(query.expires);
  const provided = String(query.signature || '');
  if (!['min', 'max', 'standard', 'higher'].includes(quality) || !Number.isSafeInteger(expires) || expires < Date.now() / 1000 || expires > Date.now() / 1000 + 6 * 3600 + 60 || !/^[a-f0-9]{64}$/.test(provided)) return null;
  const account = accounts.find((item) => item.platform === 'ytmusic' && accountId(item) === id);
  if (!account) return null;
  const expected = signature(account, videoId, quality, expires);
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex')) ? { account, quality } : null;
}
