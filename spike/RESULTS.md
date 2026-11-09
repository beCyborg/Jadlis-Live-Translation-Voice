# Spike results — 2026-11-09

## TTS: HTTP stream + eleven_v4_turbo (spike 2)
- `POST /v1/text-to-speech/{voice}/stream` accepts `eleven_v4_turbo` (20/20 requests OK).
- Time to first byte: median 159 ms (min 116, max 1814 — the first, cold request). Warm-up request at start is worth it.
- Region header `x-region: europe-west4` (Netherlands) from Poland.
- `eleven_v4_turbo` supports `cs` (and pl, es, ru) — `GET /v1/models`.

## Scribe v2 Realtime: language stickiness (spike 1)
20 utterances RU/PL/ES/CS mixed, VAD commit, `vad_silence_threshold_secs=0.8`, `include_language_detection=true`.

| Mode | ≥3-word utterances with correct text | wrong lang code (≥3 words) | silently translated / dropped |
|---|---|---|---|
| one session, auto language | 12/15 | 1 | RU→CS translated (#15), ES dropped (#10), PL in Cyrillic (#1) |
| one session, `language_code=ru` + `secondary_languages` | 13/15 | 3 | ES dropped (#10), PL in Cyrillic (#1) |
| **new session per utterance** | **15/15** | **0** | none |

- Short words (`Tak`, `Sí`, `Ano`, `Да`): text mostly right in rotation mode, language code random (hu/tr/it/mk) → direction must be decided by Claude from text + context, not by Scribe's code.
- Latency end-of-speech → committed: ~0.9–1.1 s with 0.8 s VAD silence (≈150–250 ms after the silence threshold).
- Session open (token ready → `session_started`): 240–740 ms → keep the next session pre-opened.
- `commit_strategy=turn_prediction` is rejected: "not supported by model_id 'scribe_v2_realtime'"; only `scribe_v2_realtime` exists. → VAD with a user pause slider.
- Arrays in the query string: repeated keys (`secondary_languages=pl&secondary_languages=es`) are accepted.

Raw logs: `spike/out/log-*.txt` (not committed).
