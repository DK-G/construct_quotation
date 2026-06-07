/**
 * 建築積算・見積用の表記正規化と同義語マッピングユーティリティ
 */

// 同義語マッピング定義
const SYNONYM_MAP: { [key: string]: string } = {
  // クロス関連
  "ビニールクロス": "ビニルクロス",
  "ビニールクロス貼": "ビニルクロス貼",
  "ビニルクロス": "ビニルクロス",
  "ビニルクロス貼": "ビニルクロス貼",
  "クロス": "ビニルクロス",
  "クロス貼": "ビニルクロス貼",
  "クロス貼り": "ビニルクロス貼",
  
  // フローリング関連
  "フローリング": "木製フローリング",
  "フローリング貼": "木製フローリング貼",
  "フローリング貼り": "木製フローリング貼",
  "木製フローリング": "木製フローリング",
  "木製フローリング貼": "木製フローリング貼",
  "合板フローリング": "木製フローリング",
  "複合フローリング": "木製フローリング",
  
  // 塗装関連
  "ep": "EP",
  "EP塗装": "EP",
  "エマルションペイント": "EP",
  "エマルジョンペイント": "EP",
  "合成樹脂エマルションペイント": "EP",
  "sop": "SOP",
  "SOP塗装": "SOP",
  "合成樹脂調合ペイント": "SOP",
  "ウレタン塗装": "UC", // Urethane Coat
  
  // 下地・清掃関連
  "パテ": "パテ処理",
  "パテ処理": "パテ処理",
  "下地調整": "下地調整",
  "ケレン": "ケレンがけ",
  "ケレンがけ": "ケレンがけ",
};

/**
 * 全角英数字を半角にし、全角スペースを半角スペースにし、半角カタカナを全角カタカナにする
 */
export function normalizeCharacters(str: string): string {
  if (!str) return "";
  
  // 全角英数字 -> 半角英数字
  let val = str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => {
    return String.fromCharCode(s.charCodeAt(0) - 0xfee0);
  });

  // 全角スペース -> 半角スペース
  val = val.replace(/　/g, " ");

  // 半角カタカナ -> 全角カタカナの変換テーブル（簡易）
  const kanaMap: { [key: string]: string } = {
    "ｱ": "ア", "ｲ": "イ", "ｳ": "ウ", "ｴ": "エ", "ｵ": "オ",
    "ｶ": "カ", "ｷ": "キ", "ｸ": "ク", "ｹ": "ケ", "ｺ": "コ",
    "ｻ": "サ", "ｼ": "シ", "ｽ": "ス", "ｾ": "セ", "ｿ": "ソ",
    "ﾀ": "タ", "ﾁ": "チ", "ﾂ": "ツ", "ﾃ": "テ", "ﾄ": "ト",
    "ﾅ": "ナ", "ﾆ": "ニ", "ﾇ": "ヌ", "ﾈ": "ネ", "ﾉ": "ノ",
    "ﾊ": "ハ", "ﾋ": "ヒ", "ﾌ": "フ", "ﾍ": "ヘ", "ﾎ": "ホ",
    "ﾏ": "マ", "ﾐ": "ミ", "ﾑ": "ム", "ﾒ": "メ", "ﾓ": "モ",
    "ﾔ": "ヤ", "ﾕ": "ユ", "ﾖ": "ヨ",
    "ﾗ": "ラ", "ﾘ": "リ", "ﾙ": "ル", "ﾚ": "レ", "ﾛ": "ロ",
    "ﾜ": "ワ", "ｦ": "ヲ", "ﾝ": "ン",
    "ｧ": "ァ", "ｨ": "ィ", "ｩ": "ゥ", "ｪ": "ェ", "ｫ": "ォ",
    "ｬ": "ャ", "ｭ": "ュ", "ｮ": "ョ", "ｯ": "ッ",
    "ﾞ": "゛", "ﾟ": "゜", "ｰ": "ー", "｡": "。", "､": "、", "･": "・"
  };

  const reg = new RegExp("[" + Object.keys(kanaMap).join("") + "]", "g");
  val = val.replace(reg, (m) => kanaMap[m] || m);

  // 濁点・半濁点の結合処理（簡易）
  val = val.replace(/カ゛/g, "ガ").replace(/キ゛/g, "ギ").replace(/ク゛/g, "グ").replace(/ケ゛/g, "ゲ").replace(/コ゛/g, "ゴ")
           .replace(/サ゛/g, "ザ").replace(/シ゛/g, "ジ").replace(/ス゛/g, "ズ").replace(/セ゛/g, "ゼ").replace(/ソ゛/g, "ゾ")
           .replace(/タ゛/g, "ダ").replace(/チ゛/g, "ヂ").replace(/ツ゛/g, "ヅ").replace(/テ゛/g, "デ").replace(/ト゛/g, "ド")
           .replace(/ハ゛/g, "バ").replace(/ヒ゛/g, "ビ").replace(/フ゛/g, "ブ").replace(/ヘ゛/g, "ベ").replace(/ホ゛/g, "ボ")
           .replace(/ハ゜/g, "パ").replace(/ヒ゜/g, "ピ").replace(/フ゜/g, "プ").replace(/ヘ゜/g, "ペ").replace(/ホ゜/g, "ポ");

  return val.trim();
}

/**
 * カタカナ語の末尾の長音表記揺れを補正する (例: "コンピュータ" -> "コンピューター")
 */
export function normalizeKatakanaChouon(str: string): string {
  if (!str) return "";

  // 3文字以上のカタカナで、末尾が「ア・イ・ウ・エ・オ」の母音で終わるが長音が付いていない場合や、
  // 一般的な「長音省略」されやすいパターンを置換する。
  // 例: コンピュータ -> コンピューター, エディタ -> エディター, ミキサ -> ミキサー, プリンタ -> プリンター
  const commonSuffixes = [
    { from: /([ァ-ヴ]{2,})タ$/g, to: "$1ター" },
    { from: /([ァ-ヴ]{2,})ラ$/g, to: "$1ラー" },
    { from: /([ァ-ヴ]{2,})サ$/g, to: "$1サー" },
    { from: /([ァ-ヴ]{2,})マ$/g, to: "$1マー" },
    { from: /([ァ-ヴ]{2,})ナ$/g, to: "$1ナー" },
    { from: /([ァ-ヴ]{2,})カ$/g, to: "$1カー" },
    { from: /([ァ-ヴ]{2,})ヤ$/g, to: "$1ヤー" },
  ];

  let val = str;
  for (const suffix of commonSuffixes) {
    val = val.replace(suffix.from, suffix.to);
  }

  return val;
}

/**
 * 面積・体積などの単位表記を統一する
 */
export function normalizeUnit(str: string): string {
  if (!str) return "";
  let val = str;

  // 面積単位の統一
  val = val.replace(/(平米|m2|M2|㎡|へいべい|ヘイベイ)/g, "㎡");

  // 体積単位の統一
  val = val.replace(/(立米|m3|M3|㎥|りゅうべい|リュウベイ)/g, "㎥");

  // その他長さや個数
  val = val.replace(/(メーター|メートル|m|M)/g, "m");
  val = val.replace(/(ヶ所|箇所|ケ所|か所|箇所|箇所|個所)/g, "箇所");

  return val;
}

/**
 * 建築同義語を標準語へマッピングする
 */
export function mapToStandardSynonym(str: string): string {
  if (!str) return "";
  const normalized = normalizeCharacters(str);
  return SYNONYM_MAP[normalized] || SYNONYM_MAP[normalized.toLowerCase()] || normalized;
}

/**
 * 総合的な表記正規化を実行する
 */
export function normalizeAll(str: string): string {
  if (!str) return "";
  let val = normalizeCharacters(str);
  val = normalizeKatakanaChouon(val);
  val = normalizeUnit(val);
  val = mapToStandardSynonym(val);
  return val;
}
