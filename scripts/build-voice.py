#!/usr/bin/env python3
"""Render CFL's spoken audio with Piper, entirely offline.

Reads every line the product speaks (listening passages, vocabulary words and example sentences,
speaking prompts, and the interface lines in src/data/voice-lines.json), synthesises each one with
a local Piper voice, and writes small mono MP3 files plus a manifest to public/audio/voice/.
The browser (src/js/ui/voice.js) looks clips up by a hash of the text, so changing a lesson's text
only needs this script to be run again; unchanged lines are skipped.

    pip install piper-tts
    python scripts/build-voice.py                       # uses the voice bundled in piper_tts-master/etc
    python scripts/build-voice.py --model path/to/en_GB-alba-medium.onnx
    python scripts/build-voice.py --force               # re-render everything

Any Piper voice works (.onnx plus its .onnx.json next to it). Needs ffmpeg on PATH.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"
OUT = ROOT / "public" / "audio" / "voice"
DEFAULT_MODEL = ROOT.parent / "piper_tts-master" / "etc" / "test_voice.onnx"
SENTENCE_GAP = 0.32  # seconds of silence between sentences, so dialogue turns do not run together


def normalise(text: str) -> str:
    """Must match normalise() in src/js/ui/voice.js."""
    return " ".join(text.split())


def clip_key(text: str) -> str:
    """FNV-1a 32-bit over UTF-8, hex. Must match clipKey() in src/js/ui/voice.js."""
    h = 0x811C9DC5
    for byte in normalise(text).encode("utf-8"):
        h ^= byte
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def collect() -> tuple[dict[str, str], dict[str, str]]:
    """Returns (texts keyed by clip key, interface line id -> clip key)."""
    texts: dict[str, str] = {}
    lines: dict[str, str] = {}

    def add(text: str) -> str:
        text = normalise(text)
        key = clip_key(text)
        texts[key] = text
        return key

    practice = DATA / "practice"
    for lesson in json.loads((practice / "listening.json").read_text(encoding="utf-8"))["lessons"]:
        add(lesson["listening"]["text"])
    for lesson in json.loads((practice / "vocabulary.json").read_text(encoding="utf-8"))["lessons"]:
        for word in lesson["words"]:
            add(word["word"])
            if word.get("example"):
                add(word["example"])
    for lesson in json.loads((practice / "speaking.json").read_text(encoding="utf-8"))["lessons"]:
        for prompt in lesson["prompts"]:
            add(prompt["text"])
    for line_id, text in json.loads((DATA / "voice-lines.json").read_text(encoding="utf-8")).items():
        lines[line_id] = add(text)
    return texts, lines


def synthesise(voice, text: str, syn, path: Path) -> None:
    """Sentence by sentence, with a short pause between them, to a 16-bit mono WAV."""
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    rate = voice.config.sample_rate
    gap = b"\x00\x00" * int(rate * SENTENCE_GAP)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        for i, sentence in enumerate(sentences):
            for chunk in voice.synthesize(sentence, syn):
                wav.writeframes(chunk.audio_int16_bytes)
            if i < len(sentences) - 1:
                wav.writeframes(gap)


def duration(path: Path) -> float | None:
    """Length in seconds, or None if the file is missing or unreadable (for example a half-written clip)."""
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    )
    try:
        return round(float(probe.stdout.strip()), 2)
    except ValueError:
        return None


def encode(wav_path: Path, mp3_path: Path) -> float:
    """Trim silence, even out loudness, add a breath of padding, and encode a small mono MP3."""
    chain = (
        "highpass=f=70,"
        "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,"
        "areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,"
        "loudnorm=I=-18:TP=-1.5:LRA=7,"
        "adelay=60:all=1,apad=pad_dur=0.12"
    )
    partial = mp3_path.with_suffix(".partial")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), "-af", chain, "-ac", "1", "-ar", "16000",
         "-c:a", "libmp3lame", "-b:a", "48k", "-f", "mp3", str(partial)],
        check=True,
    )
    partial.replace(mp3_path)  # atomic: a clip is either complete or absent
    return duration(mp3_path) or 0.0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL, help="Piper .onnx voice (its .onnx.json must sit beside it)")
    parser.add_argument("--length-scale", type=float, default=1.08, help="1.0 is natural pace; above 1 is slower (default suits learners)")
    parser.add_argument("--force", action="store_true", help="re-render clips that already exist")
    args = parser.parse_args()

    from piper import PiperVoice, SynthesisConfig

    if not args.model.exists():
        print(f"Voice model not found: {args.model}", file=sys.stderr)
        return 1
    voice = PiperVoice.load(str(args.model))
    syn = SynthesisConfig(length_scale=args.length_scale)
    # The tag is part of every file name, so a new voice or pace gets new URLs and cached clips never go stale.
    tag = f"{args.model.stem[:18]}-{int(args.length_scale * 100)}".replace("_", "-")

    texts, lines = collect()
    OUT.mkdir(parents=True, exist_ok=True)
    clips: dict[str, dict] = {}
    done = 0
    with tempfile.TemporaryDirectory() as tmp:
        for key, text in sorted(texts.items()):
            name = f"{key}-{tag}.mp3"
            target = OUT / name
            existing = duration(target) if target.exists() and not args.force else None
            if existing:
                clips[key] = {"text": text, "file": name, "seconds": existing}
                continue
            wav_path = Path(tmp) / f"{key}.wav"
            synthesise(voice, text, syn, wav_path)
            clips[key] = {"text": text, "file": name, "seconds": encode(wav_path, target)}
            done += 1
            print(f"  {key}  {clips[key]['seconds']:>5.1f}s  {text[:60]}")

    keep = {c["file"] for c in clips.values()}
    for old in [*OUT.glob("*.mp3"), *OUT.glob("*.partial")]:
        if old.name not in keep:
            old.unlink()
    manifest = {
        "version": 1,
        "voice": {"model": args.model.name, "sampleRate": voice.config.sample_rate, "lengthScale": args.length_scale},
        "lines": lines,
        "clips": clips,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    total = sum(p.stat().st_size for p in OUT.glob("*.mp3"))
    print(f"Rendered {done} new, {len(clips)} total clips, {total / 1024:.0f} KB -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
