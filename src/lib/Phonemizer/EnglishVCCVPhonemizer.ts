/**
 * 英語VCCV/VCV音源向けのphonemizer。OpenUtauのEnglish VCCV Phonemizerのエイリアス規則
 * (`-ba`, `ba`, `a b`, `ab-`, `aa`など。音素はCZ-SAMPA風)を、1ノート=CV+末尾VCという
 * このエンジンの構造に合わせて簡略化して移植したもの。
 *
 * 歌詞の入力方法はOpenUtauと同じ。
 * - 単語を先頭のノートに書き、続く音節のノートには`+`と書く。
 * - `[hh ah l ow]`のようにARPAbetで発音を直接指定できる。
 * - `!`を含む歌詞や英単語として解釈できない歌詞は、エイリアスとしてそのまま検索する。
 */
import type OtoRecord from "utauoto/dist/OtoRecord";
import {
  loadEnglishDict,
  wordToSyllables,
  type Syllable,
} from "../English/EnglishG2p";
import { Note } from "../Note";
import { BaseVoiceBank } from "../VoiceBanks/BaseVoiceBank";
import { JPAutoPhonemizer, type ConsonantParam } from "./JPAutoPhonemizer";

/** 母音の直後に母音が来るとき、間に補う半母音 */
const vvGlides: Record<string, string> = {
  o: "w",
  O: "w",
  "8": "w",
  W: "w",
  A: "y",
  I: "y",
  Y: "y",
  E: "y",
  Q: "y",
  i: "y",
  "3": "r",
};

const stops = new Set(["b", "d", "g", "k", "p", "t", "dd", "ch", "j"]);

type NoteInfo = {
  /** このノートのCVの直前に置く、前ノート末尾のVCが担当する子音 */
  lead: string | null;
};

const isPlus = (n: Note | undefined) =>
  n !== undefined && n.lyric !== undefined && n.lyric.startsWith("+");

export class EnglishVCCVPhonemizer extends JPAutoPhonemizer {
  name = "phonemizer.EnglishVCCVPhonemizer";

  private info = new WeakMap<Note, NoteInfo>();
  private sylCache = new Map<string, Syllable[] | null>();

  /** 英語辞書を読み込む。辞書がなくても規則ベースで動作する。 */
  load(): Promise<void> {
    return loadEnglishDict();
  }

  private syllablesOf(lyric: string): Syllable[] | null {
    if (!this.sylCache.has(lyric)) {
      this.sylCache.set(lyric, wordToSyllables(lyric));
    }
    return this.sylCache.get(lyric)!;
  }

  /** ノートが担当する音節を返す。英語として扱えないノート(休符など)はnull */
  private syllableOf(
    note: Note | undefined
  ): { syl: Syllable; hasCoda: boolean; isExt: boolean } | null {
    if (!note || note.lyric === undefined || note.lyric.includes("!")) {
      return null;
    }
    let head = note;
    let k = 0;
    while (isPlus(head) && head.prev) {
      head = head.prev;
      k++;
    }
    if (isPlus(head) || head.lyric === "R" || head.lyric.includes("!")) {
      return null;
    }
    const syls = this.syllablesOf(head.lyric);
    if (!syls || syls.length === 0) return null;
    let m = 1;
    for (let n = head.next; isPlus(n); n = n.next) m++;
    const last = syls.length - 1;
    const j = Math.min(k, last);
    const isExt = k > last;
    const hasCoda = j < last ? k === j : k === m - 1;
    return { syl: syls[j], hasCoda, isExt };
  }

  protected _getLastPhoneme(note: Note | undefined, vb: BaseVoiceBank): string {
    const s = this.syllableOf(note);
    return s ? s.syl.v : "-";
  }

  /** CVに使うエイリアスの候補を優先順に返す */
  private cvCandidates(
    note: Note
  ): Array<{ alias: string; lead: string | null }> | null {
    const cur = this.syllableOf(note);
    if (!cur) return null;
    const { onset, v } = cur.syl;
    if (cur.isExt) return [{ alias: v, lead: null }];
    const prevS = this.syllableOf(note.prev);
    const out: Array<{ alias: string; lead: string | null }> = [];
    const add = (alias: string, lead: string | null = null) =>
      out.push({ alias, lead });
    if (!prevS) {
      // フレーズの先頭
      if (onset.length === 0) {
        add(`-${v}`);
        add(v);
      } else if (onset.length === 1) {
        add(`-${onset[0]}${v}`);
        add(`${onset[0]}${v}`);
      } else {
        const last = onset[onset.length - 1];
        if (onset.length === 2) add(`-${onset[0]}${onset[1]}${v}`);
        add(`_${last}${v}`);
        add(`${last}${v}`);
      }
    } else if (onset.length === 0) {
      // 母音から母音へ
      const pv = prevS.syl.v;
      add(`${pv}${v}`);
      add(`${pv} ${v}`);
      const g = vvGlides[pv];
      if (g && pv !== v) add(`${g}${v}`, g);
      add(`_${v}`);
      add(v);
    } else {
      const last = onset[onset.length - 1];
      add(`${last}${v}`, onset[0]);
    }
    return out;
  }

  protected _applyOto(note: Note, vb: BaseVoiceBank): void {
    if (note.lyric === undefined) {
      throw new Error("lyric is not initial.");
    } else if (note.notenum === undefined) {
      throw new Error("notenum is not initial.");
    }
    const color = note.voiceColor ? note.voiceColor : "";
    let record: OtoRecord | null = null;
    let lead: string | null = null;
    const cands = this.cvCandidates(note);
    if (cands) {
      for (const c of cands) {
        record = vb.getOtoRecord(c.alias, note.notenum, color);
        if (record) {
          lead = c.lead;
          break;
        }
      }
    } else if (note.lyric !== "R") {
      record = vb.getOtoRecord(note.lyric.replace("!", ""), note.notenum, color);
    }
    this.info.set(note, { lead });
    if (record === null || record === undefined) {
      note.oto = undefined;
      note.otoPreutter = 0;
      note.otoOverlap = 0;
      note.atAlias = "R";
      note.atFilename = "";
    } else {
      note.oto = record;
      note.otoPreutter = record.pre;
      note.otoOverlap = record.overlap;
      note.atAlias = record.alias !== "" ? record.alias : note.lyric;
      note.atFilename =
        record.dirpath + (record.dirpath !== "" ? "/" : "") + record.filename;
    }
  }

  /**
   * noteの末尾に置くVCが担当する子音を返す。
   * 末尾子音(coda)があればそれを、なければ次のノートのCVの前に必要な子音を返す。
   * 語尾のcodaは`-`付き(例: `t-`)で返し、`a t-`のような終端エイリアスを探させる。
   * @param next VCを置くノートの次のノート
   */
  getNextConsonant(next: Note): ConsonantParam | null {
    const owner = next?.prev;
    const cur = this.syllableOf(owner);
    if (!owner || !cur) return null;
    const nextIsSyllable = this.syllableOf(next) !== null;
    let consonant: string | null = null;
    let ending = false;
    if (cur.hasCoda && cur.syl.coda.length > 0) {
      consonant = cur.syl.coda[0];
      ending = !nextIsSyllable;
    } else if (nextIsSyllable) {
      consonant = this.info.get(next)?.lead ?? null;
    }
    if (!consonant) return null;
    return {
      consonant: ending ? `${consonant}-` : consonant,
      cvs: [],
      type: ending ? "value" : stops.has(consonant) ? "stretch" : "preutter",
      lengthValue: stops.has(consonant) ? 80 : 120,
      crossfade: !ending && !stops.has(consonant),
    };
  }

  protected getOtoRecord(
    vb,
    prevPhoneme,
    lyric,
    notenum,
    voiceColor,
    vcMode: boolean = false
  ): OtoRecord | null {
    if (lyric === "") return null;
    if (!vcMode) return vb.getOtoRecord(lyric, notenum, voiceColor);
    const ending = lyric.endsWith("-");
    const c = ending ? lyric.slice(0, -1) : lyric;
    const aliases = ending
      ? [
          `${prevPhoneme}${c}-`,
          `${prevPhoneme} ${c}-`,
          `${prevPhoneme}${c}`,
          `${prevPhoneme} ${c}`,
        ]
      : [`${prevPhoneme} ${c}`, `${prevPhoneme}${c}`];
    for (const a of aliases) {
      const r = vb.getOtoRecord(a, notenum, voiceColor);
      if (r) return r;
    }
    return null;
  }

  getVCTargetLength(
    note: Note,
    vcOtoRecord: OtoRecord,
    consonantParam: ConsonantParam
  ): number {
    if (!note.next?.oto) return consonantParam.lengthValue;
    return super.getVCTargetLength(note, vcOtoRecord, consonantParam);
  }
}
