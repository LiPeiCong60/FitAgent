from typing import Any, Literal

from pydantic import BaseModel, Field


ExerciseType = Literal["squat", "pushup", "plank"]
TaskStatus = Literal["queued", "processing", "success", "failed"]


class AnalyzeMotionRequest(BaseModel):
    taskId: str
    exerciseType: ExerciseType
    videoFileId: str
    videoTempUrl: str = ""
    videoMeta: dict[str, Any] = Field(default_factory=dict)
    callbackUrl: str = ""
    callbackToken: str = ""


class IssueItem(BaseModel):
    code: str
    title: str
    severity: Literal["low", "medium", "high"]
    advice: str


class MotionResult(BaseModel):
    exerciseType: ExerciseType
    reps: int | None = None
    duration: float | None = None
    score: int
    summary: str
    issues: list[IssueItem] = Field(default_factory=list)
    metrics: dict[str, Any] = Field(default_factory=dict)
    debug: dict[str, Any] = Field(default_factory=dict)


class CallbackPayload(BaseModel):
    taskId: str
    status: TaskStatus
    callbackToken: str
    score: int | None = None
    summary: str = ""
    reps: int | None = None
    duration: float | None = None
    result: dict[str, Any] | None = None
    errorMessage: str = ""
