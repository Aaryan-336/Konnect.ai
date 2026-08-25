"""Voice transcription route."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.auth.dependencies import get_current_user
from app.models.user import User
from app.voice.provider import STTUnavailableError, get_stt_provider

router = APIRouter(prefix="/api/voice", tags=["voice"])

# Whisper's own ceiling on both hosted backends.
MAX_AUDIO_BYTES = 25 * 1024 * 1024
# Anything shorter is a mis-tap, not speech. Sending it wastes a round trip and
# comes back as an empty string or a hallucinated fragment.
MIN_AUDIO_BYTES = 1200

# Whisper does not return an empty string for silent audio — it emits filler,
# most often a stray pleasantry or a scrap of subtitle boilerplate from its
# training data. `no_speech_prob` is unreliable on the turbo model (it reports
# 0.0 even for pure silence), so the artifacts are matched directly.
#
# The client gates on input level first; this is the backstop for browsers
# where the analyser is unavailable.
_SILENCE_ARTIFACTS = {
    "thank you",
    "thanks for watching",
    "thanks for watching!",
    "thank you for watching",
    "you",
    "bye",
    "bye.",
    "so",
    "okay",
    "oh",
    "mm",
    "mhm",
    "subtitles by the amara.org community",
    "transcription by castingwords",
    "please subscribe",
}


def _is_silence_artifact(text: str) -> bool:
    """True when the transcript is one of Whisper's stock silence outputs."""
    normalised = text.strip().strip(".!?,").lower()
    return normalised in _SILENCE_ARTIFACTS


@router.post("/transcribe")
async def transcribe(
    user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
):
    """Transcribe recorded audio to text."""
    content = await file.read()

    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio is too long (max 25MB).")
    if len(content) < MIN_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="That recording was too short to hear.")

    # Resolved per request (and cached) so a configuration fix takes effect on
    # a restart rather than crashing the app at import time.
    try:
        provider = get_stt_provider()
    except STTUnavailableError as exc:
        raise HTTPException(status_code=503, detail=f"Voice input is unavailable — {exc}")

    try:
        text = await provider.transcribe(
            content,
            content_type=file.content_type or "audio/webm",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Transcription failed: {str(exc)[:200]}",
        )

    text = (text or "").strip()
    if not text or _is_silence_artifact(text):
        raise HTTPException(status_code=422, detail="No speech was detected. Try again.")

    return {"text": text, "provider": provider.name}
