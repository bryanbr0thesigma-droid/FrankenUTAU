/**
 * 短いノートの子音速度を上げる。早い曲の英語では、子音の固定部分が長いと母音と末尾の子音が
 * 押し出されて聞き取れなくなる。聞き比べで、既定(100)より150のほうが明瞭だった(200は不明瞭)。
 * ustにVelocityの指定があるノートと、`!`で音源のエイリアスを直接指定したノート(ピンインなど)には触れない。
 */
import type { Note } from "../Note";

export const FAST_NOTE_MS = 300;
export const FAST_NOTE_VELOCITY = 150;

/** 速度を変えたノートの数を返す */
export const speedUpShortNotes = (notes: Note[]): number => {
  let changed = 0;
  for (const n of notes) {
    if (n.lyric === "R" || n.lyric === "" || n.lyric.startsWith("!")) continue;
    if (n.velocity !== undefined && n.velocity !== 100) continue;
    if (n.msLength >= FAST_NOTE_MS) continue;
    n.velocity = FAST_NOTE_VELOCITY;
    changed++;
  }
  return changed;
};
