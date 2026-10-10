/**
 * 短いノートの子音速度を上げる。早い曲の英語では、子音の固定部分が長いと母音と末尾の子音が
 * 押し出されて聞き取れなくなる。聞き比べで、既定(100)より150のほうが明瞭だった(200は不明瞭)。
 *
 * さらに、固定部分が特に長い音(`y uw`は337ms、`sh uw`は365ms)は、短いノートでは母音まで届かず、
 * `you`が`yee`、`shu`が「シー」というノイズだけになる。固定部分のうちノート内に収まる長さ
 * (固定部分 - プリウタランス)が、ノートの半分以下になるまで、子音速度をさらに上げる(上限200)。
 * ustにVelocityの指定があるノートには触れない。
 */
import type { Note } from "../Note";

export const FAST_NOTE_MS = 300;
export const FAST_NOTE_VELOCITY = 150;
export const MAX_VELOCITY = 200;
/** 子音の固定部分がノートの長さに占めてよい割合 */
export const MAX_CONSONANT_SHARE = 0.5;

/** そのノートに合う子音速度 */
export const velocityFor = (n: Note): number => {
  const base = n.msLength < FAST_NOTE_MS ? FAST_NOTE_VELOCITY : 100;
  const oto = n.oto;
  if (!oto) return base;
  const inNote = oto.velocity - oto.pre;
  if (!(inNote > 0)) return base;
  const rate = Math.min(1, (MAX_CONSONANT_SHARE * n.msLength) / inNote);
  const v = Math.round(100 - 100 * Math.log2(rate));
  return Math.min(MAX_VELOCITY, Math.max(base, v));
};

/** 速度を変えたノートの数を返す。音源を適用(applyOto)したあとに呼ぶ */
export const speedUpShortNotes = (notes: Note[]): number => {
  let changed = 0;
  for (const n of notes) {
    if (n.lyric === "R" || n.lyric === "") continue;
    if (n.velocity !== undefined && n.velocity !== 100) continue;
    const v = velocityFor(n);
    if (v === 100) continue;
    n.velocity = v;
    changed++;
  }
  return changed;
};
