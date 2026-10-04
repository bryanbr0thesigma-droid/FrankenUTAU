/**
 * 英語VCCV音源(CZ-SAMPA風の記号。`-dhA`、`A s`、`_ra`、`em-`など、1ノート=1ピース)向けに
 * 打たれたustの歌詞を、ARPAbetのCVVC音源(`dh ey`、`ey s`、`- ah`など)のエイリアスへ変換する。
 *
 * VCCVのピースのうち、CVVC音源に対応するものだけを残す。
 * - `-dhA`/`sA`/`_ra`(子音+母音) → `dh ey`/`s ey`/`r aa`
 * - `A s`/`an`/`em-`(母音+子音) → `ey s`/`ae n`/`eh m`
 * - `-u`(語頭の母音) → `- ah`
 * - 母音だけのピース(`A`、`AI`、`O-`)は伸ばしなので、直前のCVノートの長さに足して1つにまとめる
 * - 子音だけのピース(`pr`、`-tr`、`st`)や、音源にない組は休符にする
 */
import type { Note } from "../Note";

/** VCCVの母音記号→ARPAbet */
const vowels: Record<string, string> = {
  a: "aa",
  "@": "ae",
  "&": "ae",
  u: "ah",
  x: "ah",
  "9": "ao",
  "8": "aw",
  I: "ay",
  e: "eh",
  "3": "er",
  "0": "er",
  A: "ey",
  i: "ih",
  "1": "ih",
  E: "iy",
  O: "ow",
  Q: "oy",
  "6": "uh",
  U: "uh",
  o: "uw",
};
/** VCCVの子音記号→ARPAbet。2文字のものを先に試す */
const consonants: Record<string, string> = {
  ch: "ch",
  dh: "dh",
  ng: "ng",
  sh: "sh",
  th: "th",
  zh: "zh",
  b: "b",
  d: "d",
  f: "f",
  g: "g",
  h: "hh",
  j: "jh",
  k: "k",
  l: "l",
  m: "m",
  n: "n",
  p: "p",
  r: "r",
  s: "s",
  t: "t",
  v: "v",
  w: "w",
  y: "y",
  z: "z",
};

/**
 * 音源にそのエイリアスが無いとき(録音が欠けた音源)に、休符にする代わりに使う近い母音。近い順。
 */
const similarVowels: Record<string, string[]> = {
  aa: ["ao", "ah", "ae"],
  ae: ["eh", "aa", "ah"],
  ah: ["aa", "uh", "ae", "eh"],
  ao: ["aa", "ow", "ah"],
  aw: ["ow", "aa", "ao"],
  ay: ["aa", "ey", "iy"],
  eh: ["ae", "ih", "ey", "ah"],
  er: ["ah", "uh", "eh"],
  ey: ["eh", "iy", "ih"],
  ih: ["iy", "eh", "ey"],
  iy: ["ih", "ey"],
  ow: ["ao", "uw", "aw"],
  oy: ["ow", "ao"],
  uh: ["uw", "ah", "ow"],
  uw: ["uh", "ow"],
};

type Token = { v: string } | { c: string };

/** ピースを音素に分ける。読めない記号があればnull */
const tokenize = (s: string): Token[] | null => {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const two = s.slice(i, i + 2);
    if (two.length === 2 && consonants[two]) {
      out.push({ c: consonants[two] });
      i += 2;
    } else if (vowels[s[i]]) {
      out.push({ v: vowels[s[i]] });
      i++;
    } else if (consonants[s[i]]) {
      out.push({ c: consonants[s[i]] });
      i++;
    } else {
      return null;
    }
  }
  return out;
};

export type Piece =
  | { kind: "rest" }
  /** approxは、音源に無い母音を近い母音で代用したこと */
  | { kind: "cv" | "vc" | "initV"; alias: string; approx?: boolean }
  /** 母音の伸ばし。直前のノートに足す */
  | { kind: "hold" };

/**
 * VCCVのピース1つをCVVCのピースにする。VCCVのピースとして読めなければnull。
 * @param resolve ARPAbetのエイリアスが音源にあればその名前(別テイクを含む)を、無ければnullを返す
 */
export const parseVccvPiece = (
  lyric: string,
  resolve: (alias: string) => string | null
): Piece | null => {
  if (lyric === "R") return { kind: "rest" };
  const initial = lyric.startsWith("-");
  const body = lyric
    .replace(/^[-_]/, "")
    .replace(/-$/, "")
    .replace(/ /g, "");
  const tokens = body === "" ? null : tokenize(body);
  // VCCVのピースは最大でも子音3つ+母音(`str`+母音は別ピース)なので、長いものは英単語など別物
  if (!tokens || tokens.length > 3) return null;
  // `0r`のように、母音の直後のrは母音の一部とみなす
  const t = tokens.filter(
    (tok, i) => !(i > 0 && "c" in tok && tok.c === "r" && "v" in tokens[i - 1] && tokens[i - 1]["v"] === "er")
  );
  const rest: Piece = { kind: "rest" };
  /** 母音vと、もう片方の音素(子音または`-`)からエイリアスを作る。母音が欠けていれば近い母音を試す */
  const make = (
    kind: "cv" | "vc" | "initV",
    other: string,
    vowel: string
  ): Piece => {
    const name = (v: string) => (kind === "vc" ? `${v} ${other}` : `${other} ${v}`);
    const exact = resolve(name(vowel));
    if (exact) return { kind, alias: exact };
    for (const v of similarVowels[vowel] ?? []) {
      const near = resolve(name(v));
      if (near) return { kind, alias: near, approx: true };
    }
    return rest;
  };
  if (t.length === 1 && "v" in t[0]) {
    return initial ? make("initV", "-", t[0].v) : { kind: "hold" };
  }
  if (t.length === 2 && "c" in t[0] && "v" in t[1]) {
    return make("cv", t[0].c, t[1].v);
  }
  if (t.length === 2 && "v" in t[0] && "c" in t[1]) {
    return make("vc", t[1].c, t[0].v);
  }
  if (t.every((tok) => "v" in tok)) return { kind: "hold" };
  // `h9l`のようにCVCのピースは、音源にあるCV部分だけを使う
  if (t.length === 3 && "c" in t[0] && "v" in t[1] && "c" in t[2]) {
    return make("cv", t[0].c, t[1].v);
  }
  // `arb`のようにVCCのピースは、音源にあるVC部分だけを使う
  if (t.length === 3 && "v" in t[0] && "c" in t[1] && "c" in t[2]) {
    return make("vc", t[1].c, t[0].v);
  }
  // `str`のようにCCVのピースは、母音の直前の子音とのCVだけを使う
  if (t.length === 3 && "c" in t[0] && "c" in t[1] && "v" in t[2]) {
    return make("cv", t[1].c, t[2].v);
  }
  // 子音だけ(`pr`、`st`)や、これ以外のピース
  return rest;
};

export type ConvertResult = {
  notes: Note[];
  /** CVVCのエイリアスにした数 */
  converted: number;
  /** 直前のノートにまとめた伸ばしの数 */
  merged: number;
  /** 休符にした数 */
  rests: number;
  /** 音源に無い母音を近い母音で代用した数。convertedに含まれる */
  approximated: number;
};

/**
 * ustのノートがVCCVのピースで書かれていて、音源(ARPAbetのCVVC)では引けない場合に、歌詞を変換する。
 * 変換するのは、休符以外の歌詞のほとんどが音源になく、かつほとんどがVCCVのピースとして読める場合だけ。
 * そうでなければnullを返し、ノートには触れない。
 * @param has 音源にそのエイリアスがあるか
 */
export const convertVccvNotes = (
  notes: Note[],
  has: (alias: string) => boolean
): ConvertResult | null => {
  const resolve = (alias: string): string | null => {
    if (has(alias)) return alias;
    for (let i = 1; i <= 9; i++) if (has(alias + i)) return alias + i;
    return null;
  };
  const sung = notes.filter((n) => n.lyric !== "R" && n.lyric !== "");
  if (sung.length === 0) return null;
  // 小文字の英単語(`go`、`run`)もピースとして読めてしまうので、VCCVに特有の記号を持つ歌詞が
  // 十分にある場合だけ対象にする。(`-`や`_`の付いたピース、大文字の母音、数字、`&`、`@`)
  const marked = sung.filter((n) => /[-_AEIOQ&@0-9]/.test(n.lyric));
  if (marked.length < sung.length * 0.3) return null;
  const missing = sung.filter((n) => !has(n.lyric));
  const readable = missing.filter((n) => parseVccvPiece(n.lyric, resolve) !== null);
  if (missing.length < sung.length * 0.7 || readable.length < missing.length * 0.7) {
    return null;
  }
  const out: Note[] = [];
  let converted = 0;
  let merged = 0;
  let rests = 0;
  let approximated = 0;
  /** 直前のノートがCVかどうか。伸ばしを足せるのはCVだけ */
  let prevHoldable = false;
  for (const n of notes) {
    const piece =
      n.lyric === "R" || has(n.lyric) ? null : parseVccvPiece(n.lyric, resolve);
    if (piece === null) {
      // 休符や、音源にそのままあるエイリアスは触らない
      out.push(n);
      prevHoldable = false;
      continue;
    }
    n.clearTimingOverrides();
    if (piece.kind === "hold" && prevHoldable) {
      const prev = out[out.length - 1];
      prev.length = prev.length + n.length;
      merged++;
      continue;
    }
    if (piece.kind === "rest" || piece.kind === "hold") {
      n.lyric = "R";
      rests++;
      prevHoldable = false;
    } else {
      n.lyric = piece.alias;
      converted++;
      if (piece.approx) approximated++;
      prevHoldable = piece.kind !== "vc";
    }
    out.push(n);
  }
  return { notes: out, converted, merged, rests, approximated };
};
