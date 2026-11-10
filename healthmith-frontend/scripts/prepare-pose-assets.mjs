import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// SDK와 WASM은 lockfile 버전, 모델은 버전 경로와 SHA-256으로 고정한다.
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const sdk = dirname(require.resolve("@mediapipe/tasks-vision"));
const target = join(root, "public/mediapipe");
const model = join(target, "pose_landmarker_lite.task");
const digest = "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a";
const hash = (b) => createHash("sha256").update(b).digest("hex");
await mkdir(target, { recursive: true });
await cp(join(sdk, "vision_bundle.js"), join(target, "vision_bundle.js"));
await cp(join(sdk, "wasm"), join(target, "wasm"), { recursive: true });
let valid = false;
try { valid = hash(await readFile(model)) === digest; } catch { /* 최초 준비 */ }
if (!valid) {
  const response = await fetch("https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error("MediaPipe 모델을 내려받지 못했습니다.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== digest) throw new Error("MediaPipe 모델 체크섬이 다릅니다.");
  const temp = `${model}.tmp`;
  try { await writeFile(temp, bytes); await rename(temp, model); }
  finally { await rm(temp, { force: true }); }
}
console.log("MediaPipe SDK·WASM·모델 준비 완료 (모델 SHA-256 확인)");
