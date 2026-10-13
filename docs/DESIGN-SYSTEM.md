# Design system

The look of the portals, the admin console and the application form. Tokens are in `src/css/tokens.css`; components are in `src/css/components.css`. Page stylesheets add only what is specific to one page.

## Principles
- **Calm and legible first.** Navy for structure, coral only for the one main action on a screen, sky for focus and progress. Text and its background always pass 4.5:1 (`tests/unit/colour-contrast.test.js`).
- **Border first, shadow second.** Surfaces are separated by a hairline border; shadow is for things that float (toasts, the sticky save bar).
- **Motion explains, it does not decorate.** Movement shows where something came from or went (a step sliding in, a highlight moving to the current item, a row arriving). Only transform and opacity move; leaving is faster than arriving; reduced motion switches the layer off.
- **Every state is visible.** Hover, focus (white gap plus blue ring), pressed, disabled, busy (a spinner on the button) and error states all exist.
- **Targets of at least 44px** on touch screens; small buttons are 36px with a mouse.

## Tokens (see `tokens.css`)
Brand: `--navy`, `--ink`, `--coral-strong` (the accessible coral for text and buttons; `--coral` is for decoration), `--sky`, `--sun`. Surfaces: `--bg`, `--surface`, `--surface-2`, `--line`, `--line-strong`. Status pairs: `--ok`, `--warn`, `--bad`, `--info`, each with `-bg` and `-line`. Spacing `--s1` to `--s10`. Radius `--radius-sm`, `--radius`, `--radius-lg`, `--radius-pill`. Shadows `--shadow-sm`, `--shadow`, `--shadow-pop`. Motion `--t-fast`, `--t-card`, `--t-enter`, `--t-exit`, `--ease-out`.

## Components (see `components.css`)
`.btn` with `-primary`, `-secondary`, `-outline-secondary`, `-outline-danger`, `-outline-light`, `-link`, `-icon`, `-sm`, `-block` · `.card` · `.badge`, `.badge-status` · `.form-label`, `.form-control`, `.form-select`, `.form-check` · `.field-error`, `.hint` · `.form-alert`, `.toast` · `.data-table` inside `.table-scroll` · `.avatar`, `.person` · `.empty-state` · `[data-glide]` highlight.

## Writing for it
- Brand name is always "Centre of Foreign Learning" (`tests/unit/brand-name.test.js`).
- No inline `style="..."`, `<style>` or `on*=` handlers: the Content-Security-Policy blocks them (`tests/unit/csp-ready.test.js`). Script-driven styling goes through the CSSOM (`el.style.setProperty`), which is allowed.
- Pages must keep the motion layer's four lines (`data-veil="on"`, `fonts.css`, `motion.css`, `boot.js`); `tests/unit/page-layer.test.js` enforces them.
