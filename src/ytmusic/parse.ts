import type { Album, Artist, Playlist, Track } from 'aduoer-wow-sdk';

export function at(value: any, ...path: (string | number)[]): any {
  return path.reduce((result, key) => result?.[key], value);
}

export function findAll(value: any, key: string, limit = 1000): any[] {
  const results: any[] = [];
  const visit = (node: any): void => {
    if (!node || typeof node !== 'object' || results.length >= limit) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node[key]) results.push(node[key]);
    Object.values(node).forEach(visit);
  };
  visit(value);
  return results;
}

export function text(value: any): string {
  if (typeof value === 'string') return value;
  return (value?.runs || []).map((run: any) => run.text || '').join('');
}

export function thumbnail(value: any): string {
  const thumbnails = findAll(value, 'thumbnails', 1)[0];
  return Array.isArray(thumbnails) ? String(thumbnails[thumbnails.length - 1]?.url || '') : '';
}

function column(row: any, index: number): any[] {
  return at(row, 'flexColumns', index, 'musicResponsiveListItemFlexColumnRenderer', 'text', 'runs') || [];
}

function browseId(run: any): string {
  return String(at(run, 'navigationEndpoint', 'browseEndpoint', 'browseId') || '');
}

export function durationMs(value: any): number {
  if (Number.isFinite(Number(value?.duration_seconds))) return Math.max(0, Number(value.duration_seconds) * 1000);
  const parts = String(value || '').split(':').map(Number);
  return parts.length > 1 && parts.every(Number.isFinite)
    ? parts.reduce((sum, part) => sum * 60 + part, 0) * 1000 : 0;
}

export function mapArtist(value: any): Artist {
  const row = value?.musicResponsiveListItemRenderer || value;
  const first = column(row, 0)[0];
  return {
    id: String(value?.id || value?.browseId || value?.channelId || browseId(first) || at(row, 'navigationEndpoint', 'browseEndpoint', 'browseId') || ''),
    name: String(value?.name || value?.artist || value?.title || first?.text || text(row?.title) || ''),
    coverUrl: thumbnail(row) || thumbnail(value)
  };
}

export function mapAlbum(value: any): Album {
  const row = value?.musicResponsiveListItemRenderer || value?.musicTwoRowItemRenderer || value;
  const first = column(row, 0)[0];
  const subtitle = column(row, 1);
  const artists = value?.artists || [];
  return {
    id: String(value?.id || value?.browseId || at(row, 'navigationEndpoint', 'browseEndpoint', 'browseId') || browseId(first) || ''),
    name: String(value?.name || value?.title || first?.text || text(row?.title) || ''),
    coverUrl: thumbnail(row) || thumbnail(value),
    artistName: String(value?.artistName || artists[0]?.name || subtitle.find((run: any) => browseId(run).startsWith('UC'))?.text || '')
  };
}

export function mapPlaylist(value: any): Playlist {
  const row = value?.musicResponsiveListItemRenderer || value?.musicTwoRowItemRenderer || value;
  const first = column(row, 0)[0];
  const rawId = String(value?.id || value?.playlistId || at(row, 'navigationEndpoint', 'browseEndpoint', 'browseId') || browseId(first) || '');
  const count = Number(value?.trackCount || value?.count || value?.itemCount || 0);
  return {
    id: rawId.replace(/^VL/, ''),
    name: String(value?.name || value?.title || first?.text || text(row?.title) || ''),
    description: String(value?.description || ''),
    coverUrl: thumbnail(row) || thumbnail(value),
    trackCount: Number.isFinite(count) ? count : 0,
    favorite: false
  };
}

export function mapTrack(value: any): Track {
  const row = value?.musicResponsiveListItemRenderer || value;
  const first = column(row, 0)[0];
  const subtitle = column(row, 1);
  const runs = subtitle.filter((run: any) => run.text !== ' • ' && run.text !== ' · ');
  const artists = Array.isArray(value?.artists) ? value.artists.map(mapArtist) :
    runs.filter((run: any) => browseId(run).startsWith('UC')).map((run: any) => ({ id: browseId(run), name: run.text }));
  if (!artists.length && value?.author) artists.push({ id: String(value.channelId || ''), name: String(value.author) });
  const albumRun = runs.find((run: any) => browseId(run).startsWith('MPRE'));
  const albumValue = value?.album;
  const album = typeof albumValue === 'object' && albumValue
    ? { id: String(albumValue.id || ''), name: String(albumValue.name || ''), coverUrl: thumbnail(albumValue) || thumbnail(row) }
    : { id: browseId(albumRun), name: String(albumRun?.text || albumValue || ''), coverUrl: thumbnail(row) };
  const last = runs[runs.length - 1]?.text;
  return {
    id: String(value?.videoId || value?.id || row?.playlistItemData?.videoId || at(first, 'navigationEndpoint', 'watchEndpoint', 'videoId') || at(row, 'overlay', 'musicItemThumbnailOverlayRenderer', 'content', 'musicPlayButtonRenderer', 'playNavigationEndpoint', 'watchEndpoint', 'videoId') || ''),
    title: String(value?.title || first?.text || ''),
    artists,
    album,
    durationMs: value?.durationMs || durationMs(value?.duration_seconds ? { duration_seconds: value.duration_seconds } : value?.duration || value?.length || at(row, 'fixedColumns', 0, 'musicResponsiveListItemFixedColumnRenderer', 'text', 'runs', 0, 'text') || last),
    favorite: value?.likeStatus === 'LIKE'
  };
}

export function rows(response: any): any[] {
  return findAll(response, 'musicResponsiveListItemRenderer').map((row) => ({ musicResponsiveListItemRenderer: row }));
}

export function tiles(response: any): any[] {
  return findAll(response, 'musicTwoRowItemRenderer').map((tile) => ({ musicTwoRowItemRenderer: tile }));
}

export function continuation(response: any): string {
  return String(findAll(response, 'nextContinuationData', 1)[0]?.continuation || '');
}
