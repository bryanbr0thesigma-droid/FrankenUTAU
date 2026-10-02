/**
 * OpenUtauのプロジェクトファイル(ustx)とustの相互変換。
 * ustxはYAML形式で、1拍=480tick(ustと同じ)。
 * ノート・歌詞・音高・テンポ・ビブラートのみを扱い、
 * OpenUtau固有のエクスプレッションやフレーズ設定は無視する。
 */

import yaml from "js-yaml";
import type { Note } from "./Note";

type UstxVibrato = {
  length?: number;
  period?: number;
  depth?: number;
  in?: number;
  out?: number;
  shift?: number;
  drift?: number;
};
type UstxNote = {
  position: number;
  duration: number;
  tone: number;
  lyric?: string;
  vibrato?: UstxVibrato;
};
type UstxPart = { position?: number; track_no?: number; notes?: UstxNote[] };
type UstxProject = {
  tempos?: Array<{ position: number; bpm: number }>;
  bpm?: number;
  voice_parts?: UstxPart[];
};

/** ustxの歌詞をustの歌詞に変換する。休符や空歌詞は`R`にする。 */
const toUstLyric = (lyric: string | undefined): string => {
  const l = (lyric ?? "").trim();
  return l === "" || l === "R" || l === "r" ? "R" : l;
};

/** ustxのビブラートをustのVBR文字列に変換する。 */
const toUstVbr = (v: UstxVibrato): string | undefined => {
  if (!v || !v.length) return undefined;
  const clamp = (x: number, lo: number, hi: number) =>
    Math.min(Math.max(x, lo), hi);
  return [
    clamp(v.length, 0, 100),
    clamp(v.period ?? 175, 64, 512),
    clamp(v.depth ?? 25, 5, 200),
    clamp(v.in ?? 10, 0, 100),
    clamp(v.out ?? 10, 0, 100),
    clamp(v.shift ?? 0, -100, 100),
    clamp(v.drift ?? 0, -100, 100),
  ].join(",");
};

/**
 * ustxのテキストをustの行配列に変換する。`Ust.loadText`にそのまま渡せる。
 * 最も若いトラックのボイスパートを時間順に結合し、ノート間の隙間は休符で埋める。
 * @param text ustxファイルの内容
 */
export const ustxToUstLines = (text: string): string[] => {
  const project = yaml.load(text) as UstxProject;
  if (!project || typeof project !== "object") {
    throw new Error("invalid ustx");
  }
  const parts = (project.voice_parts ?? []).filter(
    (p) => Array.isArray(p.notes) && p.notes.length > 0
  );
  const firstTrack = Math.min(...parts.map((p) => p.track_no ?? 0));
  const notes = parts
    .filter((p) => (p.track_no ?? 0) === firstTrack)
    .flatMap((p) =>
      p.notes.map((n) => ({ ...n, position: n.position + (p.position ?? 0) }))
    )
    .sort((a, b) => a.position - b.position);
  const tempos = [...(project.tempos ?? [])].sort(
    (a, b) => a.position - b.position
  );
  const baseBpm = tempos[0]?.bpm ?? project.bpm ?? 120;

  const lines = [
    "[#VERSION]",
    "UST Version1.2",
    "Charset=UTF-8",
    "[#SETTING]",
    `Tempo=${baseBpm}`,
    "Tracks=1",
    "Project=",
    "Mode2=True",
  ];
  let index = 0;
  let cursor = 0;
  let tempoIdx = 1;
  const pushNote = (
    length: number,
    lyric: string,
    notenum: number,
    vbr?: string
  ) => {
    lines.push(`[#${String(index++).padStart(4, "0")}]`);
    lines.push(`Length=${length}`, `Lyric=${lyric}`, `NoteNum=${notenum}`);
    // 次のノートの開始位置までに到達したテンポ変更をこのノートに付与する
    while (tempoIdx < tempos.length && tempos[tempoIdx].position <= cursor) {
      lines.push(`Tempo=${tempos[tempoIdx].bpm}`);
      tempoIdx++;
    }
    lines.push("PreUtterance=", "Intensity=100", "Modulation=0");
    if (vbr) lines.push(`VBR=${vbr}`);
  };
  for (const n of notes) {
    if (n.duration <= 0) continue;
    if (n.position > cursor) {
      pushNote(n.position - cursor, "R", 60);
      cursor = n.position;
    } else if (n.position < cursor) {
      // 重複したノートはustで表現できないため読み飛ばす
      continue;
    }
    pushNote(n.duration, toUstLyric(n.lyric), n.tone, toUstVbr(n.vibrato));
    cursor += n.duration;
  }
  lines.push("[#TRACKEND]");
  return lines;
};

/**
 * ノート列をustxに変換する。
 * @param notes ノート列
 * @param tempo プロジェクトのbpm
 * @param name プロジェクト名
 */
export const dumpUstx = (
  notes: Array<Note>,
  tempo: number,
  name = "FrankenUTAU"
): string => {
  const tempos = [{ position: 0, bpm: tempo }];
  const ustxNotes: UstxNote[] = [];
  let pos = 0;
  notes.forEach((n) => {
    if (n.hasTempo && pos > 0) tempos.push({ position: pos, bpm: n.tempo });
    if (n.lyric !== "R") {
      const note: UstxNote = {
        position: pos,
        duration: n.length,
        tone: n.notenum,
        lyric: n.lyric,
      };
      const v = n.vibrato;
      if (v && v.length > 0) {
        note.vibrato = {
          length: v.length,
          period: v.cycle,
          depth: v.depth,
          in: v.fadeInTime,
          out: v.fadeOutTime,
          shift: v.phase,
          drift: v.height,
        };
      }
      ustxNotes.push(note);
    }
    pos += n.length;
  });
  const project = {
    name,
    comment: "",
    output_dir: "Vocal",
    cache_dir: "UCache",
    ustx_version: "0.6",
    resolution: 480,
    tempos,
    time_signatures: [{ bar_position: 0, beat_per_bar: 4, beat_unit: 4 }],
    key: 0,
    tracks: [{ track_name: "Track1", track_no: 0 }],
    voice_parts: [
      { name, track_no: 0, position: 0, notes: ustxNotes },
    ],
    wave_parts: [],
  };
  return yaml.dump(project, { lineWidth: -1 });
};
