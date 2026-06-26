# Motion Analysis Service

## Run

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Required environment variables

- `MOTION_CALLBACK_URL`: update callback endpoint, recommended to expose `updateMotionTask` through API Gateway.
- `MOTION_CALLBACK_TOKEN`: shared secret for callback authentication.
- `MOTION_ANALYSIS_FPS`: optional, default `6`.

## Notes

- The service downloads the video, extracts frames with FFmpeg, runs MediaPipe Pose, smooths landmarks, then applies rule-based analysis.
- The current MVP only supports `squat`, `pushup`, and `plank`.
