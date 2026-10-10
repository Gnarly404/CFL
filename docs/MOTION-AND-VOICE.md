# Motion and voice

## Motion (`src/js/motion/`)

Every page loads `/css/fonts.css`, `/css/motion.css` and `<script type="module" src="/js/motion/boot.js">`, and `<html data-veil="on">`.
The attribute makes the first paint a flat ink cover so pages never flash between navigations; the script replaces it with the
animated panels and lifts them. If the script never runs, CSS removes the cover after 3.2 seconds and shows all content.

| Markup | Effect |
| --- | --- |
| `data-reveal` / `data-reveal="fade"` | one element rises or fades in once when scrolled into view; `data-reveal-delay="0.2"` |
| `data-reveal-group` | the direct children stagger in, including children your script adds later |
| `data-reveal-swap` | children replaced by script (lesson steps) arrive with a short rise |
| `data-split` | hero headline words rise out of a mask (use on one heading per page) |
| `data-parallax="0.8"` inside `.parallax-scope` | background layer drifts; `data-parallax-mode="exit"` for a hero at the top |
| `.progress > span` | bar fills from the left when visible (the markup keeps the true width) |
| `data-count="1000" data-suffix="+"` | number counts up |
| `data-tilt` | pointer tilt (mouse and pen only) |

Rules: transform and opacity only, 12 to 32px of travel, once per entry, nothing runs under `prefers-reduced-motion`.
Links stay ordinary links: modified clicks, `target`, `download`, files, other sites and `data-action` controls are never intercepted
(`data-no-transition` opts a link out). Script-driven changes can call `window.cflNavigate(url)`, which exists only while the engine runs. Files use lowercase kebab-case names (the route check enforces it).

## Voice

`npm run voice` (needs `pip install piper-tts` and ffmpeg) reads the listening passages, vocabulary words and examples, speaking
prompts and `src/data/voice-lines.json`, then writes small mono MP3s and `manifest.json` to `public/audio/voice/`. Clips are found by a
hash of the exact text, so after editing lesson text run it again; unchanged lines are skipped, and a unit test fails if any line has no clip.
File names include the voice and pace, so changing either gets new URLs and nothing cached goes stale.

`--model path/to/voice.onnx` uses another Piper voice (its `.onnx.json` beside it); `--length-scale` sets pace (default 1.08);
`--force` re-renders everything. Buttons: `<button data-voice-line="home.welcome">` plays an interface line (`dash.auto` picks the greeting for the time of day); lesson results add one for the score. Text with no clip, and browsers that cannot play MP3, fall back to browser speech.
