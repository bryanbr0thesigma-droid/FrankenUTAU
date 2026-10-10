/**
 * 音源にそのエイリアスが無いとき(録音が欠けた音源)に、休符にする代わりに使う近い母音。近い順。
 */
export const similarVowels: Record<string, string[]> = {
  aa: ["ao", "ah", "ae"],
  ae: ["eh", "aa", "ah"],
  ah: ["aa", "uh", "ae", "eh"],
  ao: ["aa", "ow", "ah"],
  // 二重母音は、始まりの母音に近いものを先にする(`aw`は`aa`で始まる。`ow`で代用すると、続く`aw er`と繋がらず`so-awer`になる)
  aw: ["aa", "ao", "ow"],
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
  // 有声音は有声音で代用する(`zh`を無声の`sh`にすると、pleasureがpressureに聞こえる)
  zh: ["z", "jh", "sh"],
  jh: ["ch", "zh"],
  ch: ["sh", "jh"],
  sh: ["s", "ch", "zh"],
  dh: ["z", "th", "d"],
  th: ["s", "f", "dh"],
  v: ["f", "b"],
  f: ["v"],
  z: ["s", "zh", "dh"],
  s: ["z", "sh"],
  ng: ["n", "g"],
  g: ["k", "d"],
  k: ["g", "t"],
  b: ["p", "v"],
  p: ["b"],
  d: ["t", "dh"],
  t: ["d", "k"],
};
