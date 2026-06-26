import httpx

from app.schemas.motion import CallbackPayload


class CallbackClient:
    async def post(self, url: str, payload: CallbackPayload) -> None:
        if not url:
            return

        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(url, json=payload.model_dump())
            response.raise_for_status()
