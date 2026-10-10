import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import SettingsIcon from "@mui/icons-material/Settings";
import TranslateIcon from "@mui/icons-material/Translate";
import {
  Checkbox,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  SelectChangeEvent,
} from "@mui/material";
import React from "react";
import { useTranslation } from "react-i18next";
import { useMenu } from "../../../hooks/useMenu";
import { LOG } from "../../../lib/Logging";
import { convertHanziNotes } from "../../../lib/Chinese/hanziToPinyin";
import { speedUpShortNotes } from "../../../lib/English/fastNoteVelocity";
import { convertVccvNotes } from "../../../lib/English/vccvToArpa";
import { normalizeJapaneseNotes } from "../../../lib/Japanese/normalizeKana";
import { applyGlide } from "../../../lib/BatchProcess/NaturalPitchBatchProcess";
import { dumpNotes } from "../../../lib/Note";
import { EnglishARPAbetPhonemizer } from "../../../lib/Phonemizer/EnglishARPAbetPhonemizer";
import { undoManager } from "../../../lib/UndoManager";
import { Ust } from "../../../lib/Ust";
import { dumpUstx } from "../../../lib/Ustx";
import { useMusicProjectStore } from "../../../store/musicProjectStore";
import { useSnackBarStore } from "../../../store/snackBarStore";
import { ProjectSettingDialog } from "../ProjectSettingDialog";
import { FooterPhonemizerMenu } from "./FooterPhonemizerMenu";

export const FooterProjectMenu: React.FC<FooterProjectMenuProps> = ({
  anchor,
  handleClose,
  setUstLoadProgress,
}) => {
  const { t } = useTranslation();
  /** 隠し表示する<input>へのref */
  const inputRef = React.useRef<HTMLInputElement>(null);
  const {
    ust,
    setUst,
    setUstTempo,
    setUstFlags,
    tone,
    isMinor,
    isShowPortrait,
    setIsShowPortrait,
    vb,
    notes,
    setNotes,
    setTone,
    setIsMinor,
    ustFlags,
    ustTempo,
    clearUst,
  } = useMusicProjectStore();
  const snackBarStore = useSnackBarStore();
  const [dialogOpen, setDialogOpen] = React.useState<boolean>(false);
  const [
    phonemizerMenuAnchor,
    handlePhonemizerMenuOpen,
    handlePhonemizerMenuClose,
  ] = useMenu("FooterMenu.PhonemizerMenu");

  /**
   * inputのファイルを変更した際の動作
   * nullやファイル数が0の場合何もせず終了する。
   * ファイルが含まれている場合、1つ目のファイルをreadFileにセットする。
   * 実際のファイルの読込はloadVBDialogで行う。
   * @param e
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      LOG.warn("ustの読込がキャンセルされたか失敗しました", "FooterMenu");
      return;
    }
    setUstLoadProgress(true);
    LOG.info(`ustの選択:${e.target.files[0].name}`, "FooterMenu");
    LoadUst(e.target.files[0]);
  };

  /**
   * ustファイルを非同期で読み込み、グローバルな状態ust,notes,ustTempo,ustFlagsを更新する
   * @param file 選択されたustファイル
   */
  const LoadUst = async (file: File): Promise<void> => {
    try {
      LOG.info(`ustの読込開始`, "FooterMenu");
      const ust = new Ust();
      const buf = await file.arrayBuffer();
      const isUstx = file.name.toLowerCase().endsWith(".ustx");
      if (isUstx) {
        await ust.loadUstx(buf);
      } else {
        await ust.load(buf);
      }
      LOG.info(
        `ustの読込完了。ノート数:${ust.notes.length},bpm=:${ust.tempo},flags:${ust.flags}`,
        "FooterProjectMenu"
      );
      setUst(ust);
      setUstTempo(ust.tempo);
      setUstFlags(ust.flags);
      if (vb !== null) {
        notes.forEach((n) => n.applyOto(vb));
      } else {
        LOG.warn(
          `vbがロードされていません。テスト以外では必ず事前にロードされるはずなので何かがおかしい`,
          "FooterProjectMenu"
        );
      }
      const has = (a: string) => vb !== null && !!vb.getOtoRecord(a, 60, "");
      /** 読込時に歌詞を整えた内容のお知らせ。まとめて1つ表示する */
      const notices: string[] = [];
      // 漢字(中国語)の歌詞は、音源のピンイン表記に変換する
      const hanzi = vb !== null ? await convertHanziNotes(ust.notes, has) : null;
      if (hanzi !== null) {
        LOG.info(
          `漢字をピンインに変換。${JSON.stringify({
            converted: hanzi.converted,
            missing: hanzi.missing,
          })}`,
          "FooterProjectMenu"
        );
        notices.push(
          t("editor.footer.ustHanziConverted", {
            converted: hanzi.converted,
            missing: hanzi.missing,
          })
        );
      }
      // VCCV音源向けのustをARPAbetのCVVC音源で歌わせる場合は、歌詞を音源のエイリアスに変換する
      const converted =
        vb !== null &&
        useMusicProjectStore.getState().phonemizer instanceof
          EnglishARPAbetPhonemizer
          ? convertVccvNotes(ust.notes, has)
          : null;
      if (converted !== null) {
        ust.notes = converted.notes;
        LOG.info(
          `VCCVのustをARPAbetの音源向けに変換。${JSON.stringify({
            converted: converted.converted,
            merged: converted.merged,
            rests: converted.rests,
            approximated: converted.approximated,
          })}`,
          "FooterProjectMenu"
        );
        notices.push(
          t("editor.footer.ustVccvConverted", {
            converted: converted.converted,
            merged: converted.merged,
            rests: converted.rests,
            approximated: converted.approximated,
          })
        );
      }
      // かなの歌詞のustは、`+`の伸ばしや音源に無い外来音のかなを整える
      const japanese =
        converted === null && vb !== null
          ? normalizeJapaneseNotes(ust.notes, has)
          : null;
      if (japanese !== null) {
        ust.notes = japanese.notes;
        LOG.info(
          `かなの歌詞を整えた。${JSON.stringify({
            merged: japanese.merged,
            remapped: japanese.remapped,
            rests: japanese.rests,
          })}`,
          "FooterProjectMenu"
        );
        notices.push(
          t("editor.footer.ustJapaneseNormalized", {
            merged: japanese.merged,
            remapped: japanese.remapped,
            rests: japanese.rests,
          })
        );
      }
      // ustxのピッチは階段状でロボットのように聞こえるので、音が変わるところをなめらかにつなぐ
      if (isUstx) applyGlide(ust.notes);
      // ARPAbet音源で英語を歌わせるときは、短いノートの子音速度を上げて聞き取りやすくする
      if (
        vb !== null &&
        useMusicProjectStore.getState().phonemizer instanceof
          EnglishARPAbetPhonemizer &&
        speedUpShortNotes(ust.notes) > 0
      ) {
        ust.notes.forEach((n) => n.applyOto(vb));
      }
      if (notices.length > 0) {
        snackBarStore.setSeverity("info");
        snackBarStore.setValue(notices.join(" "));
        snackBarStore.setOpen(true);
      }
      setNotes(ust.notes);
      setUstLoadProgress(false);
      undoManager.clear();
    } catch (e) {
      LOG.warn(`ustの読込失敗。${e}`, "FooterProjectMenu");
      snackBarStore.setSeverity("error");
      snackBarStore.setValue(t("editor.footer.ustLoadError"));
      snackBarStore.setOpen(true);
      setUstLoadProgress(false);
    }
  };

  /**
   * ust読込をクリックした際の動作。
   * 不可視のinputのクリックイベントを発火する
   */
  const handleLoadUstClick = () => {
    LOG.debug("click LoadUst", "FooterProjectMenu");
    /** ファイル読み込みの発火 */
    LOG.info("ustファイルの選択", "FooterProjectMenu");
    inputRef.current.click();
    handleClose();
  };

  /**
   * ust保存をクリックした際の動作。
   */
  const handleSaveUstClick = () => {
    LOG.debug("click Save Ust", "FooterProjectMenu");
    if (vb) {
      LOG.gtag("SaveUst", { ustName: vb.name });
    }
    const outputUst = dumpNotes(notes, ustTempo, ustFlags);
    const ustFile = new File([outputUst], `output_${new Date().toJSON()}.ust`, {
      type: "text/plane;charset=utf-8",
    });
    const url = URL.createObjectURL(ustFile);
    const a = document.createElement("a");
    a.href = url;
    a.download = ustFile.name;
    a.click();
    handleClose();
  };

  /** OpenUtau用のustx形式で保存する。 */
  const handleSaveUstxClick = () => {
    LOG.debug("click Save Ustx", "FooterProjectMenu");
    const outputUstx = dumpUstx(notes, ustTempo);
    const file = new File([outputUstx], `output_${new Date().toJSON()}.ustx`, {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    handleClose();
  };

  /**
   * プロジェクト設定をクリックした際の動作
   */
  const handleProjectSettingClick = () => {
    LOG.debug("click Project Setting", "FooterProjectMenu");
    setDialogOpen(true);
    handleClose();
  };

  const handleDialogClose = () => {
    LOG.debug("dialogを閉じる", "FooterProjectMenu");
    setDialogOpen(false);
  };

  /** ustを初期化する処理 */
  const handleClearProjectClick = () => {
    LOG.debug("click Clear Project", "FooterProjectMenu");
    clearUst();
    undoManager.clear();
    handleClose();
  };

  const _handlePhonemizerMenuClose = () => {
    handlePhonemizerMenuClose();
    handleClose();
  };

  /** キー(調)を変更する処理 */
  const handleToneChange = (event: SelectChangeEvent<number>) => {
    const newTone = Number(event.target.value);
    LOG.debug(`調を変更: ${tone} -> ${newTone}`, "FooterProjectMenu");
    setTone(newTone);
  };

  /** 長調/短調を切り替える処理 */
  const handleIsMinorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newIsMinor = event.target.checked;
    LOG.debug(
      `長調/短調を変更: ${isMinor} -> ${newIsMinor}`,
      "FooterProjectMenu"
    );
    setIsMinor(newIsMinor);
  };

  /** 立ち絵表示の切り替え処理 */
  const handleIsShowPortraitChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newIsShowPortrait = event.target.checked;
    LOG.debug(
      `立ち絵表示の切り替え: ${isShowPortrait} -> ${newIsShowPortrait}`,
      "FooterProjectMenu"
    );
    setIsShowPortrait(newIsShowPortrait);
  };

  const toneOptions = [
    { value: 11, label: "B" },
    { value: 10, label: "A#/Bb" },
    { value: 9, label: "A" },
    { value: 8, label: "G#/Ab" },
    { value: 7, label: "G" },
    { value: 6, label: "F#/Gb" },
    { value: 5, label: "F" },
    { value: 4, label: "E" },
    { value: 3, label: "D#/Eb" },
    { value: 2, label: "D" },
    { value: 1, label: "C#/Db" },
    { value: 0, label: "C" },
  ];

  return (
    <>
      <input
        type="file"
        onChange={handleFileChange}
        hidden
        ref={inputRef}
        accept=".ust,.ustx"
        data-testid="ust-file-input"
      ></input>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={handleClose}
        anchorOrigin={{ horizontal: "center", vertical: "bottom" }}
      >
        <MenuItem onClick={handleLoadUstClick}>
          <ListItemIcon>
            <LibraryMusicIcon />
          </ListItemIcon>
          <ListItemText>{t("editor.footer.loadUst")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleSaveUstClick} disabled={ust === null}>
          <ListItemIcon>
            <SaveAltIcon />
          </ListItemIcon>
          <ListItemText>{t("editor.footer.saveUst")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleSaveUstxClick} disabled={ust === null}>
          <ListItemIcon>
            <SaveAltIcon />
          </ListItemIcon>
          <ListItemText>{t("editor.footer.saveUstx")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleProjectSettingClick} disabled={ust === null}>
          <ListItemIcon>
            <SettingsIcon />
          </ListItemIcon>
          <ListItemText>{t("editor.footer.prjectSetting")}</ListItemText>
        </MenuItem>
        <MenuItem>
          <ListItemIcon>
            <MusicNoteIcon />
          </ListItemIcon>
          <Select
            value={tone}
            onChange={handleToneChange}
            size="small"
            sx={{ minWidth: 120 }}
            onClick={(e) => e.stopPropagation()}
          >
            {toneOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </MenuItem>
        <MenuItem>
          <Checkbox
            checked={isMinor}
            onChange={handleIsMinorChange}
            onClick={(e) => e.stopPropagation()}
          />
          <ListItemText>{t("editor.footer.isMinor")}</ListItemText>
        </MenuItem>
        <MenuItem disabled={vb === null || vb.portrait === undefined}>
          <Checkbox
            checked={isShowPortrait && vb !== null && vb.portrait !== undefined}
            onChange={handleIsShowPortraitChange}
            onClick={(e) => e.stopPropagation()}
          />
          <ListItemText>{t("editor.footer.isShowPortrait")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={handlePhonemizerMenuOpen} disabled={ust === null}>
          <ListItemIcon>
            <TranslateIcon />
          </ListItemIcon>
          <ListItemText>{t("editor.footer.phonemizer")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleClearProjectClick} disabled={ust === null}>
          <ListItemIcon>
            <DeleteForeverIcon />
          </ListItemIcon>
          <ListItemText>{t("editor.footer.clearProject")}</ListItemText>
        </MenuItem>
      </Menu>
      <ProjectSettingDialog open={dialogOpen} handleClose={handleDialogClose} />
      <FooterPhonemizerMenu
        anchor={phonemizerMenuAnchor}
        handleClose={_handlePhonemizerMenuClose}
      />
    </>
  );
};

export interface FooterProjectMenuProps {
  /** メニューの表示位置 */
  anchor: HTMLElement | null;
  /** メニューを閉じるためのコールバック */
  handleClose: () => void;
  /** 読込中の状態を伝えるためのコールバック */
  setUstLoadProgress: (progress: boolean) => void;
}
