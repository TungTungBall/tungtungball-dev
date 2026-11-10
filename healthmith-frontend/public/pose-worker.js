/* global Vision, importScripts */
// Classic worker: MediaPipe's WASM loader uses importScripts. All assets are same-origin.
let detector;
self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      importScripts("/mediapipe/vision_bundle.js");
      const files = await Vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
      detector = await Vision.PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_lite.task", delegate: "CPU" },
        runningMode: "VIDEO", numPoses: 1,
      });
      self.postMessage({ type: "ready" });
    } catch { self.postMessage({ type: "error" }); }
  } else if (data.type === "frame") {
    try {
      const result = detector.detectForVideo(data.frame, data.time);
      const normalized = result.landmarks[0] ?? [];
      // Landmarks remain inside this browser; only the repetition event reaches the API.
      const points = (result.worldLandmarks[0] ?? []).map((p, i) => ({
        x: p.x, y: p.y, z: p.z, visibility: normalized[i]?.visibility ?? 0,
        in_frame: normalized[i]?.x >= 0 && normalized[i]?.x <= 1 && normalized[i]?.y >= 0 && normalized[i]?.y <= 1,
      }));
      self.postMessage({ type: "pose", points, time: data.time });
    } catch { self.postMessage({ type: "error" }); }
    finally { data.frame.close(); }
  }
};
