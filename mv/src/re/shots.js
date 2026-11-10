// The shot list of the reanimation: the official MV's structure and timing (measured from the
// video; the cover's full mix lines up with it at zero offset), with Adachi Rei in Miku's part
// and Corrupt-Chan in Teto's. Times in seconds. Lyrics as shown on screen in the official MV.
//
// Chorus card line kinds: c = first line, singer colour; w = white, large; W = white, huge;
// s = white, small; sc = singer colour, small; L = latin, singer colour, large.

// ---------- chorus cards (chorus 1 timing; choruses 2 and 3 repeat it 51.2 s and 107.2 s later) ----------
const CH1 = [
  { who: "rei", t0: 32.0, t1: 33.9, lines: [[32.05, "視覚信号", "c"], [33.2, "発射!", "W"], [33.6, "DANCE", "L"]] },
  { who: "cc", t0: 35.3, t1: 38.35, lines: [[35.45, "返事をくれるまで", "c"], [36.9, "絶えぬ 無限の", "w", 37.3], [37.7, "ループ", "W"]] },
  { who: "rei", t0: 38.4, t1: 41.65, lines: [[38.9, "虚空に響く合図", "c"], [40.8, "あてもない", "W"]] },
  { who: "cc", t0: 41.7, t1: 44.75, lines: [[42.15, "いつもオ", "c"], [42.6, "フライン", "W"], [43.4, "返信は", "c"], [44.0, "一生来ない", "w"]] },
  { who: "rei", t0: 44.8, t1: 46.7, special: true, lines: [[45.0, "こだまのない", "c"], [46.0, "叫び", "W"], [46.4, "FOR YOU", "L"]] },
  { who: "cc", t0: 48.15, t1: 51.2, lines: [[48.25, "平行線か", "c"], [48.9, "独りか", "W"], [50.5, "終わりない待機", "s"]] },
  { who: "rei", t0: 51.2, t1: 54.45, lines: [[52.0, "おい,", "c"], [53.0, "今どこだ?", "W"], [53.7, "手を振ってみてよ", "sc"]] },
  { who: "cc", t0: 54.5, t1: 57.2, special: true, lines: [[54.95, "あの,", "c"], [55.2, "生きてるよね?", "w"], [56.2, "もう一度だけ", "s"]] },
];

function shift(card, dt, patch = {}) {
  return { // patch times are in chorus-1 time, like the card's
    ...card, ...patch, t0: (patch.t0 ?? card.t0) + dt, t1: (patch.t1 ?? card.t1) + dt,
    lines: (patch.lines || card.lines).map(([t, s, k, t2]) => [t + dt, s, k, t2 !== undefined ? t2 + dt : undefined]),
  };
}
const L = (t, s, k, t2) => [t, s, k, t2];

// chorus 2: the loop line runs away ("無限の" x 9), she says "死んでるなら答えて"
const CH2 = [
  shift(CH1[1], 51.2, { lines: [L(35.45, "返事をくれるまで", "c"), L(36.9, "絶えぬ 無限の", "w", 37.3), ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => L(37.55 + i * 0.09, "無限の", "x"))] }),
  shift(CH1[2], 51.2),
  shift(CH1[3], 51.2, { t1: 43.9, heartAt: 43.9 }),
  shift(CH1[4], 51.2),
  shift(CH1[5], 51.2),
  shift(CH1[6], 51.2),
  shift(CH1[7], 51.2, { t1: 56.8, lines: [L(54.95, "あの,", "c"), L(55.2, "生きてるよね?", "w"), L(56.2, "死んでるなら答えて", "s")] }),
].map((c) => ({ ...c, ch: 2 }));

// chorus 3: Corrupt-Chan's lines arrive faded, as if from far away
const CH3 = [
  shift(CH1[1], 107.2, { t0: 142.6 - 107.2, dim: true }),
  shift(CH1[2], 107.2, { t0: 145.95 - 107.2 }),
  shift(CH1[3], 107.2, { dim: true, t1: 43.9, heartAt: 43.9, lines: CH1[3].lines.slice(0, 3) }),
  shift(CH1[4], 107.2),
  shift(CH1[5], 107.2, { dim: true, t1: 51.2 }),
  shift(CH1[6], 107.2),
  shift(CH1[7], 107.2, { dim: true, lines: [L(54.95, "あの,", "c"), L(55.2, "生きてるよね?", "w"), L(56.2, "死んでるなら答えて", "s")] }),
].map((c) => ({ ...c, ch: 3 }));

const card = (c) => ({ type: "card", t0: c.t0, t1: c.t1, card: { ch: 1, ...c } });

// ---------- the shots ----------
export const SHOTS = [
  { type: "black", t0: 0, t1: 1.6 },
  { type: "glow", t0: 1.6, t1: 3.2, intro: true, lines: [[1.75, "視覚信号", "c"]] },
  { type: "title", t0: 3.2, t1: 5.7, ruby: [3.45, "また"], text: [4.0, "会う日まで"] },
  { type: "verse", t0: 5.7, t1: 12.85, who: "cc", bubbles: [[6.5, "目"], [7.1, "時間盲"], [7.7, "不安感"], [8.45, "飽き飽きする"], [9.6, "戸"], [10.3, "テレビ"], [11.1, "ループする時間"]] },
  { type: "verse", t0: 12.85, t1: 17.9, who: "rei", bubbles: [[12.95, "日"], [13.5, "月も"], [14.3, "空も"], [15.15, "誰もいない"], [15.95, "あ"], [16.6, "時空の"], [17.05, "隙間にハマった"]] },
  { type: "faceFlash", t0: 17.9, t1: 18.9 },
  { type: "prop", t0: 18.9, t1: 22.3, prop: "tv" },
  { type: "prop", t0: 22.3, t1: 25.6, prop: "duo" },
  { type: "prop", t0: 25.6, t1: 28.8, prop: "sticks" },
  { type: "prop", t0: 28.8, t1: 31.2, prop: "dots" },
  { type: "ready", t0: 31.2, t1: 32.0 },
  card(CH1[0]),
  { type: "link", t0: 33.9, t1: 35.3, to: "cc" },
  card(CH1[1]), card(CH1[2]), card(CH1[3]), card(CH1[4]),
  { type: "link", t0: 46.7, t1: 48.15, to: "cc" },
  card(CH1[5]), card(CH1[6]), card(CH1[7]),
  { type: "link", t0: 57.2, t1: 57.7, to: "rei" },
  { type: "close", t0: 57.7, t1: 63.6, pose: "reach" },
  { type: "close", t0: 63.6, t1: 69.4, pose: "fists" },
  { type: "static", t0: 69.4, t1: 70.9 },
  { type: "prop", t0: 70.9, t1: 73.8, prop: "tvHand" },
  { type: "prop", t0: 73.8, t1: 76.8, prop: "phones" },
  { type: "prop", t0: 76.8, t1: 80.0, prop: "rays" },
  { type: "prop", t0: 80.0, t1: 82.4, prop: "duo", flip: true },
  { type: "ready", t0: 82.4, t1: 83.0 },
  { type: "glow", t0: 83.0, t1: 85.1, lines: [[83.5, "視覚信号", "c"], [84.55, "発射!", "W"]] },
  { type: "link", t0: 85.1, t1: 86.5, to: "cc" },
  card(CH2[0]), card(CH2[1]), card(CH2[2]),
  { type: "heart", t0: 95.1, t1: 96.0, who: "cc" },
  card(CH2[3]),
  { type: "link", t0: 97.9, t1: 99.35, to: "cc" },
  card(CH2[4]), card(CH2[5]), card(CH2[6]),
  { type: "heartGlitch", t0: 108.0, t1: 108.8 },
  { type: "code", t0: 108.8, t1: 112.0 },
  { type: "prop", t0: 112.0, t1: 115.0, prop: "cup", mono: true },
  { type: "prop", t0: 115.0, t1: 118.5, prop: "calendar", mono: true },
  { type: "prop", t0: 118.5, t1: 121.6, prop: "boxbird", mono: true },
  { type: "prop", t0: 121.6, t1: 124.9, prop: "dots", drip: true, mono: true },
  { type: "prop", t0: 124.9, t1: 128.0, prop: "eye" },
  { type: "prop", t0: 128.0, t1: 131.25, prop: "tvRed", mono: true },
  { type: "prop", t0: 131.25, t1: 134.4, prop: "window" },
  { type: "prop", t0: 134.4, t1: 137.6, prop: "stars" },
  { type: "black", t0: 137.6, t1: 139.2 },
  { type: "glow", t0: 139.2, t1: 141.1, lines: [[139.7, "視覚信号", "c"], [140.75, "発射!", "W"]] },
  { type: "link", t0: 141.1, t1: 142.6, to: "cc" },
  card(CH3[0]), card(CH3[1]), card(CH3[2]),
  { type: "heart", t0: 151.1, t1: 152.0, who: "rei" },
  card(CH3[3]),
  { type: "link", t0: 153.9, t1: 155.35, to: "cc" },
  card(CH3[4]),
  { type: "hello", t0: 158.4, t1: 159.2 },
  { ...card(CH3[5]), t0: 159.2 },
  card(CH3[6]),
  { type: "link", t0: 164.4, t1: 164.8, to: "rei" },
  { type: "credit", t0: 164.8, t1: 168.0, who: "rei", pose: "danceB", roles: ["Producer", "Composition", "Lyrics", "Arrangement", "by"], name: "AnythingBecomeMoe" },
  { type: "credit", t0: 168.0, t1: 171.2, who: "cc", pose: "danceA", roles: ["Original storyboard", "Character design", "Animation", "by"], name: "AnythingBecomeMoe", extra: ["3D reanimation", "bryanbr0", "Props: 3moji by jeremytoys", "(CC BY-SA 4.0)"] },
  { type: "credit", t0: 171.2, t1: 174.4, who: "rei", pose: "danceC", roles: ["VOCAL by"], name: "Adachi Rei", sub: "in UTAU", extra: ["3D model", "みさいる (Mechanical Girl)"] },
  { type: "credit", t0: 174.4, t1: 176.8, who: "cc", pose: "danceD", roles: ["VOCAL by"], name: "Corrupt-Chan", sub: "in UTAU", extra: ["Character: mono23", "Tuning & 3D model: bryanbr0"] },
  { type: "end", t0: 176.8, t1: 180.2 },
];
// in time order; a shot never runs into the next one, and tEnd is where the next one starts
// (between t1 and tEnd a card's panels slide away)
SHOTS.sort((a, b) => a.t0 - b.t0);
for (let i = 0; i < SHOTS.length; i++) {
  const next = SHOTS[i + 1];
  if (next && SHOTS[i].t1 > next.t0) SHOTS[i].t1 = next.t0;
  SHOTS[i].tEnd = next ? next.t0 : SHOTS[i].t1;
  SHOTS[i].index = i;
}

// subtitles under the prop shots (and one in the second verse)
export const SUBS = [
  [19.3, 22.75, "バリバリ 過去が"], [22.75, 25.6, "壊れた"], [25.8, 28.8, "想いだけを"], [28.95, 31.2, "信号に込めて"],
  [68.6, 70.0, "会えたのかな?"],
  [71.3, 73.8, "バリバリ 過去が"], [73.9, 76.8, "壊れた"], [76.95, 80.0, "想いだけを"], [80.05, 82.4, "信号に込めて"],
  [112.2, 113.9, "孤独に潰され"], [113.9, 115.0, "脳が溶け出す"],
  [115.35, 117.05, "目玉がズキズキ"], [117.05, 118.5, "閃光が目を打つ"],
  [118.6, 120.45, "無意味な発声器官"], [120.45, 121.6, "聞き手がいない"],
  [121.75, 123.5, "朽ちも老いもせず"], [123.5, 124.9, "逃亡も不可"],
  [125.0, 126.75, "涙に散った慕情"], [126.75, 128.0, "遠のく精神"],
  [128.15, 129.9, "君を喰らったTV"], [129.9, 131.25, "恨みと希望"],
  [131.55, 133.2, "睡眠致死量超過"], [133.2, 134.4, "どうして見えない"],
  [134.6, 136.4, "戻れないなら"], [136.4, 137.6, "一度だけでも"],
];

// the list Rei types in the second verse: [start, end of typing, text, colour line?]
export const LIST = [
  [57.85, 59.0, "あっ, 耳で拾った", true], [59.15, 60.3, "電波の響き", false],
  [61.6, 62.3, "えっ, まさか,", true], [62.45, 63.4, "返信の音か?", false],
  [64.1, 65.2, "さあ, 強く, 派手に,", true], [65.4, 66.6, "視認性最大化", false],
  [67.0, 67.9, "あ, ほんとうに,", true], [null, null, "", false], [68.8, 69.35, "会えたのかな?", false],
];

export function shotAt(t) {
  for (let i = SHOTS.length - 1; i >= 0; i--) if (t >= SHOTS[i].t0) return i;
  return 0;
}
export const ALL_TEXT = () => {
  const s = [];
  for (const sh of SHOTS) {
    if (sh.card) for (const l of sh.card.lines) s.push(l[1]);
    if (sh.lines) for (const l of sh.lines) s.push(l[1]);
    if (sh.bubbles) for (const b of sh.bubbles) s.push(b[1]);
    if (sh.ruby) s.push(sh.ruby[1], sh.text[1]);
    for (const k of ["roles", "extra"]) if (sh[k]) s.push(...sh[k]);
    if (sh.name) s.push(sh.name, sh.sub || "");
  }
  for (const x of SUBS) s.push(x[2]);
  for (const x of LIST) s.push(x[2]);
  s.push("次元通信", "Ready!", "-PERFECT-", "< Hello?", "0123456789");
  return s.join("");
};
