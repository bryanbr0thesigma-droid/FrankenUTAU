/**
 * 英語phonemizerの共通実装。1ノート=CV+末尾VCというこのエンジンの構造に合わせて、
 * 単語を音節に分け、ノートごとにCVと末尾VCのエイリアスを選ぶ。
 * 音素体系ごとのエイリアス規則は、サブクラスの`cvCandidates`と`vcCandidates`で与える。
 *
 * 歌詞の入力方法はOpenUtauと同じ。
 * - 単語を先頭のノートに書き、続く音節のノートには`+`と書く。
 * - `[hh ah l ow]`のようにARPAbetで発音を直接指定できる。
 * - `!`を含む歌詞や英単語として解釈できない歌詞は、エイリアスとしてそのまま検索する。
 */
import type OtoRecord from "utauoto/dist/OtoRecord";
import type { ConsonantParam, ExtraTail } from "../Phonemizer/JPAutoPhonemizer";
import { JPAutoPhonemizer, fixedPartMs } from "../Phonemizer/JPAutoPhonemizer";
import { Note } from "../Note";
import { BaseVoiceBank } from "../VoiceBanks/BaseVoiceBank";
import {
  loadEnglishDict,
  wordToSyllables,
  type PhonemeScheme,
  type Syllable,
} from "./EnglishG2p";

/** CVエイリアスの候補。leadは、直前ノート末尾のVCが担当すべき子音 */
export type CvCandidate = { alias: string; lead: string | null };

export type CvContext = {
  onset: string[];
  v: string;
  /** 音節を持たない延長ノート(`+`が音節数を超えた分) */
  isExt: boolean;
  /** 直前ノートの母音。フレーズの先頭ならnull */
  prevV: string | null;
  /**
   * 直前ノートの語尾子音(複数なら最後の1つ)。直前の音節が子音で終わるときだけ。
   * 母音で始まるこのノートは、母音から母音への繋ぎではなく、この子音から母音への繋ぎで始める。
   */
  prevCoda: string | null;
};

type NoteInfo = { lead: string | null };

const fricatives = new Set(["s", "z", "sh", "zh"]);
const voicelessStops = new Set(["p", "t", "k"]);
const stops = new Set([
  "b",
  "d",
  "g",
  "k",
  "p",
  "t",
  "dd",
  "dx",
  "q",
  "ch",
  "j",
  "jh",
]);

const isPlus = (n: Note | undefined) =>
  n !== undefined && n.lyric !== undefined && n.lyric.startsWith("+");

/** CVの固定部分の長さ(ms)。子音速度(velocity)で縮む分を反映する */
export const fixedMs = (note: Note): number =>
  (note.oto?.velocity ?? 0) * note.velocityRate;

/**
 * 語尾の閉鎖音に解放のピース(`k -`)を足すノートの最小の長さ(ms)。聞き比べで、300msの`stick`では
 * 閉鎖音が聞こえるようになったが、200msの`up`では不自然になった
 */
export const MIN_RELEASE_NOTE_MS = 280;

/** 短いノートで末尾VCを縮めるときの下限(ms)。これより短いと子音が聞き取れないので省く */
export const MIN_TAIL_MS = 30;

/** 末尾VCの長さの上限を、ノート長に対する割合で表したもの */
export const TAIL_FRACTION = 0.35;

/** 母音で終わる語尾を表す、末尾VCの擬似子音 */
export const VOWEL_END = "-";

export abstract class EnglishPhonemizerBase extends JPAutoPhonemizer {
  protected abstract readonly scheme: PhonemeScheme;
  /** 語尾の母音を`a -`のようなエイリアスで閉じる音源か */
  protected readonly closesVowels: boolean = false;

  /** noteのCVエイリアス候補を優先順に返す */
  protected abstract cvCandidates(ctx: CvContext): CvCandidate[];
  /**
   * 母音prevから子音cへ繋ぐVCエイリアスの候補を優先順に返す。
   * @param ending 語尾の子音(直後が休符)か。cがVOWEL_ENDなら母音で終わる語尾
   */
  protected abstract vcCandidates(
    prev: string,
    c: string,
    ending: boolean,
  ): string[];

  private info = new WeakMap<Note, NoteInfo>();
  private sylCache = new Map<string, Syllable[] | null>();

  /** 英語辞書を読み込む。辞書がなくても規則ベースで動作する。 */
  load(): Promise<void> {
    return loadEnglishDict();
  }

  private syllablesOf(lyric: string): Syllable[] | null {
    if (!this.sylCache.has(lyric)) {
      this.sylCache.set(lyric, wordToSyllables(lyric, this.scheme));
    }
    return this.sylCache.get(lyric)!;
  }

  /** ノートが担当する音節を返す。英語として扱えないノート(休符など)はnull */
  protected syllableOf(note: Note | undefined): {
    syl: Syllable;
    hasCoda: boolean;
    isExt: boolean;
    atWordEnd: boolean;
  } | null {
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
    const atWordEnd = j === last && k === m - 1;
    return { syl: syls[j], hasCoda, isExt, atWordEnd };
  }

  protected _getLastPhoneme(note: Note | undefined, vb: BaseVoiceBank): string {
    const s = this.syllableOf(note);
    return s ? s.syl.v : "-";
  }

  /** 音源にあるエイリアスを探す。無ければ`alias1`〜`alias9`(別テイク)も試す */
  protected findRecord(
    vb: BaseVoiceBank,
    alias: string,
    notenum: number,
    color: string,
  ): OtoRecord | null {
    const base = vb.getOtoRecord(alias, notenum, color);
    if (base) return base;
    for (let i = 1; i <= 9; i++) {
      const r = vb.getOtoRecord(alias + i, notenum, color);
      if (r) return r;
    }
    return null;
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
    const cur = this.syllableOf(note);
    if (cur) {
      const prevS = this.syllableOf(note.prev);
      const cands = this.cvCandidates({
        onset: cur.syl.onset,
        v: cur.syl.v,
        isExt: cur.isExt,
        prevV: prevS ? prevS.syl.v : null,
        prevCoda:
          prevS && prevS.hasCoda && prevS.syl.coda.length > 0
            ? prevS.syl.coda[prevS.syl.coda.length - 1]
            : null,
      });
      for (const c of cands) {
        record = this.findRecord(vb, c.alias, note.notenum, color);
        if (record) {
          lead = c.lead;
          // 子音が1つだけの頭子音は、実際に鳴らすCVの子音に合わせる。録音が無くて近い子音で代用したとき
          // (`zh`→`z`)に、直前の末尾VCが元の子音(`sh`)へ繋ぐと、子音が食い違って聞こえるため
          if (lead !== null && cur.syl.onset.length === 1) {
            const played = c.alias.split(" ");
            if (played.length === 2 && played[0] !== "-") lead = played[0];
          }
          break;
        }
      }
    } else if (note.lyric !== "R") {
      record = vb.getOtoRecord(
        note.lyric.replace("!", ""),
        note.notenum,
        color,
      );
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
   * 語尾のcodaは`-`付き(例: `t-`)で返す。語尾の母音はVOWEL_ENDで返す(closesVowelsの音源のみ)。
   * @param next VCを置くノートの次のノート
   */
  /** 曲の最後のノートは、休符が続くものとして語尾の子音を鳴らす */
  protected getFinalConsonant(note: Note): ConsonantParam | null {
    const rest = new Note();
    rest.lyric = "R";
    rest.prev = note;
    return this.getNextConsonant(rest);
  }

  getNextConsonant(next: Note): ConsonantParam | null {
    const owner = next?.prev;
    const cur = this.syllableOf(owner);
    if (!owner || !cur) return null;
    const nextIsSyllable = this.syllableOf(next) !== null;
    let consonant: string | null = null;
    let ending = false;
    if (cur.hasCoda && cur.syl.coda.length > 0) {
      const coda = cur.syl.coda;
      consonant = coda[0];
      ending = !nextIsSyllable;
      // 閉鎖音で終わるVC(`ae t`)の録音は、閉鎖の無音で終わっていて、閉鎖音は聞こえない。
      // 無声閉鎖音の後に`s`が続くとき(`that's`の`t s`)は、聞こえる`s`のほうを鳴らす
      if (coda.length >= 2 && voicelessStops.has(coda[0]) && coda[1] === "s") {
        consonant = coda[1];
      } else if (
        coda.length === 1 &&
        (coda[0] === "ch" || coda[0] === "jh") &&
        nextIsSyllable &&
        (this.syllableOf(next)?.syl.onset.length ?? 1) === 0
      ) {
        // 音源に`ae ch`が無く`ae sh`(hash)になる。次が母音で始まるなら、閉鎖の`ae t`で終えて、
        // 次のノートの`ch ih`(hatch it)に破擦音を任せる
        consonant = coda[0] === "ch" ? "t" : "d";
      } else if (
        coda.length === 1 &&
        coda[0] === "n" &&
        nextIsSyllable &&
        (this.syllableOf(next)?.syl.onset.length ?? 0) >= 2 &&
        ["t", "d"].includes(this.info.get(next)?.lead ?? "")
      ) {
        // `in`+`trest`は、`n`を省いて`t`へ繋ぐ(鼻音と`t`は同じ位置で作る音)
        consonant = this.info.get(next)!.lead;
      } else if (coda.length === 1 && stops.has(coda[0]) && nextIsSyllable) {
        // 次が`s`+子音で始まるとき(`bit slow`)は、聞こえない語尾の閉鎖音を省いて、語頭の`s`へ繋ぐ
        const lead = this.info.get(next)?.lead;
        if (
          lead &&
          fricatives.has(lead) &&
          (this.syllableOf(next)?.syl.onset.length ?? 0) >= 2
        ) {
          consonant = lead;
        }
      }
    } else if (nextIsSyllable) {
      consonant = this.info.get(next)?.lead ?? null;
      // 次が`s`+子音(skull)のとき、短い`ay s`では`s`が聞こえず`kull`になるので、子音連続`s k`のピースで繋ぐ
      const nsyl = this.syllableOf(next)?.syl;
      if (consonant === "s" && nsyl && nsyl.onset.length >= 2) {
        consonant = `s ${nsyl.onset[1]}`;
      }
    } else if (this.closesVowels && cur.atWordEnd && next.lyric === "R") {
      return {
        consonant: VOWEL_END,
        cvs: [],
        type: "value",
        lengthValue: 150,
        crossfade: false,
      };
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
    vcMode: boolean = false,
  ): OtoRecord | null {
    if (lyric === "") return null;
    if (!vcMode) return vb.getOtoRecord(lyric, notenum, voiceColor);
    const ending = lyric !== VOWEL_END && lyric.endsWith("-");
    const c = ending ? lyric.slice(0, -1) : lyric;
    if (c.includes(" ")) return this.findRecord(vb, c, notenum, voiceColor);
    for (const a of this.vcCandidates(prevPhoneme, c, ending)) {
      const r = this.findRecord(vb, a, notenum, voiceColor);
      if (r) return r;
    }
    return null;
  }

  /**
   * 末尾VCの後ろに続ける、もう1つのピース。
   * - 子音が2つ以上続く音節(`sins`の`n z`、`list`の`s t`)は、子音連続のピース(`n z`)。
   *   VCだけでは最後の子音が落ちて`sin`や`liss`に聞こえる。
   * - 語尾が単独の閉鎖音で、直後が休符のとき(`stick`の`k`、`sip`の`p`)は、解放のピース(`k -`)。
   *   閉鎖音のVC(`ih k`)は、母音が消えたあとの無音(閉鎖)までしか録音されておらず、
   *   破裂の音は`k -`にある。無いと`sti`、`sii`のように聞こえる。
   * 音源にそのピースが無いときは付けない。
   */
  protected getExtraTail(
    vb: BaseVoiceBank,
    note: Note,
    nextConsonant: ConsonantParam | null,
  ): ExtraTail | null {
    const cur = this.syllableOf(note);
    if (!cur || !cur.hasCoda || !nextConsonant) return null;
    const coda = cur.syl.coda;
    const color = note.voiceColor ? note.voiceColor : "";
    const find = (alias: string) =>
      this.findRecord(vb, alias, note.notenum, color);
    const ending = nextConsonant.consonant.endsWith("-");
    const tailed = nextConsonant.consonant.replace(/-$/, "") === coda[0];
    if (coda.length >= 2 && tailed && ending) {
      const record = find(`${coda[0]} ${coda[1]}`);
      return record ? { record, kind: "cluster" } : null;
    }
    if (
      coda.length === 1 &&
      stops.has(coda[0]) &&
      tailed &&
      note.msLength >= MIN_RELEASE_NOTE_MS
    ) {
      const record = find(`${coda[0]} -`);
      return record ? { record, kind: "release" } : null;
    }
    return null;
  }

  /**
   * 末尾VCの長さ。短いノートでは、VCが収まらないとVCごと省かれて語尾の子音が鳴らなくなるので、
   * CVの固定部分を除いて残る長さまで縮めて、子音を残す。残りが短すぎる(MIN_TAIL_MS未満)ときは省く。
   * さらに、ノート長のTAIL_FRACTIONを上限にして、母音に時間を残す。
   */
  getVCTargetLength(
    note: Note,
    vcOtoRecord: OtoRecord,
    consonantParam: ConsonantParam,
  ): number {
    const full = note.next?.oto
      ? super.getVCTargetLength(note, vcOtoRecord, consonantParam)
      : consonantParam.lengthValue;
    const available = note.targetLength - fixedPartMs(note);
    const fitted =
      full > available && available >= MIN_TAIL_MS ? available : full;
    // 末尾VCがノートの大半を占めると母音に時間が残らず、早い曲で聞き取れなくなる。
    // ノート長のTAIL_FRACTION(35%)を上限にする(聞き比べで、無制限・50%より明瞭だった)
    const capped = Math.min(
      fitted,
      Math.max(MIN_TAIL_MS, note.msLength * TAIL_FRACTION),
    );
    return capped;
  }
}
