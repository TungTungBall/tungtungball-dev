"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RepetitionCounter, type Landmark, type CameraRule } from "@/lib/healthmith/pose-counter";

import { FrontalPushupCounter } from "@/lib/healthmith/frontal-pushup";

const CAMERA_SIGNAL_TIMEOUT_MS = 1_000;

type CameraMessage =
  | { type: "ready" }
  | { type: "error" }
  | { type: "pose"; points: Landmark[]; normalized?: Landmark[]; time: number }
  | { type: "motion"; completed: boolean; moving: boolean; tracking: boolean };

export function PoseCamera({ rule, enabled, onRepetition, onPause, onTracking, resetWhenDisabled = false, children }: { resetWhenDisabled?: boolean; onTracking?: (tracking: boolean) => void; children: ReactNode; rule: CameraRule; enabled: boolean; onRepetition: () => void; onPause: (reason: "manual" | "no_motion") => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onRepetition, onPause, onTracking, enabled, resetWhenDisabled });
  const [status, setStatus] = useState<"preparing" | "tracking" | "unavailable">("preparing");
  const guide = "카메라를 고정하고 밝은 곳에서 운동해 주세요. 푸시업은 정면에서 상체가 화면 중앙에 오도록, 관절을 사용하는 운동은 필요한 관절이 모두 보이도록 맞춰 주세요.";
  useEffect(() => { callbacks.current = { onRepetition, onPause, onTracking, enabled, resetWhenDisabled }; }, [onRepetition, onPause, onTracking, enabled, resetWhenDisabled]);
  useEffect(() => {
    let disposed = false, busy = false, ready = false, framePending = false;
    let stream: MediaStream | undefined, worker: Worker | undefined, animation = 0;
    let lastVideoTime = -1, lastFrameTime = 0, lastMotion = performance.now();
    let paused = false;
    let lastResultTime = performance.now();
    let resetOnNextFrame = false;
    let tracking = false;
    const frontal = "method" in rule && rule.method === "frontal-pushup";
    const counter = frontal ? new FrontalPushupCounter() : "method" in rule ? null : new RepetitionCounter(rule);
    const pause = (reason: "manual" | "no_motion") => {
      if (disposed || paused) return;
      paused = true; ready = false; counter?.reset();
      stream?.getTracks().forEach((t) => t.stop());
      callbacks.current.onPause(reason);
    };
    const fail = () => {
      if (disposed) return;
      setStatus("unavailable");
      callbacks.current.onTracking?.(false);
      pause("manual");
    };
    const visibility = () => { if (document.hidden) pause("manual"); };
    const initTimeout = setTimeout(() => fail(), 30_000);
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof Worker === "undefined" || typeof createImageBitmap === "undefined") throw new Error();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (disposed || paused) { stream.getTracks().forEach((t) => t.stop()); return; }
        const [videoTrack] = stream.getVideoTracks();
        if (!videoTrack) throw new Error("Camera video track unavailable");
        videoTrack.addEventListener("ended", fail);
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream; await video.play();
        if (disposed || paused) { stream.getTracks().forEach((t) => t.stop()); return; }
        worker = counter
          ? new Worker("/pose-worker.js")
          : new Worker("/push-up-worker.mjs", { type: "module" });
        worker.onerror = () => fail();
        worker.onmessage = ({ data }: MessageEvent<CameraMessage>) => {
          if (disposed || paused) return;
          if (data.type === "ready") {
            clearTimeout(initTimeout);
            ready = true;
            lastMotion = performance.now();
            lastResultTime = lastMotion;
            return;
          }
          if (data.type === "error") {
            fail();
            return;
          }

          busy = false;
          if (!callbacks.current.enabled) {
            if(callbacks.current.resetWhenDisabled) counter?.reset(); else counter?.suspend();
            resetOnNextFrame = callbacks.current.resetWhenDisabled || !counter;
            lastMotion = performance.now();
            return;
          }
          const now = performance.now();
          if (now - lastFrameTime >= CAMERA_SIGNAL_TIMEOUT_MS || videoTrack.muted) return;
          const result = data.type === "motion" && !counter
            ? data
            : data.type === "pose" && counter
              ? counter.update(frontal ? data.normalized ?? [] : data.points, data.time)
              : null;
          if (!result) return;
          lastResultTime = now;
          tracking = result.tracking;
          callbacks.current.onTracking?.(tracking);
          setStatus(tracking ? "tracking" : "unavailable");
          if (!tracking || result.moving) lastMotion = now;
          if (tracking && result.completed) callbacks.current.onRepetition();
        };
        worker.postMessage({ type: "init", frontal });
        const frame = async (time: number) => {
          if (disposed || paused) return;
          animation = requestAnimationFrame(frame);
          if (!callbacks.current.enabled) {
            if(callbacks.current.resetWhenDisabled) counter?.reset(); else counter?.suspend();
            resetOnNextFrame = callbacks.current.resetWhenDisabled || !counter;
            lastMotion = time;
            lastResultTime = time;
            return;
          }
          if (ready && (videoTrack.muted || time - lastResultTime >= CAMERA_SIGNAL_TIMEOUT_MS)) {
            tracking = false;
            setStatus("unavailable");
            callbacks.current.onTracking?.(false);
            counter?.reset();
            resetOnNextFrame = true;
            lastMotion = time;
          }
          if (tracking && time - lastMotion >= 30_000) { pause("no_motion"); return; }
          const mediaTime = video.currentTime;
          const tooSoon = counter ? time - lastFrameTime < 66 : mediaTime - lastVideoTime < 0.06;
          if (!ready || videoTrack.muted || busy || framePending || tooSoon || video.readyState < 2 || mediaTime === lastVideoTime) return;
          lastVideoTime = mediaTime; lastFrameTime = time; framePending = true;
          try {
            const bitmap = await createImageBitmap(video);
            if (disposed || paused || !ready) { bitmap.close(); return; }
            if (resetOnNextFrame) counter?.reset();
            busy = true;
            worker?.postMessage({
              type: "frame",
              frame: bitmap,
              time: counter ? time : mediaTime * 1000,
              reset: resetOnNextFrame,
            }, [bitmap]);
            resetOnNextFrame = false;
          } catch { fail(); }
          finally { framePending = false; }
        };
        animation = requestAnimationFrame(frame);
      } catch { fail(); }
    }
    document.addEventListener("visibilitychange", visibility);
    void start();
    return () => {
      disposed = true; clearTimeout(initTimeout); cancelAnimationFrame(animation);
      document.removeEventListener("visibilitychange", visibility);
      worker?.terminate(); stream?.getTracks().forEach((t) => t.stop());
    };
  }, [rule]);
  return <section className="hm-live-camera" aria-label="카메라 측정">
    <div className="hm-camera-stage"><video ref={videoRef} autoPlay playsInline muted aria-label="운동 자세 측정 카메라" /></div>
    <div className="hm-live-readout">
      {children}
      <p className="hm-camera-status" data-camera-status={status} role="status">
        {status === "preparing" && "카메라 준비 중"}
        {status === "tracking" && "측정 중"}
        {status === "unavailable" && "판정 불가"}
      </p>
    </div>
    <p className="hm-helper">{guide}</p>
  </section>;
}
