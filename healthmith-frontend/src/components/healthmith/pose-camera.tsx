"use client";

import { useEffect, useRef, useState } from "react";
import { RepetitionCounter, type Landmark, type CameraRule } from "@/lib/healthmith/pose-counter";

type CameraMessage =
  | { type: "ready" }
  | { type: "error" }
  | { type: "pose"; points: Landmark[]; time: number }
  | { type: "motion"; completed: boolean; moving: boolean; tracking: boolean };

export function PoseCamera({ rule, enabled, onRepetition, onPause }: { rule: CameraRule; enabled: boolean; onRepetition: () => void; onPause: (reason: "manual" | "no_motion") => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onRepetition, onPause, enabled });
  const [message, setMessage] = useState("카메라와 자세 인식을 준비하고 있어요.");
  useEffect(() => { callbacks.current = { onRepetition, onPause, enabled }; }, [onRepetition, onPause, enabled]);
  useEffect(() => {
    let disposed = false, busy = false, ready = false, framePending = false;
    let stream: MediaStream | undefined, worker: Worker | undefined, animation = 0;
    let lastVideoTime = -1, lastFrameTime = 0, lastMotion = performance.now();
    let paused = false;
    const counter = "method" in rule ? null : new RepetitionCounter(rule);
    const pause = (reason: "manual" | "no_motion") => {
      if (disposed || paused) return;
      paused = true; ready = false; counter?.reset();
      stream?.getTracks().forEach((t) => t.stop());
      callbacks.current.onPause(reason);
    };
    const fail = (message: string) => {
      if (disposed) return;
      setMessage(message); pause("manual");
    };
    const visibility = () => { if (document.hidden) pause("manual"); };
    const initTimeout = setTimeout(() => fail("카메라 측정을 준비하지 못했어요. 연결을 확인하고 다시 시작해 주세요."), 30_000);
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof Worker === "undefined" || typeof createImageBitmap === "undefined") throw new Error();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (disposed || paused) { stream.getTracks().forEach((t) => t.stop()); return; }
        for (const track of stream.getVideoTracks()) track.addEventListener("ended", () => fail("카메라가 꺼져 운동을 일시정지했어요."));
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream; await video.play();
        if (disposed || paused) { stream.getTracks().forEach((t) => t.stop()); return; }
        worker = counter
          ? new Worker("/pose-worker.js")
          : new Worker("/push-up-worker.mjs", { type: "module" });
        worker.onerror = () => fail("자세 인식을 시작하지 못했어요. 운동을 일시정지했어요.");
        const guide = counter
          ? "주요 관절이 보이도록 위치와 조명을 조절해 주세요."
          : "카메라를 고정하고 화면 중앙에서 푸시업을 해 주세요.";
        worker.onmessage = ({ data }: MessageEvent<CameraMessage>) => {
          if (disposed || paused) return;
          if (data.type === "ready") {
            clearTimeout(initTimeout);
            ready = true;
            lastMotion = performance.now();
            setMessage(guide);
            return;
          }
          if (data.type === "error") {
            fail("자세 인식이 중단돼 운동을 일시정지했어요.");
            return;
          }

          busy = false;
          if (!callbacks.current.enabled) {
            counter?.suspend();
            lastMotion = performance.now();
            return;
          }
          const result = data.type === "motion" && !counter
            ? data
            : data.type === "pose" && counter
              ? counter.update(data.points, data.time)
              : null;
          if (!result) return;
          if (result.moving) lastMotion = performance.now();
          setMessage(result.tracking ? "움직임을 측정하고 있어요." : guide);
          if (result.completed) callbacks.current.onRepetition();
        };
        worker.postMessage({ type: "init" });
        const frame = async (time: number) => {
          if (disposed || paused) return;
          animation = requestAnimationFrame(frame);
          if (!callbacks.current.enabled) { counter?.suspend(); lastMotion = time; return; }
          if (ready && time - lastMotion >= 30_000) { pause("no_motion"); return; }
          const mediaTime = video.currentTime;
          const tooSoon = counter ? time - lastFrameTime < 66 : mediaTime - lastVideoTime < 0.06;
          if (!ready || busy || framePending || tooSoon || video.readyState < 2 || mediaTime === lastVideoTime) return;
          lastVideoTime = mediaTime; lastFrameTime = time; framePending = true;
          try {
            const bitmap = await createImageBitmap(video);
            if (disposed || paused || !ready) { bitmap.close(); return; }
            busy = true; worker?.postMessage({ type: "frame", frame: bitmap, time: counter ? time : mediaTime * 1000 }, [bitmap]);
          } catch { fail("카메라 영상을 읽지 못해 운동을 일시정지했어요."); }
          finally { framePending = false; }
        };
        animation = requestAnimationFrame(frame);
      } catch { fail("카메라 권한과 지원 브라우저를 확인해 주세요. 운동을 일시정지했어요."); }
    }
    document.addEventListener("visibilitychange", visibility);
    void start();
    return () => {
      disposed = true; clearTimeout(initTimeout); cancelAnimationFrame(animation);
      document.removeEventListener("visibilitychange", visibility);
      worker?.terminate(); stream?.getTracks().forEach((t) => t.stop());
    };
  }, [rule]);
  return <><div className="hm-camera-stage"><video ref={videoRef} autoPlay playsInline muted aria-label="운동 자세 측정 카메라" /></div><p role="status" className="hm-helper">{message}</p></>;
}
