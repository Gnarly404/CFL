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

The app offers two voices, **female** and **male**, chosen in the student Account settings and the instructor Settings (and kept in this
browser as `cfl.voice`, so every page follows it). Each voice has its own folder, `public/audio/voice/<voice>/`, with its own `manifest.json`.
Re-render a voice with (needs `pip install piper-tts` and ffmpeg):

    python scripts/build-voice.py --voice female --model path/to/female-voice.onnx
    python scripts/build-voice.py --voice male   --model path/to/male-voice.onnx

The current clips were rendered with Piper's `en-us-lessac-medium` (female) and `en-us-ryan-medium` (male), both from the
`v0.0.2` release of github.com/rhasspy/piper (`voice-<name>.tar.gz`, containing the `.onnx` and `.onnx.json`).
The script reads the listening passages, vocabulary words and examples, speaking prompts and `src/data/voice-lines.json` and writes small
mono MP3s. Clips are found by a hash of the exact text, so after editing lesson text run it again for **both** voices; unchanged lines
are skipped, and a unit test fails if either voice lacks a clip. File names include the voice model and pace, so nothing cached goes stale.

`--length-scale` sets pace (default 1.08); `--force` re-renders everything. Buttons: `<button data-voice-line="home.welcome">` plays an
interface line (`dash.auto` picks the greeting for the time of day); lesson results add one for the score. Text with no clip, and browsers
that cannot play MP3, fall back to browser speech, where the chosen gender is honoured only if the browser's voice names make it clear.


## Attributes added in the UI/UX redesign round

All of these are handled by the scanner in `js/motion/index.js`, so content a script adds later is picked up too, and all are skipped under reduced motion.

| Attribute | Where | What it does |
| --- | --- | --- |
| `data-glide` (container), `data-glide-item` (items) | admin sidebar, curriculum skill tabs | One highlight slides to the current item (`aria-current="page"`, `aria-selected="true"`, `aria-pressed="true"` or `.is-active`). `data-glide="hover"` also follows the pointer and focus. Colour and shape come from `--glide-bg` and `--glide-radius`. |
| `data-rows` (on a `<tbody>`) | admin tables | New rows rise 8px with a short cascade; only the first 14 move. Loading and empty rows stay still. |
| `data-toast` | admin message | Status messages appear over the page and leave by themselves (errors stay until dismissed with a click or Escape). Scripts still use `showMessage()`. |
| `data-enter` | application form | The element eases in whenever it stops being hidden (the `hidden` attribute or a `.hidden` class). |
| `data-draw`, `data-pop` (inside a `data-enter` element) | confirmation | An SVG stroke (with `pathLength="1"`) draws itself; a badge springs in. |
| `data-motion-form` | application form | Error messages ease in and the invalid field shakes; pressing Next or Send with problems shakes them again; a `cfl:step` event slides the new step in from the side you are travelling towards. |
| `details.application-details`, `.privacy-review-item`, `.curriculum-item` | admin, curriculum | The content rises when the panel opens. |

Spring settings for movement that should settle live in `SPRING` in `motion/tokens.js` (`glide`, `pop`).

## Result feedback (sounds, pulse, shake, vibration)

`js/ui/feedback.js` (started from `motion/boot.js`, so every page has it) watches for the places the app already reports results: a status
message that becomes visible with `data-kind="success"` or `"error"` (toasts, form alerts, notes) and any inline `.field-error` being added.
Each result gets a short synthesised cue (`js/ui/feedback-sound.js`, Web Audio, no files), a pulse (success) or shake (error) on the message
or field (`.fb-pop` / `.fb-shake` in `components.css`, off under Reduce motion), and a short vibration on phones. One cue per batch, so three
bad fields make one error sound; an error outranks a success. Only results that follow a click, key press or submit in the last 15 seconds are
announced, so messages painted while a page loads stay silent. New pages need no code: use `showMessage()` or set `data-kind` as now.
The "Interface sounds" setting (student Account settings, instructor Settings; `cfl.sounds` in the browser, `preferences.interfaceSounds`
on the account) turns the sound and vibration off; it is on by default.
