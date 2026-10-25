const { NeteaseClient } = require('../../../dist/clients/NeteaseClient');
const { QQClient } = require('../../../dist/clients/QQClient');
const { PlaylistFavorites } = require('../../../dist/playlistFavorites');
const { createWowContextResolver } = require('../../../dist/adapter');
const { createWowRouter } = require('aduoer-wow-sdk');
const express = require('express');
const request = require('supertest');

const playlist = (id, favorite) => ({ id, name: id, favorite, description: '', coverUrl: '', trackCount: 0 });

describe('account playlist favorites', () => {
  afterEach(() => { delete global.__musicPlatformFactory__; });

  test.each([
    ['netease', 'MUSIC_U=cookie'],
    ['qq', 'uin=o1; qm_keyst=cookie']
  ])('%s serves public playlists from cached favorites and refreshes only on My Playlists requests', async (platform, cookie) => {
    let saved = true;
    let failList = true;
    const publicPlaylist = { id: 'saved', name: 'Saved', tracks: [] };
    const callModule = jest.fn(async (route) => {
      if (route === 'user/playlist') {
        if (failList) throw new Error('My Playlists unavailable');
        return { code: 200, playlist: saved ? [{ ...publicPlaylist, subscribed: true }] : [] };
      }
      if (route === 'playlist/detail' || route === 'toplist/songs/v2') return { code: 200, playlist: publicPlaylist };
      if (route === 'top/playlist') return { code: 200, playlists: [publicPlaylist] };
      if (route === 'personalized') return { code: 200, result: [publicPlaylist] };
      if (route === 'cloudsearch' || route === 'search') return { code: 200, result: { playlists: [publicPlaylist] } };
      throw new Error(`unexpected route: ${route}`);
    });
    global.__musicPlatformFactory__ = { getPlatform: () => ({ callModule }) };
    const session = {
      platform, cookie, stateless: false, name: platform,
      favoriteTrackIds: new Set(), favoriteArtistIds: new Set(), favoriteAlbumIds: new Set(),
      userPlaylistIds: new Set(), playlistFavorites: new PlaylistFavorites()
    };
    const app = express();
    app.use(createWowRouter({ resolveContext: createWowContextResolver({ byAccessKey: new Map([['key', session]]) }) }));
    const get = (path) => request(app).get(`/v1/${path}`).set('Authorization', 'Bearer key');
    const publicPaths = [
      'playlist/detail?id=saved&trackLimit=0', 'playlist/list', 'playlist/recommended',
      'search/playlists?keyword=saved', 'toplist/detail?id=saved'
    ];
    const assertPublicFavorites = async (favorite) => {
      for (const path of publicPaths) {
        const { body } = await get(path).expect(200);
        expect((body.data.items?.[0] ?? body.data).favorite).toBe(favorite);
      }
    };

    await assertPublicFavorites(false);
    expect(callModule.mock.calls.some(([route]) => route === 'user/playlist')).toBe(false);
    failList = false;
    await get('user/playlist/list').expect(200);
    await assertPublicFavorites(true);
    failList = true;
    await get('user/playlist/list').expect(500);
    await assertPublicFavorites(true);
    failList = false;
    saved = false;
    await get('user/playlist/list').expect(200);
    await assertPublicFavorites(false);
    expect(callModule.mock.calls.filter(([route]) => route === 'user/playlist')).toHaveLength(3);
  });

  test('full snapshots replace saved IDs, preserve own false, and remain account isolated', () => {
    const first = new PlaylistFavorites();
    const second = new PlaylistFavorites();
    first.replace([playlist('own', false), playlist('saved', true)]);
    expect(first.apply(playlist('own', true), true).favorite).toBe(false);
    expect(first.apply(playlist('saved', false)).favorite).toBe(true);
    expect(second.apply(playlist('saved', true)).favorite).toBe(false);
    first.replace([playlist('other', true)]);
    expect(first.apply(playlist('saved', true)).favorite).toBe(false);
    expect(first.apply(playlist('other', false), false).favorite).toBe(false);
    first.set('other', true);
    expect(first.apply(playlist('other', false)).favorite).toBe(true);
    first.clear();
    expect(first.apply(playlist('other', true)).favorite).toBe(false);
  });

  test.each([
    ['Netease', NeteaseClient, 'MUSIC_U=cookie'],
    ['QQ', QQClient, 'uin=o1; qm_keyst=cookie']
  ])('%s rebuilds list state and shares confirmed mutations across requests', async (_, Client, cookie) => {
    let saved = true;
    let fail = false;
    global.__musicPlatformFactory__ = { getPlatform: () => ({ callModule: jest.fn(async (route) => {
      if (route === 'user/playlist') return { code: 200, playlist: [
        { id: 'own', name: 'Own', subscribed: false, creator: { userId: '1' } },
        ...(saved ? [{ id: 'saved', name: 'Saved', subscribed: true, creator: { userId: '2' } }] : [])
      ] };
      if (route === 'playlist/detail') return { code: 200, playlist: { id: 'saved', name: 'Saved', tracks: [] } };
      if (route === 'playlist/subscribe') return fail ? { code: 200, body: { code: 501, retCode: 1 } } : { code: 200 };
      if (route === 'search') return { code: 200, result: { playlists: [{ id: 'saved', name: 'Saved' }] } };
      return { code: 200 };
    }) }) };
    const state = new PlaylistFavorites();
    const first = new Client(cookie);
    first.playlistFavorites = state;
    expect((await first.getUserPlaylist()).map(p => p.favorite)).toEqual([false, true]);
    const next = new Client(cookie);
    next.playlistFavorites = state;
    expect((await next.getPlaylistDetail('saved', 0)).favorite).toBe(true);
    await expect(first.favoritePlaylist('saved', false)).resolves.toMatchObject({ success: true, status: false });
    expect((await next.getPlaylistDetail('saved', 0)).favorite).toBe(false);
    fail = true;
    await expect(first.favoritePlaylist('saved', true)).resolves.toMatchObject({ success: false });
    expect((await next.getPlaylistDetail('saved', 0)).favorite).toBe(false);
    saved = false;
    await first.getUserPlaylist();
    expect(state.apply(playlist('saved', true)).favorite).toBe(false);
  });
});
