/**
 * 英語の単語を、OpenUtauのEnglish VCCV Phonemizerが使うCZ-SAMPA風の音素列に変換し、
 * 音節に分割する。辞書はCMUdict(OpenUtauが同梱するものと同じ)。
 */

export type Syllable = {
  /** 頭子音 */
  onset: string[];
  /** 母音 */
  v: string;
  /** 末尾子音 */
  coda: string[];
};

/** ARPAbet→VCCV音素。OpenUtauのdictionaryReplacementsと同じ対応 */
const arpaToVccv: Record<string, string> = {
  aa: "a",
  ae: "@",
  ah: "u",
  ao: "9",
  aw: "8",
  ay: "I",
  eh: "e",
  er: "3",
  ey: "A",
  ih: "i",
  iy: "E",
  ow: "O",
  oy: "Q",
  uh: "6",
  uw: "o",
  hh: "h",
  jh: "j",
  dx: "dd",
};
/** 音素体系。vccvはCZ-SAMPA風、arpaはARPAbetそのまま */
export type PhonemeScheme = "vccv" | "arpa";

const vccvVowels = new Set("a @ u 9 8 I e 3 A i E O Q 6 o".split(" "));
const arpaVowels = new Set(
  "aa ae ah ao aw ay eh er ey ih iy ow oy uh uw".split(" ")
);
const arpaPhonemes = new Set([
  ...arpaVowels,
  ..."b ch d dh f g hh jh k l m n ng p r s sh t th v w y z zh".split(" "),
]);
export const isVowel = (s: string, scheme: PhonemeScheme = "vccv"): boolean =>
  (scheme === "arpa" ? arpaVowels : vccvVowels).has(s);

let dict: Map<string, string[]> | undefined;
let loading: Promise<void> | undefined;

/** `word ph ph ph`形式の辞書テキストを読み込む */
export const setEnglishDict = (text: string): void => {
  const m = new Map<string, string[]>();
  for (const line of text.split("\n")) {
    const i = line.indexOf(" ");
    if (i > 0) m.set(line.slice(0, i), line.slice(i + 1).trim().split(" "));
  }
  dict = m;
};

/** 辞書をfetchして読み込む。複数回呼んでも読込は1回。失敗時は規則ベースの変換にフォールバックする。 */
export const loadEnglishDict = (): Promise<void> => {
  if (dict) return Promise.resolve();
  loading ??= fetch(`${import.meta.env.BASE_URL}dict/cmudict-en.txt`)
    .then((r) => {
      if (!r.ok) throw new Error(`cmudict: ${r.status}`);
      return r.text();
    })
    .then(setEnglishDict)
    .catch(() => {
      loading = undefined;
    });
  return loading;
};

/** 辞書にない単語向けの簡易なつづり→音素規則。精度は低い */
const spellToArpa = (word: string): string[] => {
  const rules: Array<[RegExp, string[]]> = [
    [/^sh/, ["sh"]],
    [/^ch/, ["ch"]],
    [/^th/, ["th"]],
    [/^ng/, ["ng"]],
    [/^ph/, ["f"]],
    [/^ck/, ["k"]],
    [/^qu/, ["k", "w"]],
    [/^oo/, ["uw"]],
    [/^ee|^ea/, ["iy"]],
    [/^ai|^ay/, ["ey"]],
    [/^oa|^ow/, ["ow"]],
    [/^ou/, ["aw"]],
    [/^oi|^oy/, ["oy"]],
    [/^a/, ["ae"]],
    [/^e/, ["eh"]],
    [/^i/, ["ih"]],
    [/^o/, ["aa"]],
    [/^u/, ["ah"]],
    [/^c/, ["k"]],
    [/^j/, ["jh"]],
    [/^x/, ["k", "s"]],
    [/^h/, ["hh"]],
    [/^[bdfgklmnprstvwyz]/, []],
  ];
  const out: string[] = [];
  let rest = word;
  while (rest.length > 0) {
    // 語末のeは読まない
    if (rest === "e" && out.length > 0) break;
    const rule = rules.find(([re]) => re.test(rest));
    if (!rule) {
      rest = rest.slice(1);
      continue;
    }
    const m = rule[0].exec(rest)![0];
    out.push(...(rule[1].length ? rule[1] : [m]));
    rest = rest.slice(m.length);
  }
  return out;
};

/** ローマ字風の子音+母音(`ku`, `ba`, `shi`など)。辞書にない綴りに使う */
const romajiConsonants: Record<string, string[]> = {
  k: ["k"], g: ["g"], s: ["s"], z: ["z"], t: ["t"], d: ["d"], n: ["n"],
  h: ["hh"], b: ["b"], p: ["p"], m: ["m"], r: ["r"], y: ["y"], w: ["w"],
  f: ["f"], v: ["v"], l: ["l"], j: ["jh"], sh: ["sh"], ch: ["ch"],
  th: ["th"], dh: ["dh"], ng: ["ng"], zh: ["zh"],
};
const romajiVowels: Record<string, string> = {
  a: "aa", i: "iy", u: "uw", e: "eh", o: "ow",
};
const romajiSyllable = (word: string): string[] | null => {
  const m = /^(sh|ch|th|dh|ng|zh|[kgsztdnhbpmrywfvlj])?([aiueo])$/.exec(word);
  if (!m) return null;
  return [...(m[1] ? romajiConsonants[m[1]] : []), romajiVowels[m[2]]];
};

/**
 * 単語またはARPAbetヒント(`[hh ah l ow]`)を音素列にする。変換できなければnull。
 */
export const wordToSymbols = (
  lyric: string,
  scheme: PhonemeScheme = "vccv"
): string[] | null => {
  const hint = /^\[([a-z ]+)\]$/i.exec(lyric.trim());
  // `k ae t`のように3音素以上をARPAbetだけで書いた歌詞も、`[k ae t]`と同じ発音指定として扱う
  const bare = lyric.toLowerCase().trim().split(/\s+/);
  const bareArpa =
    bare.length >= 3 && bare.every((p) => arpaPhonemes.has(p)) ? bare : null;
  // ARPAbet音源では、`ay`や`uw`のように音素1つだけの歌詞を、英単語ではなくその音素として読む
  const bareVowel =
    scheme === "arpa" && arpaVowels.has(lyric.toLowerCase().trim())
      ? [lyric.toLowerCase().trim()]
      : null;
  let arpa: string[];
  if (hint || bareArpa || bareVowel) {
    arpa =
      bareArpa ??
      bareVowel ??
      hint![1].toLowerCase().split(/\s+/).filter(Boolean);
  } else {
    // 語頭語末の句読点(`hello,`など)は無視する。`!`は音源のエイリアスを直接指定する印なので除く
    const text = lyric
      .toLowerCase()
      .trim()
      .replace(/^[,.;:?"“”()]+|[,.;:?"“”()]+$/g, "");
    const word = text.replace(/[^a-z']/g, "");
    if (word === "" || word !== text) return null;
    const entry = dict?.get(word);
    const romaji = romajiSyllable(word);
    // `ba`のようにCMUdictが文字の読み(b iy ey)を持つ短い綴りは、ローマ字読みを優先する
    const oneSyllable =
      entry !== undefined &&
      entry.filter((p) => isVowel(p, "arpa")).length === 1;
    arpa = (oneSyllable ? entry : romaji ?? entry ?? spellToArpa(word))!;
  }
  const syms =
    scheme === "arpa" ? arpa : arpa.map((p) => arpaToVccv[p] ?? p);
  return syms.some((p) => isVowel(p, scheme)) ? syms : null;
};

const stopsAndFricatives = new Set(
  "p b t d k g f v th dh sh ch j jh".split(" ")
);
const glides = new Set(["l", "r", "w", "y"]);

/** 子音列が音節頭に置ける組み合わせか */
const legalOnset = (cs: string[]): boolean => {
  if (cs.length === 2) {
    if (cs[0] === "s") return ["p", "t", "k", "m", "n", "l", "w"].includes(cs[1]);
    if (cs[0] === "t" || cs[0] === "d") return cs[1] !== "l" && glides.has(cs[1]);
    return stopsAndFricatives.has(cs[0]) && glides.has(cs[1]);
  }
  if (cs.length === 3) {
    return (
      cs[0] === "s" &&
      ["p", "t", "k"].includes(cs[1]) &&
      glides.has(cs[2]) &&
      legalOnset(cs.slice(1))
    );
  }
  return cs.length === 1;
};

/** 音素列を音節に分割する(最大onset原則) */
export const syllabify = (
  syms: string[],
  scheme: PhonemeScheme = "vccv"
): Syllable[] => {
  const syls: Syllable[] = [];
  let cs: string[] = [];
  for (const s of syms) {
    if (!isVowel(s, scheme)) {
      cs.push(s);
      continue;
    }
    if (syls.length === 0) {
      syls.push({ onset: cs, v: s, coda: [] });
    } else {
      let n = Math.min(cs.length, 1);
      while (n < Math.min(cs.length, 3) && legalOnset(cs.slice(cs.length - n - 1))) n++;
      syls[syls.length - 1].coda = cs.slice(0, cs.length - n);
      syls.push({ onset: cs.slice(cs.length - n), v: s, coda: [] });
    }
    cs = [];
  }
  if (syls.length > 0) syls[syls.length - 1].coda = cs;
  return syls;
};

/** 単語を音節にする。英単語として扱えなければnull */
export const wordToSyllables = (
  lyric: string,
  scheme: PhonemeScheme = "vccv"
): Syllable[] | null => {
  const syms = wordToSymbols(lyric, scheme);
  return syms ? syllabify(syms, scheme) : null;
};
