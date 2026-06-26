import math
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import cv2
import httpx
import mediapipe as mp
import numpy as np

from app.schemas.motion import IssueItem, MotionResult


LANDMARKS = mp.solutions.pose.PoseLandmark


def _download_video(video_url: str, workspace: Path) -> Path:
    target = workspace / "source.mp4"
    with httpx.stream("GET", video_url, timeout=60) as response:
        response.raise_for_status()
        with target.open("wb") as file:
            for chunk in response.iter_bytes():
                file.write(chunk)
    return target


def _extract_frames(video_path: Path, workspace: Path, fps: int) -> list[Path]:
    frames_dir = workspace / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    output_pattern = str(frames_dir / "frame_%05d.jpg")

    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(video_path), "-vf", f"fps={fps}", output_pattern],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        capture = cv2.VideoCapture(str(video_path))
        frame_index = 0
        saved_index = 0
        input_fps = capture.get(cv2.CAP_PROP_FPS) or 30
        interval = max(1, int(round(input_fps / fps)))
        while True:
            success, frame = capture.read()
            if not success:
                break
            if frame_index % interval == 0:
                saved_index += 1
                output = frames_dir / f"frame_{saved_index:05d}.jpg"
                cv2.imwrite(str(output), frame)
            frame_index += 1
        capture.release()

    return sorted(frames_dir.glob("*.jpg"))


def _landmark_to_dict(landmark: Any) -> dict[str, float]:
    return {
        "x": float(landmark.x),
        "y": float(landmark.y),
        "z": float(landmark.z),
        "visibility": float(landmark.visibility),
    }


def _load_pose_sequence(frame_paths: list[Path]) -> list[dict[str, Any]]:
    pose = mp.solutions.pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        enable_segmentation=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    sequence: list[dict[str, Any]] = []

    for frame_path in frame_paths:
        image = cv2.imread(str(frame_path))
        if image is None:
            continue
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        results = pose.process(rgb)
        if not results.pose_landmarks:
            continue
        sequence.append(
            {
                "frame": frame_path.name,
                "landmarks": {
                    landmark.name.lower(): _landmark_to_dict(results.pose_landmarks.landmark[landmark.value])
                    for landmark in LANDMARKS
                },
            }
        )

    pose.close()
    return _smooth_sequence(sequence)


def _smooth_sequence(sequence: list[dict[str, Any]], alpha: float = 0.35) -> list[dict[str, Any]]:
    if not sequence:
        return sequence

    previous = None
    smoothed: list[dict[str, Any]] = []
    for frame in sequence:
        current = {"frame": frame["frame"], "landmarks": {}}
        for name, point in frame["landmarks"].items():
            if previous is None or name not in previous:
                current["landmarks"][name] = dict(point)
                continue
            prev = previous[name]
            current["landmarks"][name] = {
                axis: float(alpha * point[axis] + (1 - alpha) * prev[axis])
                for axis in ("x", "y", "z", "visibility")
            }
        previous = current["landmarks"]
        smoothed.append(current)
    return smoothed


def _point(frame: dict[str, Any], name: str) -> np.ndarray:
    point = frame["landmarks"][name]
    return np.array([point["x"], point["y"]], dtype=float)


def _visibility(frame: dict[str, Any], name: str) -> float:
    return float(frame["landmarks"][name]["visibility"])


def _side(frame: dict[str, Any], left_name: str, right_name: str) -> str:
    return "left" if _visibility(frame, left_name) >= _visibility(frame, right_name) else "right"


def _joint_angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    ba = a - b
    bc = c - b
    cosine = float(np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6))
    cosine = max(-1.0, min(1.0, cosine))
    return math.degrees(math.acos(cosine))


def _body_line_angle(frame: dict[str, Any], side: str) -> float:
    shoulder = _point(frame, f"{side}_shoulder")
    hip = _point(frame, f"{side}_hip")
    ankle = _point(frame, f"{side}_ankle")
    return 180 - _joint_angle(shoulder, hip, ankle)


def _summary(title: str, issues: list[IssueItem]) -> str:
    if not issues:
        return f"{title}: stable overall form, no major issue detected in MVP rules."
    return f"{title}: {len(issues)} priority issue(s) detected. Fix the highest severity item first."


def _build_issue(code: str, title: str, severity: str, advice: str) -> IssueItem:
    return IssueItem(code=code, title=title, severity=severity, advice=advice)


def _analyze_squat(sequence: list[dict[str, Any]], fps: int) -> MotionResult:
    knee_angles: list[float] = []
    state = "up"
    reps = 0
    bottom_samples = []
    top_samples = []

    for frame in sequence:
        side = _side(frame, "left_hip", "right_hip")
        shoulder = _point(frame, f"{side}_shoulder")
        hip = _point(frame, f"{side}_hip")
        knee = _point(frame, f"{side}_knee")
        ankle = _point(frame, f"{side}_ankle")

        knee_angle = _joint_angle(hip, knee, ankle)
        hip_angle = _joint_angle(shoulder, hip, knee)
        knee_angles.append(knee_angle)

        if knee_angle < 95 and state == "up":
            state = "down"
            bottom_samples.append((knee_angle, abs(180 - hip_angle)))
        elif knee_angle > 155 and state == "down":
            state = "up"
            reps += 1
            top_samples.append(knee_angle)

    issues: list[IssueItem] = []
    min_knee = min(knee_angles) if knee_angles else 180.0
    avg_bottom_lean = float(np.mean([item[1] for item in bottom_samples])) if bottom_samples else 0.0
    avg_top = float(np.mean(top_samples)) if top_samples else 180.0
    tempo_seconds = len(sequence) / max(fps, 1) / max(reps, 1) if sequence else 0.0

    if min_knee > 105:
        issues.append(_build_issue("insufficient_depth", "Depth too shallow", "high", "Sit the hips lower and aim for thighs close to parallel."))
    if avg_bottom_lean > 38:
        issues.append(_build_issue("forward_lean", "Excessive forward lean", "medium", "Brace the trunk and keep the chest proud through the bottom position."))
    if avg_top < 160:
        issues.append(_build_issue("incomplete_lockout", "Incomplete lockout", "medium", "Finish each rep by standing fully tall before the next descent."))
    if tempo_seconds and tempo_seconds < 1.2:
        issues.append(_build_issue("unstable_tempo", "Tempo too fast", "low", "Slow down the eccentric and keep the rep rhythm consistent."))

    score = max(50, 100 - len(issues) * 10 - int(max(0, min_knee - 95) * 0.4))
    return MotionResult(
        exerciseType="squat",
        reps=reps,
        duration=round(len(sequence) / max(fps, 1), 1),
        score=score,
        summary=_summary("Squat", issues),
        issues=issues[:3],
        metrics={
            "minKneeAngle": round(min_knee, 1),
            "avgBottomTorsoLean": round(avg_bottom_lean, 1),
            "avgTopKneeAngle": round(avg_top, 1),
            "tempoSecondsPerRep": round(tempo_seconds, 2),
        },
        debug={"framesUsed": len(sequence)},
    )


def _analyze_pushup(sequence: list[dict[str, Any]], fps: int) -> MotionResult:
    elbow_angles: list[float] = []
    body_line_errors: list[float] = []
    state = "up"
    reps = 0
    top_angles = []

    for frame in sequence:
        side = _side(frame, "left_shoulder", "right_shoulder")
        shoulder = _point(frame, f"{side}_shoulder")
        elbow = _point(frame, f"{side}_elbow")
        wrist = _point(frame, f"{side}_wrist")

        elbow_angle = _joint_angle(shoulder, elbow, wrist)
        body_error = abs(_body_line_angle(frame, side))
        elbow_angles.append(elbow_angle)
        body_line_errors.append(body_error)

        if elbow_angle < 95 and state == "up":
            state = "down"
        elif elbow_angle > 155 and state == "down":
            state = "up"
            reps += 1
            top_angles.append(elbow_angle)

    issues: list[IssueItem] = []
    min_elbow = min(elbow_angles) if elbow_angles else 180.0
    avg_body_error = float(np.mean(body_line_errors)) if body_line_errors else 0.0
    avg_top = float(np.mean(top_angles)) if top_angles else 180.0

    if min_elbow > 95:
        issues.append(_build_issue("insufficient_depth", "Depth too shallow", "high", "Lower the chest more before pressing back up."))
    if avg_body_error > 18:
        issues.append(_build_issue("body_line_break", "Body line breaks", "high", "Brace the abs and glutes so shoulders, hips and ankles stay aligned."))
    if avg_top < 158:
        issues.append(_build_issue("partial_lockout", "Incomplete lockout", "medium", "Finish each rep by pressing to a clear top position."))
    if reps <= 1 and len(sequence) > fps * 4:
        issues.append(_build_issue("segment_unclear", "Rep rhythm unclear", "low", "Use a steady cadence with a clearer bottom and top position."))

    score = max(50, 100 - len(issues) * 11 - int(max(0, min_elbow - 85) * 0.3))
    return MotionResult(
        exerciseType="pushup",
        reps=reps,
        duration=round(len(sequence) / max(fps, 1), 1),
        score=score,
        summary=_summary("Push-up", issues),
        issues=issues[:3],
        metrics={
            "minElbowAngle": round(min_elbow, 1),
            "avgBodyLineError": round(avg_body_error, 1),
            "avgTopElbowAngle": round(avg_top, 1),
        },
        debug={"framesUsed": len(sequence)},
    )


def _analyze_plank(sequence: list[dict[str, Any]], fps: int) -> MotionResult:
    body_errors = []
    hip_offsets = []
    valid_frames = 0

    for frame in sequence:
        side = _side(frame, "left_shoulder", "right_shoulder")
        error = _body_line_angle(frame, side)
        hip = _point(frame, f"{side}_hip")
        shoulder = _point(frame, f"{side}_shoulder")
        ankle = _point(frame, f"{side}_ankle")
        baseline = ((shoulder[1] + ankle[1]) / 2.0) - hip[1]
        body_errors.append(error)
        hip_offsets.append(baseline)
        if abs(error) <= 12:
            valid_frames += 1

    issues: list[IssueItem] = []
    avg_error = float(np.mean(body_errors)) if body_errors else 0.0
    avg_offset = float(np.mean(hip_offsets)) if hip_offsets else 0.0
    duration = valid_frames / max(fps, 1)

    if avg_offset > 0.035:
        issues.append(_build_issue("hip_too_high", "Hips too high", "medium", "Drop the hips slightly so the body stays closer to one straight line."))
    if avg_offset < -0.035:
        issues.append(_build_issue("hip_sagging", "Hips sagging", "high", "Brace the core and glutes harder to avoid lumbar extension."))
    if abs(avg_error) > 12:
        issues.append(_build_issue("body_line_break", "Body line unstable", "high", "Keep the neck neutral and avoid drifting the hips up and down."))
    if duration < 5:
        issues.append(_build_issue("hold_too_short", "Effective hold too short", "low", "Hold fewer seconds with better shape before extending duration."))

    score = max(50, 100 - len(issues) * 10 - int(abs(avg_error) * 1.2))
    return MotionResult(
        exerciseType="plank",
        reps=None,
        duration=round(duration, 1),
        score=score,
        summary=_summary("Plank", issues),
        issues=issues[:3],
        metrics={
            "validHoldSeconds": round(duration, 1),
            "avgBodyLineError": round(avg_error, 1),
            "avgHipOffset": round(avg_offset, 3),
        },
        debug={"framesUsed": len(sequence), "validFrames": valid_frames},
    )


def analyze_motion(video_url: str, exercise_type: str, fps: int) -> dict[str, Any]:
    if not video_url:
        raise ValueError("videoTempUrl is required")

    workspace = Path(tempfile.mkdtemp(prefix="motion-analysis-"))
    try:
        video_path = _download_video(video_url, workspace)
        frames = _extract_frames(video_path, workspace, fps)
        sequence = _load_pose_sequence(frames)
        if len(sequence) < max(8, fps):
            raise ValueError("not enough valid pose frames")

        analyzers = {
            "squat": _analyze_squat,
            "pushup": _analyze_pushup,
            "plank": _analyze_plank,
        }
        result = analyzers[exercise_type](sequence, fps)
        return result.model_dump()
    finally:
        shutil.rmtree(workspace, ignore_errors=True)
