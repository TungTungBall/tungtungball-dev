"""Convert licensed exercise clips to replayable MediaPipe body landmarks."""

import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path

import cv2
import mediapipe as mp

MODEL_SHA256 = "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a"
BODY_START = 11
BODY_END = 33
FPS = 15


def extract(video, model_path, start_ms, end_ms):
    options = mp.tasks.vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(model_path)),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        num_poses=1,
    )
    capture = cv2.VideoCapture(str(video))
    source_fps = capture.get(cv2.CAP_PROP_FPS)
    if not capture.isOpened() or not math.isfinite(source_fps) or source_fps < 1:
        capture.release()
        raise ValueError(f"Cannot decode {video.name}")
    frames = []
    frame_index = 0
    next_sample = start_ms
    try:
        with mp.tasks.vision.PoseLandmarker.create_from_options(options) as detector:
            while capture.grab():
                time_ms = round(frame_index * 1000 / source_fps)
                frame_index += 1
                if end_ms is not None and time_ms >= end_ms:
                    break
                if time_ms < next_sample:
                    continue
                while next_sample <= time_ms:
                    next_sample += 1000 / FPS
                ok, frame = capture.retrieve()
                if not ok:
                    raise ValueError(f"Cannot read {video.name} at {time_ms} ms")
                height, width = frame.shape[:2]
                scale = min(1, 720 / max(width, height))
                if scale < 1:
                    frame = cv2.resize(frame, (round(width * scale), round(height * scale)),
                                       interpolation=cv2.INTER_AREA)
                rgb = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                time_ms -= start_ms
                result = detector.detect_for_video(rgb, time_ms)
                points = []
                if result.pose_world_landmarks and result.pose_landmarks:
                    pairs = zip(result.pose_world_landmarks[0][BODY_START:BODY_END],
                                result.pose_landmarks[0][BODY_START:BODY_END], strict=True)
                    for world, image in pairs:
                        points.append([
                            round(world.x, 4), round(world.y, 4), round(world.z, 4),
                            round(image.visibility or 0, 4),
                            int(0 <= image.x <= 1 and 0 <= image.y <= 1),
                        ])
                frames.append([time_ms, points])
    finally:
        capture.release()
    if not frames or not any(points for _, points in frames):
        raise ValueError(f"No body landmarks in {video.name}")
    return frames


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("videos", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--model", type=Path, default=Path(__file__).resolve().parents[1] /
                        "public/mediapipe/pose_landmarker_lite.task")
    args = parser.parse_args()
    if hashlib.sha256(args.model.read_bytes()).hexdigest() != MODEL_SHA256:
        parser.error("Use the same Pose Landmarker Lite model as the app (pnpm prepare:pose).")
    manifest = json.loads(args.manifest.read_text())
    rows = []
    for clip in manifest["clips"]:
        video = args.videos / Path(clip["file"]).name
        if hashlib.sha256(video.read_bytes()).hexdigest() != clip["sha256"]:
            raise ValueError(f"Video checksum mismatch: {video.name}")
        frames = extract(video, args.model, clip.get("start_ms", 0), clip.get("end_ms"))
        rows.append({"id": clip["id"], "frames": frames})
        print(f"{clip['id']}: {len(frames)} frames", flush=True)
    data = {"version": 1, "first_landmark": BODY_START, "clips": rows}
    payload = json.dumps(data, separators=(",", ":"), allow_nan=False).encode()
    args.output.write_bytes(gzip.compress(payload, mtime=0))


if __name__ == "__main__":
    main()
