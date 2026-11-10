// 브라우저 통합 검사 전용: 격리 PostgreSQL + 실제 Spring + 임시 RSA/JWKS.
// Gemini/실제 Supabase/카메라 정확도 검사를 대신하지 않는다.
import { createServer } from "node:http";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const backend = join(root, "healthmith-backend");
const user = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const jobId = "40000000-0000-4000-8000-000000000001";
const surveyId = "50000000-0000-4000-8000-000000000001";
const workerId = "60000000-0000-4000-8000-000000000001";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "isolated-browser-key", alg: "RS256", use: "sig" };
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
function token(sub) {
  const now = Math.floor(Date.now() / 1000);
  const input = b64({ alg: "RS256", kid: jwk.kid, typ: "JWT" }) + "." + b64({ sub, iss: "http://127.0.0.1:8091/auth/v1", aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600 });
  return input + "." + sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url");
}
let container, java, ready = false, closing = false;
let logs = "";
const docker = (args, input) => execFileSync("docker", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const sql = (input) => docker(["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-A", "-t"], input);
const literal = (v) => "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
const stageNames = ["광석 채굴", "광석 쪼개기", "광석 세척", "광석 가공", "보석 연마"];
function reset(target = 1) {
  const stages = stageNames.map((stage_name, i) => ({ stage_index: i + 1, stage_name, exercise_id: "TEST_EX", exercise_name: "테스트 운동", target_repetitions: target, pace_instruction: "테스트 속도", internal_focus_instruction: "테스트 집중 안내" }));
  sql(readFileSync(join(backend, "src/test/resources/db/workout-fixtures.sql"), "utf8"));
  const answers = { physical_limitations: { present: false, body_parts: [] }, purpose: { type: "체력", custom_text: null }, intensity: 5, priority_body_parts: ["하체"] };
  const candidates = [{ id: "TEST_EX", name: "테스트 운동", body_parts: ["하체"], internal_focus_instruction: "테스트 집중 안내" }];
  sql(`INSERT INTO public.survey_submissions(id,user_id,answers,generation_request_status) VALUES ('${surveyId}','${user}',${literal(answers)},'prepared');
INSERT INTO public.curriculum_generation_requests(id,user_id,survey_submission_id,source_version,kind,status) VALUES ('${jobId}','${user}','${surveyId}',1,'initial','queued');
INSERT INTO private.generation_inputs(request_id,input_snapshot,exercise_candidates) VALUES ('${jobId}',${literal(answers)},${literal(candidates)});
DO $$ DECLARE j jsonb; BEGIN
j:=public.generation_worker('poll','${workerId}',300,'{}');
IF NOT public.generation_worker('publish_curriculum','${workerId}',300,jsonb_build_object('request_id',j->'request_id','lease_token',j->'lease_token','stages',${literal(stages)}))::boolean THEN RAISE EXCEPTION 'fixture publish failed'; END IF;
END $$;`);
}
// 외래키가 있어서 생성된 curriculum ID는 reset 결과에서 읽는다.
function curriculumId() { return sql(`SELECT curriculum_id FROM public.curriculum_generation_requests WHERE id='${jobId}';`); }
const server = createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
  try {
    if (req.url === "/health") return send(ready ? 200 : 503, { ready });
    if (req.url === "/auth/v1/.well-known/jwks.json") return send(200, { keys: [jwk] });
    if (req.url?.startsWith("/test/session")) {
      const sub = req.url.includes("other") ? other : user;
      const session = { access_token: token(sub), refresh_token: "isolated-refresh-token", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: sub, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} } };
      return send(200, { cookie: "base64-" + b64(session), token: session.access_token });
    }
    if (["/test/reset", "/test/reset?repetitions=3"].includes(req.url) && req.method === "POST") { reset(req.url.endsWith("=3") ? 3 : 1); return send(200, { curriculumId: curriculumId(), requestId: jobId }); }
    if (req.url === "/test/allow-reuse" && req.method === "POST") {
      sql(`UPDATE private.runtime_policies SET value='{"allow_reuse":true}'::jsonb WHERE name='workout_start';`);
      return send(200, {});
    }
    return send(404, {});
  } catch { return send(500, { error: "isolated fixture failed" }); }
});
async function cleanup() {
  if (closing) return;
  closing = true;
  java?.kill("SIGTERM");
  server.close();
  if (container) { try { docker(["rm", "-f", container]); } catch { /* 이미 종료 */ } }
}
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { void cleanup().finally(() => process.exit(0)); });
try {
  container = docker(["run", "--rm", "-d", "--name", "healthmith-browser-" + randomUUID(), "--label", "healthmith.test=workout-browser", "-e", "POSTGRES_PASSWORD=isolated-admin", "-p", "127.0.0.1::5432", "postgres:17-alpine"]);
  let postgresReady = false;
  for (let i = 0; i < 60; i++) {
    // initdb의 임시 Unix-socket 서버가 아니라 재기동 후 TCP 서버를 기다린다.
    try { docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]); postgresReady = true; break; }
    catch { await new Promise((r) => setTimeout(r, 300)); }
  }
  if (!postgresReady) throw new Error("격리 PostgreSQL 준비 시간 초과");
  sql(readFileSync(join(backend, "src/test/resources/db/bootstrap.sql"), "utf8"));
  const migrations = join(root, "supabase/migrations");
  for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) sql(readFileSync(join(migrations, file), "utf8"));
  sql(readFileSync(join(root, "supabase/roles/r2dbc.sql"), "utf8"));
  const port = JSON.parse(docker(["inspect", container]))[0].NetworkSettings.Ports["5432/tcp"][0].HostPort;
  await new Promise((resolve) => server.listen(8091, "127.0.0.1", resolve));
  const jar = readdirSync(join(backend, "build/libs")).find((f) => f.endsWith(".jar") && !f.endsWith("-plain.jar"));
  if (!jar) throw new Error("먼저 백엔드 bootJar를 빌드하세요.");
  java = spawn(process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin/java") : "java", ["-jar", join(backend, "build/libs", jar)], {
    cwd: backend, env: { ...process.env, SPRING_CONFIG_IMPORT: "", SERVER_PORT: "8081", SUPABASE_URL: "http://127.0.0.1:8091", SUPABASE_PUBLISHABLE_KEY: "isolated-test-key", PERSISTENCE_MODE: "r2dbc", R2DBC_URL: `r2dbc:postgresql://127.0.0.1:${port}/postgres`, R2DBC_USERNAME: "healthmith_app", R2DBC_PASSWORD: "isolated-test-password", GENERATION_WORKER_ENABLED: "false", COMBAT_WORKER_ENABLED: "false" }, stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [java.stdout, java.stderr]) stream.on("data", (b) => { logs = (logs + b.toString()).slice(-8000); });
  for (let i = 0; i < 120; i++) {
    if (java.exitCode !== null) throw new Error("Spring 종료: " + logs);
    try { if ((await fetch("http://127.0.0.1:8081/health")).ok) { ready = true; break; } } catch { /* 기동 대기 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw new Error("Spring 준비 시간 초과: " + logs);
  console.log("격리 PostgreSQL·Spring·RSA/JWKS 준비 완료");
} catch (error) { console.error(error.message); await cleanup(); process.exit(1); }
