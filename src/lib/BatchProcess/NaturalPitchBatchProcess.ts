import { BaseBatchProcess } from "../BaseBatchProcess";
import { Note } from "../Note";

/**
 * ピッチを自然にする。ustxなどの機械的に打たれた曲は、音が変わる瞬間にピッチが階段状に飛ぶので、
 * ロボットのように聞こえる。前のノートと続いているノートは、前の音高からなめらかに移る(ポルタメント)。
 * 休符には触らない。ピッチを自分で打ったノート(PBW/PBYの指定があるノート)も触らない。
 *
 * ビブラートは付けない。聞き比べで、長いノートの小さなビブラートは「オートチューンのよう」に聞こえた。
 */

/** ポルタメントの長さ(ms)。ノートの頭の少し前から始まる */
export const PORTAMENTO_MS = 80;
/** ポルタメントがノートの頭より前に出る割合 */
export const PORTAMENTO_LEAD = 0.6;

/**
 * ノート列にポルタメントを付ける(その場で書き換える)。
 * @returns ポルタメントを付けたノートの数
 */
export const applyGlide = (notes: Note[]): number => {
  let count = 0;
  notes.forEach((n, i) => {
    if (n.lyric === "R") return;
    const hasPitch =
      (n.pbw !== undefined && n.pbw.length > 0) ||
      (n.pby !== undefined && n.pby.length > 0);
    const prev = notes[i - 1];
    // 前のノートが歌と続いているときだけ、前の音高から移る
    if (hasPitch || prev === undefined || prev.lyric === "R") return;
    n.pbs = `${-PORTAMENTO_MS * PORTAMENTO_LEAD};0`;
    n.setPbw([PORTAMENTO_MS]);
    n.setPby([0]);
    n.setPbm([""]);
    count++;
  });
  return count;
};

export class NaturalPitchBatchProcess extends BaseBatchProcess<void> {
  title = "batchprocess.naturalPitchBatchProcess.title";
  summary = "pitch:ポルタメントでピッチをなめらかにする";

  protected _process(notes: Note[]): Note[] {
    const newNotes = notes.map((n) => n.deepCopy());
    applyGlide(newNotes);
    return newNotes;
  }

  /** UIは不要 */
}
