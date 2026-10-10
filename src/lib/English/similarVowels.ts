/**
 * 音源にそのエイリアスが無いとき(録音が欠けた音源)に、休符にする代わりに使う近い母音。近い順。
 */
export const similarVowels: Record<string, string[]> = {
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

/**
 * 音源にその子音の録音が無いとき(CASEには`zh`が全く無い)に、無音にする代わりに使う近い子音。近い順。
 * 有声・無声の対と、同じ位置で出す子音を選ぶ。
 */
export const similarConsonants: Record<string, string[]> = {
  zh: ["sh", "jh", "z"],
  jh: ["ch", "zh", "d"],
  ch: ["sh", "jh", "t"],
  sh: ["s", "ch", "zh"],
  dh: ["d", "th", "z"],
  th: ["s", "f", "dh"],
  v: ["f", "b"],
  f: ["v", "p"],
  z: ["s", "zh", "dh"],
  s: ["z", "sh"],
  ng: ["n", "g"],
  g: ["k", "d"],
  k: ["g", "t"],
  b: ["p", "v"],
  p: ["b", "f"],
  d: ["t", "dh"],
  t: ["d", "k"],
};
