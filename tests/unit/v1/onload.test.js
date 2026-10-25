jest.mock('../../../src/clients/QQClient', () => ({
  QQClient: jest.fn().mockImplementation(() => ({
    userFavoriteTracks: jest.fn().mockResolvedValue([{ id: '1' }]),
    userArtists: jest.fn().mockResolvedValue([{ id: 'artist-1' }]),
    userAlbums: jest.fn().mockResolvedValue([{ id: 'album-1' }]),
    getUserPlaylist: jest.fn().mockResolvedValue([]),
    createPlaylist: jest.fn(), deletePlaylist: jest.fn()
  }))
}));

jest.mock('../../../src/clients/NeteaseClient', () => ({
  NeteaseClient: jest.fn().mockImplementation(() => ({
    userFavoriteTracks: jest.fn().mockResolvedValue([{ id: '1' }]),
    userArtists: jest.fn().mockResolvedValue([{ id: 'artist-1' }]),
    userAlbums: jest.fn().mockResolvedValue([{ id: 'album-1' }]),
    getUserPlaylist: jest.fn().mockResolvedValue([]),
    createPlaylist: jest.fn(), deletePlaylist: jest.fn()
  }))
}));

const { QQClient } = require('../../../src/clients/QQClient');
const { NeteaseClient } = require('../../../src/clients/NeteaseClient');
const { preloadData } = require('../../../src/onload');

describe('onload', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    QQClient.mockImplementation(() => ({
      userFavoriteTracks: jest.fn().mockResolvedValue([{ id: '1' }]),
      userArtists: jest.fn().mockResolvedValue([{ id: 'artist-1' }]),
      userAlbums: jest.fn().mockResolvedValue([{ id: 'album-1' }]),
      getUserPlaylist: jest.fn().mockResolvedValue([]),
      createPlaylist: jest.fn(), deletePlaylist: jest.fn()
    }));
    NeteaseClient.mockImplementation(() => ({
      userFavoriteTracks: jest.fn().mockResolvedValue([{ id: '1' }]),
      userArtists: jest.fn().mockResolvedValue([{ id: 'artist-1' }]),
      userAlbums: jest.fn().mockResolvedValue([{ id: 'album-1' }]),
      getUserPlaylist: jest.fn().mockResolvedValue([]),
      createPlaylist: jest.fn(), deletePlaylist: jest.fn()
    }));
  });

  afterEach(() => {
    warnSpy.mockRestore();
    jest.clearAllMocks();
  });

  test('没有 QQ 账号 cookie 时跳过收藏预加载', async () => {
    await preloadData({});

    expect(QQClient).not.toHaveBeenCalled();
    expect(NeteaseClient).not.toHaveBeenCalled();
  });

  test('异步触发洛雪源加载而不等待其完成', async () => {
    const lifecycle = {
      start: jest.fn(),
      updateAll: jest.fn(),
      stop: jest.fn()
    };

    await preloadData({}, undefined, lifecycle);

    expect(lifecycle.start).toHaveBeenCalledTimes(1);
  });

  test('QQ 账号 cookie 存在时执行收藏预加载', async () => {
    const favoriteTrackIds = new Set()
    const favoriteArtistIds = new Set()
    const favoriteAlbumIds = new Set()
    const userPlaylistIds = new Set()
    const session = { platform: 'qq', name: 'QQ', cookie: 'uin=o123; qm_keyst=abc', apiAccessKey: 'key', favoriteTrackIds, favoriteArtistIds, favoriteAlbumIds, userPlaylistIds }
    await preloadData({}, {
      sessions: [session],
      byAccessKey: new Map()
    });

    expect(QQClient).toHaveBeenCalledWith('uin=o123; qm_keyst=abc', favoriteTrackIds, favoriteArtistIds, favoriteAlbumIds, userPlaylistIds, undefined);
    expect(session.favoriteArtistsLoaded).toBe(true)
    expect(session.favoriteAlbumsLoaded).toBe(true)
    expect(QQClient.mock.results[0].value.getUserPlaylist).toHaveBeenCalledTimes(1)
  });

  test('网易账号 cookie 存在时执行收藏预加载', async () => {
    const favoriteTrackIds = new Set()
    const favoriteArtistIds = new Set()
    const favoriteAlbumIds = new Set()
    const userPlaylistIds = new Set()
    const session = { platform: 'netease', name: '网易云', cookie: 'MUSIC_U=abc', apiAccessKey: 'key', favoriteTrackIds, favoriteArtistIds, favoriteAlbumIds, userPlaylistIds }
    await preloadData({}, {
      sessions: [session],
      byAccessKey: new Map()
    });

    expect(NeteaseClient).toHaveBeenCalledWith('MUSIC_U=abc', favoriteTrackIds, favoriteArtistIds, favoriteAlbumIds, userPlaylistIds);
    expect(session.favoriteArtistsLoaded).toBe(true)
    expect(session.favoriteAlbumsLoaded).toBe(true)
    expect(NeteaseClient.mock.results[0].value.getUserPlaylist).toHaveBeenCalledTimes(1)
  });
});
