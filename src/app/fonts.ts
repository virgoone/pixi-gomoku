/** Display fonts come from Google Fonts; fall back to system fonts when offline. */
export const FONT_TITLE = '"ZCOOL KuaiLe", "PingFang SC", "Microsoft YaHei", sans-serif';
export const FONT_NUMBER = '"Lilita One", "ZCOOL KuaiLe", "PingFang SC", sans-serif';
export const FONT_BODY = '-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif';

export async function loadFonts(timeoutMs = 2500) {
  if (!('fonts' in document)) return;
  const load = Promise.all([
    document.fonts.load('48px "ZCOOL KuaiLe"', '五子棋开始胜利宝箱'),
    document.fonts.load('48px "Lilita One"', '0123456789+'),
  ]).catch(() => undefined);
  await Promise.race([load, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}
