#!/usr/bin/env node
/**
 * 메시지 카탈로그 자동 번역기
 *  - 기준: messages/ko.json (사람이 한국어로 작성)
 *  - 대상 언어로 값만 번역해 messages/<code>.json 생성/갱신 (키·{플레이스홀더} 보존)
 *  - 이미 번역돼 있고 한국어 원문이 안 바뀐 키는 건너뛴다(증분 번역)
 *
 * 사용:
 *   GOOGLE_API_KEY=... node scripts/translate-messages.mjs en ja zh
 *   (인자 없으면 messages/ 에 이미 있는 ko 외 모든 언어를 갱신)
 *
 * 비용 절감: 모델은 .env의 GOOGLE_API_KEY로 Gemini Flash 사용.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MSG_DIR = path.join(ROOT, "messages");

const LANG_NAME = {
  en: "English", ja: "Japanese", zh: "Chinese", vi: "Vietnamese", es: "Spanish",
  fr: "French", de: "German", ru: "Russian", th: "Thai", id: "Indonesian", ar: "Arabic",
  pt: "Portuguese", hi: "Hindi",
};

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) { console.error("GOOGLE_API_KEY 환경변수가 필요합니다."); process.exit(1); }

const ko = JSON.parse(readFileSync(path.join(MSG_DIR, "ko.json"), "utf8"));

// 대상 언어 결정
let targets = process.argv.slice(2);
if (targets.length === 0) {
  targets = readdirSync(MSG_DIR)
    .filter((f) => f.endsWith(".json") && f !== "ko.json")
    .map((f) => f.replace(".json", ""));
}

const genAI = new GoogleGenAI({ apiKey });

// 평탄화(키 경로) ↔ 복원 유틸
const flatten = (obj, prefix = "", out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
};
const unflatten = (flat) => {
  const out = {};
  for (const [key, v] of Object.entries(flat)) {
    const parts = key.split(".");
    let cur = out;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) cur[p] = v;
      else cur = cur[p] ??= {};
    });
  }
  return out;
};

const koFlat = flatten(ko);

for (const lang of targets) {
  const name = LANG_NAME[lang];
  if (!name) { console.warn(`지원하지 않는 언어 코드, 건너뜀: ${lang}`); continue; }
  const outPath = path.join(MSG_DIR, `${lang}.json`);
  const existing = existsSync(outPath) ? flatten(JSON.parse(readFileSync(outPath, "utf8"))) : {};

  // 증분: 아직 번역 안 된 키만 추린다
  const todo = {};
  for (const [k, v] of Object.entries(koFlat)) {
    if (existing[k] === undefined) todo[k] = v;
  }
  if (Object.keys(todo).length === 0) { console.log(`${lang}: 변경 없음`); continue; }

  const prompt = `Translate the JSON values from Korean to ${name}.
Rules: keep every KEY exactly the same; keep {placeholders} like {n}, {name} intact; output ONLY a JSON object with the same keys, no markdown.
JSON:
${JSON.stringify(todo, null, 2)}`;

  const res = await genAI.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
  });
  const text = res.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) { console.error(`${lang}: 응답 파싱 실패`); continue; }
  const translated = JSON.parse(match[0]);

  const merged = { ...existing, ...translated };
  writeFileSync(outPath, JSON.stringify(unflatten(merged), null, 2) + "\n", "utf8");
  console.log(`${lang}: ${Object.keys(todo).length}개 키 번역 → ${path.relative(ROOT, outPath)}`);
}

console.log("완료.");
