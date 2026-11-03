import asyncio
import json
import os
import re
import time

from livekit.agents import AgentServer, AgentSession, Agent, JobContext, cli, inference, llm, room_io
from livekit.plugins import cartesia, deepgram

REPLY = os.environ.get(
    "AGENT_REPLY",
    "So its sideways speed never changes. Watch this arrow as the ball climbs and then falls back toward the hoop. The sideways arrow keeps its length the whole way, and the vertical arrow shrinks, reaches zero at the top, and then flips to point down. Nothing is pushing the ball forward any more, and that is the part most people find strange at first.",
)
LLM_TTFT_MS = float(os.environ.get("FAKE_LLM_TTFT_MS", "0"))
WORDS_PER_LLM_CHUNK = 3
SMALL_REACTIONS = {"uh", "huh", "uh-huh", "mm", "mhm", "mm-hm", "hmm", "yeah", "yes", "yep", "ok", "okay", "right", "sure"}
FRAMEWORK_RULE_OFF_WORDS = 9999
OVERLAP_STOP_SECONDS = 1.0
LIVE_TOPIC = "astra.live"
LLM_CHUNK_MS = 15
SESSION_EVENTS = [
    "user_state_changed",
    "agent_state_changed",
    "user_input_transcribed",
    "conversation_item_added",
    "agent_false_interruption",
    "speech_created",
    "eot_prediction",
    "error",
    "close",
]


def log(event: str, **fields) -> None:
    line = {"source": "agent", "sdk": "python", "event": event, "at": round(time.time() * 1000), **fields}
    print(json.dumps(line), flush=True)


def is_small_reaction(transcript: str) -> bool:
    words = [re.sub(r"[^a-z-]", "", word) for word in transcript.lower().split()]
    return all(word in SMALL_REACTIONS for word in words)


def read_turn_detection():
    mode = os.environ.get("TURN_MODE", "vad")
    if mode == "detector":
        return inference.TurnDetector(version="v1-mini")
    return mode


class NeverCalledLLM(llm.LLM):
    def chat(self, **kwargs):
        raise RuntimeError("llm_node replaces the model in this proof")


class ProofAgent(Agent):
    async def llm_node(self, chat_ctx, tools, model_settings):
        log("llm_node_started")
        if LLM_TTFT_MS > 0:
            await asyncio.sleep(LLM_TTFT_MS / 1000)
        words = REPLY.split(" ")
        for index in range(0, len(words), WORDS_PER_LLM_CHUNK):
            if index == 0:
                log("llm_first_text")
            yield " ".join(words[index : index + WORDS_PER_LLM_CHUNK]) + " "
            await asyncio.sleep(LLM_CHUNK_MS / 1000)

    async def transcription_node(self, text, model_settings):
        async for value in text:
            if hasattr(value, "start_time"):
                log("transcription_chunk", text=str(value), startTime=value.start_time, endTime=value.end_time)
            else:
                log("transcription_chunk", text=value)
            yield value


def describe(event_name, event) -> dict:
    fields = {}
    if hasattr(event, "old_state"):
        fields.update(oldState=event.old_state, newState=event.new_state)
    if hasattr(event, "transcript"):
        fields.update(transcript=event.transcript, isFinal=event.is_final)
    item = getattr(event, "item", None)
    if item is not None and hasattr(item, "role"):
        fields.update(role=item.role, text=item.text_content, interrupted=item.interrupted)
    if hasattr(event, "resumed"):
        fields.update(resumed=event.resumed)
    if event_name == "eot_prediction":
        fields.update(probability=event.probability, threshold=event.threshold)
    return fields


# The tutor yields as soon as voice starts, and stops when a real word arrives or the overlap lasts too long.
def attach_tiered_policy(ctx: JobContext, session: AgentSession) -> None:
    state = {"yielding": False, "timer": None}

    def publish(message: dict) -> None:
        payload = json.dumps(message).encode()
        asyncio.create_task(ctx.room.local_participant.publish_data(payload, reliable=True, topic=LIVE_TOPIC))

    def stop_speaking(reason: str, transcript: str | None = None) -> None:
        if not state["yielding"]:
            return
        state["yielding"] = False
        if state["timer"]:
            state["timer"].cancel()
        log("policy_interrupt", reason=reason, transcript=transcript)
        publish({"type": "stop", "at": round(time.time() * 1000)})
        session.interrupt()

    def on_user_state(event) -> None:
        if event.new_state == "speaking" and session.agent_state == "speaking":
            state["yielding"] = True
            log("policy_yield")
            publish({"type": "yield", "at": round(time.time() * 1000)})
            state["timer"] = asyncio.get_running_loop().call_later(OVERLAP_STOP_SECONDS, stop_speaking, "overlap too long")
        if event.new_state == "listening" and state["yielding"]:
            state["yielding"] = False
            if state["timer"]:
                state["timer"].cancel()
            log("policy_unyield")
            publish({"type": "unyield", "at": round(time.time() * 1000)})

    def on_transcribed(event) -> None:
        if event.transcript.strip() == "":
            return
        if not is_small_reaction(event.transcript):
            stop_speaking("real word", event.transcript)
        elif state["timer"]:
            state["timer"].cancel()

    session.on("user_state_changed", on_user_state)
    session.on("user_input_transcribed", on_transcribed)


server = AgentServer(num_idle_processes=1)


@server.rtc_session()
async def entry(ctx: JobContext):
    await ctx.connect()
    log("connected", room=ctx.room.name)
    session = AgentSession(
        llm=NeverCalledLLM(),
        stt=deepgram.STT(api_key="fake", base_url=f"ws://127.0.0.1:{os.environ.get('FAKE_STT_PORT', '17802')}/v1/listen"),
        tts=cartesia.TTS(api_key="fake", base_url=f"http://127.0.0.1:{os.environ.get('FAKE_TTS_PORT', '17801')}"),
        vad=inference.VAD(min_silence_duration=float(os.environ.get("VAD_MIN_SILENCE_MS", "250")) / 1000),
        use_tts_aligned_transcript=os.environ.get("ALIGNED", "1") != "0",
        turn_handling={
            "turn_detection": read_turn_detection(),
            "endpointing": {
                "min_delay": float(os.environ.get("EP_MIN_MS", "300")) / 1000,
                "max_delay": float(os.environ.get("EP_MAX_MS", "3000")) / 1000,
            },
            "interruption": {
                "mode": "vad",
                "min_duration": float(os.environ.get("INT_MIN_MS", "500")) / 1000,
                "min_words": FRAMEWORK_RULE_OFF_WORDS if os.environ.get("POLICY") else int(os.environ.get("INT_MIN_WORDS", "0")),
                "false_interruption_timeout": float(os.environ.get("INT_FALSE_MS", "2000")) / 1000,
                "resume_false_interruption": os.environ.get("INT_RESUME", "1") != "0",
            },
            "preemptive_generation": {"enabled": os.environ.get("PREEMPT") == "1"},
        },
    )
    for event_name in SESSION_EVENTS:
        session.on(event_name, lambda event, name=event_name: log(name, **describe(name, event)))
    if os.environ.get("POLICY") == "words":
        def on_transcribed(event):
            if event.transcript.strip() == "" or is_small_reaction(event.transcript):
                return
            log("policy_interrupt", transcript=event.transcript)
            session.interrupt()

        session.on("user_input_transcribed", on_transcribed)
    if os.environ.get("POLICY") == "tiered":
        attach_tiered_policy(ctx, session)
    await session.start(
        agent=ProofAgent(instructions="proof"),
        room=ctx.room,
        room_options=room_io.RoomOptions(close_on_disconnect=os.environ.get("CLOSE_ON_DISCONNECT") != "0"),
    )
    log("session_started")


if __name__ == "__main__":
    cli.run_app(server)
