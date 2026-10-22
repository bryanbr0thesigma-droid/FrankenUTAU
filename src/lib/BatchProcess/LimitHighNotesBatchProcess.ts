import { SelectUIProp } from "../../types/batchProcess";
import { BaseBatchProcess } from "../BaseBatchProcess";
import { Note } from "../Note";

/**
 * 指定した音高より高いノートを、その音高以下になるまで1オクターブずつ下げる。
 * 音名は変わらず、ピッチ曲線などノートごとの設定にも触らない。休符は無視する。
 */

export interface LimitHighNotesBatchProcessOptions {
  /** この音高(notenum)より高いノートを下げる */
  ceiling: number;
}

/** 選べる上限の音高。表示名は`batchprocess.limitHighNotesBatchProcess.ceilingOptions`と同じ順 */
export const CEILING_NOTENUMS = [65, 67, 69, 71, 72, 74, 76, 79];

export class LimitHighNotesBatchProcess extends BaseBatchProcess<LimitHighNotesBatchProcessOptions> {
  title = "batchprocess.limitHighNotesBatchProcess.title";
  summary = "notenum:高いノートを1オクターブずつ下げて上限に収める";

  public override process(
    notes: Note[],
    options: LimitHighNotesBatchProcessOptions
  ): Note[] {
    return super.process(notes, options);
  }

  protected _process(
    notes: Note[],
    options: LimitHighNotesBatchProcessOptions
  ): Note[] {
    const newNotes = notes.map((n) => n.deepCopy());
    const ceiling = options?.ceiling ?? this.initialOptions.ceiling;
    newNotes.forEach((n) => {
      if (n.lyric === "R") return;
      let notenum = n.notenum;
      while (notenum > ceiling && notenum - 12 >= 24) notenum -= 12;
      if (notenum !== n.notenum) n.notenum = notenum;
    });
    return newNotes;
  }

  ui = [
    {
      key: "ceiling",
      labelKey: "batchprocess.limitHighNotesBatchProcess.ceiling",
      inputType: "select",
      options: CEILING_NOTENUMS,
      displayOptionKey: "batchprocess.limitHighNotesBatchProcess.ceilingOptions",
      defaultValue: "74",
    } as SelectUIProp<number>,
  ];

  initialOptions: LimitHighNotesBatchProcessOptions = {
    ceiling: 74,
  };
}
