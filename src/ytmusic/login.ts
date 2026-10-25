import { Cookie, domainMatch } from 'tough-cookie';
import { YTMusicClient } from '../clients/YTMusicClient';
import { UpstreamError } from '../errors';
import { clearYTMusicVisitorCache } from './api';

/** 浏览器 Cookie 登录没有 OAuth refresh token，通过新会话接收服务端更新并验证授权。 */
export async function refreshYTMusicCookie(cookie: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch('https://music.youtube.com', {
      headers: {
        Cookie: cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    throw new UpstreamError(`YouTube Music 授权刷新失败: ${(error as Error).message}`);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new UpstreamError(`YouTube Music 授权刷新返回 HTTP ${response.status}，请尝试重新登录`);
  }
  await response.body?.cancel();

  const cookies = new Map(cookie.split(';').flatMap(part => {
    const item = Cookie.parse(part.trim());
    return item ? [[item.key, item.value] as const] : [];
  }));
  const headers = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  for (const header of headers.flatMap(value => value.split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/))) {
    const item = Cookie.parse(header);
    if (!item || (item.domain && !domainMatch('music.youtube.com', item.domain)) || (item.path && item.path !== '/')) continue;
    if (!item.value || item.TTL() <= 0) cookies.delete(item.key);
    else cookies.set(item.key, item.value);
  }
  const refreshedCookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
  clearYTMusicVisitorCache(cookie);
  clearYTMusicVisitorCache(refreshedCookie);
  try {
    // 成功加载页面不代表已经登录，确认账号接口识别授权后才能持久化。
    await new YTMusicClient(refreshedCookie).getUserMe();
  } catch (error) {
    throw new UpstreamError(`YouTube Music 授权刷新失败，请尝试重新登录: ${(error as Error).message}`);
  }
  return refreshedCookie;
}
