import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3000";
const rule = { joints: [0, 1, 2], contracted_angle: 90, extended_angle: 150, min_visibility: .8, stable_frames: 2, min_cycle_ms: 200, max_gap_ms: 500, movement_degrees: 3 };
export default defineConfig({
  testDir: "./tests/workout-e2e", workers: 1, fullyParallel: false,
  forbidOnly: !!process.env.CI, timeout: 60_000,
  reporter: [["list"], ["html", { outputFolder: "playwright-report/workout", open: "never" }]],
  use: { baseURL, permissions: ["camera"], launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] }, screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    { command: "node tests/fixtures/workout-stack.mjs", url: "http://127.0.0.1:8091/health", reuseExistingServer: false, timeout: 120_000 },
    { command: "pnpm start --hostname 127.0.0.1", url: baseURL, reuseExistingServer: false,
      env: { APP_URL: baseURL, SUPABASE_URL: "http://127.0.0.1:8091", SUPABASE_PUBLISHABLE_KEY: "isolated-test-key", BACKEND_API_URL: "http://127.0.0.1:8081", POSE_REPETITION_RULES: JSON.stringify({ TEST_EX: rule }) } },
  ],
});
