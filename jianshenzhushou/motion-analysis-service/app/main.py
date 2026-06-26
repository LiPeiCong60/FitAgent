import asyncio
import uuid

from fastapi import BackgroundTasks, FastAPI, HTTPException

from app.clients.callback import CallbackClient
from app.core.config import settings
from app.core.pipeline import analyze_motion
from app.schemas.motion import AnalyzeMotionRequest, CallbackPayload

app = FastAPI(title="motion-analysis-service", version="0.1.0")
callback_client = CallbackClient()


async def _push_callback(payload: CallbackPayload, callback_url: str) -> None:
    if not callback_url:
        return
    await callback_client.post(callback_url, payload)


async def _run_analysis(request: AnalyzeMotionRequest) -> None:
    callback_url = request.callbackUrl or settings.motion_callback_url
    callback_token = request.callbackToken or settings.motion_callback_token
    can_callback = bool(callback_url and callback_token)

    if can_callback:
        await _push_callback(
            CallbackPayload(
                taskId=request.taskId,
                status="processing",
                callbackToken=callback_token,
                summary="任务已进入分析中",
            ),
            callback_url,
        )

    try:
        result = await asyncio.to_thread(
            analyze_motion,
            request.videoTempUrl,
            request.exerciseType,
            settings.analysis_fps,
        )
        if can_callback:
            await _push_callback(
                CallbackPayload(
                    taskId=request.taskId,
                    status="success",
                    callbackToken=callback_token,
                    score=result["score"],
                    summary=result["summary"],
                    reps=result.get("reps"),
                    duration=result.get("duration"),
                    result=result,
                ),
                callback_url,
            )
    except Exception as err:
        if can_callback:
            await _push_callback(
                CallbackPayload(
                    taskId=request.taskId,
                    status="failed",
                    callbackToken=callback_token,
                    summary="analysis failed",
                    errorMessage=str(err),
                ),
                callback_url,
            )


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze-motion")
async def analyze_motion_endpoint(
    request: AnalyzeMotionRequest,
    background_tasks: BackgroundTasks,
) -> dict[str, object]:
    if not request.videoTempUrl:
        raise HTTPException(status_code=400, detail="videoTempUrl is required")

    job_id = f"job_{uuid.uuid4().hex[:12]}"
    background_tasks.add_task(_run_analysis, request)
    return {
        "accepted": True,
        "taskId": request.taskId,
        "jobId": job_id,
    }
