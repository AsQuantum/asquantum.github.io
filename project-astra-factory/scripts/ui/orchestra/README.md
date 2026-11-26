# Factory Orchestra

The music theme is a presentation and audio layer on the ordinary editor.
There is no alternate canvas, camera, layout or simulation. Theme transitions
preserve the screen projection; the ordinary editing tools, sidebars, scheme
selector and clipboard remain available. A scheme reset follows the ordinary
simulator's reset behavior. Exiting restores the original simulation speed,
but intentionally keeps edits, inventory and elapsed simulation time.

- audio.js: generated instrument samples, Web Audio lifecycle, bounded polyphony.
- score.js: per-machine-type receive/send event patterns, timeline, pitch and persistence.
- harmony.js: shared tonal center, instrument registers and constrained random motifs.
- render.js: theme palette and dynamic overlays for the existing world canvas.
- ../orchestra.js: mode lifecycle, shared controls, transfer observer, event
  scheduling, score synchronization and transitions.
- ../../engine/simulation.js: optional successful-transfer observer, no change
  to the physical state transition or theoretical solver.

Random generation defaults to sixteen event slots; common chord tones, instrument-specific registers and independent four-event contours avoid unrelated per-machine chord changes. The full-workspace score covers both sidebars without changing the map dimensions. Each physical machine advances its own receive/send cursor on a successful transfer; the sixteen-note default is not quantized to wall-clock beats. Old per-port scores remain stored separately.

The local score is global across factory schemes. On first entry, missing
catalog tracks are generated once and saved. Complete rerolls cover the full
catalog, including currently absent types. Optional bar modulation transposes
all melodic voices together on the physical simulation beat clock (four game
seconds per bar), never on individual transfer counters. Percussion retains
its base pitch; editor notes are displayed in the base key.

The center uses a static label only. Optional phrase-length shuffle chooses a single 4/8/16-event length (20/60/20 percent) for all catalog tracks on a complete reroll; default is sixteen.

Audio batches coalesce identical instrument/pitch events within one simulation tick; all event cursors and interface hits are retained. Distinct ticks retain their temporal spacing. Machine hit overlays render before route packets; route crossing occlusion remains local.
The editor footer projects existing witnessed theoretical component periods onto the score cursor lengths using exact rational rates and BigInt LCM (period.js). Unknown or rate-only solutions are not extrapolated. The reference assumes the solver initial state, not arbitrary live inventory.

A complete random phrase uses a distinct anchor/contour for each four-event melodic block in the common chord/scale; its event-time period is not fitted to logistics and generation never changes the playback key. Optional global modulation remains a separate control.

Generated sequences contain a pitched event in every slot, including percussion; manual score edits may still introduce rests. The center is a static tracked-letter wordmark, with no spectrum or analyser.

The playback cursor is the physical machine's cumulative successful input/output count modulo its sequence length, including transfers outside music mode. Only a real simulation reset starts those counters from zero. The ruler is a separate global reference clock; per-lane markers show actual next-event positions. Music settings are grouped in a compact disclosure.
