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
