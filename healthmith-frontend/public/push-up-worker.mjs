import { FRAME_HEIGHT, FRAME_WIDTH, PushUpMotionCounter } from "./push-up-motion.mjs";

const counter = new PushUpMotionCounter();
let context;

self.onmessage = ({ data }) => {
  if (data.type === "init") {
    try {
      context = new OffscreenCanvas(FRAME_WIDTH, FRAME_HEIGHT).getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas unavailable");
      self.postMessage({ type: "ready" });
    } catch {
      self.postMessage({ type: "error" });
    }
    return;
  }
  if (data.type !== "frame") return;

  try {
    context.drawImage(data.frame, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    const rgba = context.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT).data;
    const pixels = new Uint8Array(FRAME_WIDTH * FRAME_HEIGHT);
    for (let i = 0; i < pixels.length; i++) {
      const offset = i * 4;
      pixels[i] = (77 * rgba[offset] + 150 * rgba[offset + 1] + 29 * rgba[offset + 2]) >> 8;
    }
    self.postMessage({ type: "motion", ...counter.update(pixels, data.time) });
  } catch {
    self.postMessage({ type: "error" });
  } finally {
    data.frame.close();
  }
};
