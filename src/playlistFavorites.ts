import type { Playlist } from 'aduoer-wow-sdk';

/** 账号独立的歌单缓存；读取不触发请求，完整列表、显式上游状态和成功写入更新快照。 */
export class PlaylistFavorites {
  private readonly states = new Map<string, boolean>();
  private readonly ownIDs = new Set<string>();
  clear(): void { this.states.clear(); this.ownIDs.clear(); }
  replace(playlists: Playlist[]): void {
    this.states.clear();
    this.ownIDs.clear();
    playlists.forEach((playlist) => {
      this.states.set(playlist.id, playlist.favorite);
      if (!playlist.favorite) this.ownIDs.add(playlist.id);
    });
  }
  set(id: string, favorite: boolean): void { this.states.set(id, this.ownIDs.has(id) ? false : favorite); }
  remove(id: string): void { this.states.delete(id); this.ownIDs.delete(id); }
  apply<T extends Playlist>(playlist: T, upstream?: boolean): T {
    if (upstream !== undefined) this.set(playlist.id, upstream);
    return { ...playlist, favorite: this.states.get(playlist.id) ?? false };
  }
}
