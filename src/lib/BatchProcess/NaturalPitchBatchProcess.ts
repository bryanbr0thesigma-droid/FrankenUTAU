import { BaseBatchProcess } from "../BaseBatchProcess";
import { Note } from "../Note";

/**
 * ピッチを自然にする。ustxなどの機械的に打たれた曲は、音が変わる瞬間にピッチが階段状に飛び、
 * ビブラートも無いので、ロボットのように聞こえる。
 * - 前のノートと続いているノートは、前の音高からなめらかに移る(ポルタメント)。
 * - 長いノートには、ゆっくり入ってゆっくり消える小さなビブラートを付ける。
 * 休符には触らない。ピッチを自分で打ったノート(PBS/PBW/PBY/ビブラートの指定があるノート)も触らない。
 */

/** ポルタメントの長さ(ms)。ノートの頭の少し前から始まる */
export const PORTAMENTO_MS = 80;
/** ポルタメントがノートの頭より前に出る割合 */
export const PORTAMENTO_LEAD = 0.6;
/** ビブラートを付けるノートの最小の長さ(ms) */
export const VIBRATO_MIN_MS = 500;
/** `length,cycle,depth,fadeIn,fadeOut,phase,height`。ノートの後ろ6割に、周期190ms・±35centで */
export const VIBRATO = "60,190,35,40,20,0,0";

export class NaturalPitchBatchProcess extends BaseBatchProcess<void> {
  title = "batchprocess.naturalPitchBatchProcess.title";
  summary = "pitch:ポルタメントとビブラートでピッチを自然にする";

  protected _process(notes: Note[]): Note[] {
    // 実験用: 聞き比べのため、片方だけ適用する
    const mode = (globalThis as { __FRANKEN?: { naturalMode?: string } })
      .__FRANKEN?.naturalMode;
    const newNotes = notes.map((n) => n.deepCopy());
    newNotes.forEach((n, i) => {
      if (n.lyric === "R") return;
      const hasPitch =
        (n.pbw !== undefined && n.pbw.length > 0) ||
        (n.pby !== undefined && n.pby.length > 0);
      if (!hasPitch && mode !== "vibrato") {
        const prev = newNotes[i - 1];
        // 前のノートが歌と続いているときだけ、前の音高から移る
        if (prev !== undefined && prev.lyric !== "R") {
          n.pbs = `${-PORTAMENTO_MS * PORTAMENTO_LEAD};0`;
          n.setPbw([PORTAMENTO_MS]);
          n.setPby([0]);
          n.setPbm([""]);
        }
      }
      if (
        mode !== "glide" &&
        n.vibrato === undefined &&
        n.msLength >= VIBRATO_MIN_MS
      ) {
        n.vibrato = VIBRATO;
      }
    });
    return newNotes;
  }

  /** UIは不要 */
}
