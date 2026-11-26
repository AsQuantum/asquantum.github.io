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

Global bar modulation is enabled by default for new or previously unset preferences. An explicitly saved disabled preference is preserved.


## Rhythm challenge

In Orchestra mode, with the select tool, triple-click the same machine
within 1.5 seconds, or hold and release it three times (at least 550 ms
per hold, within 10 seconds). The map viewport becomes a four-lane
challenge by default. D F J K (4K), S D F J K L (6K), A S D F J K L ; (8K), or touch the
corresponding buttons. Escape or the top-right close button returns to
the map. Space toggles playback only on a short tap (at most 250 ms,
no pan).

The challenge uses 120 BPM. A private, empty-start simulation computes
16 bars (32 real seconds, 64 simulated seconds), capturing the actual
score and transfer events. The phrase repeats twice for 32 total bars
and 64 seconds of music. Scores and the song clock continue across the repeat.
It does not rely on a theoretical logistics period. A silent song produces
a clear result instead of an empty
one-minute challenge. The original factory is frozen during the song:
its simulation, stock, counters, rational frozen phases, and fractional
clock are preserved. Temporary state is installed only within synchronous
preview batches, then restored in a finally block. Editing is locked
until leaving the challenge. Returning restores the original transport
state and tempo.

Audio and chart timing use a separate song clock. Visible fall duration
is 1.2 seconds by default (0.50–3.00 seconds, editable), independent of the
120 BPM tempo and judgement windows. Changing scroll speed does not
restart the song. Independent lane count (4/6/8K) and difficulty settings:
easy (default) caps 3 targets/second, single notes, 300 ms onset gap;
advanced caps 6 targets/second, 2-note chords, 105 ms onset gap; hard caps
10 targets/second, 3-note chords, 65 ms onset gap. These caps apply at
every lane count and never remove background music. Auto mode
plays due chart notes as PERFECT in a separate demo session. Each lane
has its own color-coded judgement label and local glow, without hit
frames, on a belt-inspired moving background. PERFECT +/-60 ms (1000), GREAT +/-115 ms (700), GOOD +/-180 ms
(400), otherwise MISS. Changing lane count, difficulty, autoplay or reroll starts
a new session. Pause freezes the song clock and preserves chart notes
and score; audio already started is stopped and future notes rescheduled.
Scores are session-local; results wait for the audio tail.

The nine timbres have independent linear gain buses. Sample envelopes
are measured in 10 ms windows, with RMS and peak estimates placed on the
audio timeline in 25 ms blocks. Exact coherent duplicates sum amplitude;
other onsets contribute power. The channel RMS budget is 0.11, the total
RMS budget 0.15, and the conservative peak budget 0.58 before user volume.
Gain recovery is 120 ms; no compressor, automatic makeup, or waveform
saturation. These are engineering estimates, not LUFS/true-peak metering.
Rhythm mode preanalyses its phrase for modest fixed timbre fader ceilings;
pausing retains the phrase profile and resets active sound automation.
Samples are synthesized at 32 kHz in three-semitone root groups with
Nyquist margin, a DC blocker and smooth attack/release. Gentle RMS-based
trim balances timbres while leaving percussion and sustained voices distinct.
Cyclic modulation selects octave-equivalent fourth/fifth offsets to reduce
register jumps. Existing editable notes, event timing and score settings
are retained. The shared master volume remains beside BPM in all views.

Transport stops cancel unstarted notes immediately and fade already sounding
notes on their old, isolated graph over 45 ms (raised cosine). A new graph
accepts notes on time and fades in over 30 ms from its first onset. Retired
graphs disconnect after their last source ends. The simulation and chart
clocks are not changed. A suspended context cannot render a fade, so silent
old nodes are discarded and the next audible onset fades in.

Actual warehouse rows and stock numbers pulse green for income and red for expense
on physical warehouse inlet/outlet notes (latest event wins for the same item), not ordinary machines, frozen
factory movements, or chart judgements. The normal 300 ms refresh cadence
is unchanged; warehouse note onsets additionally force a ledger refresh.
Rhythm mode replays labeled read-only warehouse snapshots, including exact
warehouse-event ticks. Real inventory and inspector remain frozen.
Minute-window statistics retain their original meaning.

The selected machine summary pulses in its orchestra color on a note.
Only the matching input/output stack row pulses in its material color;
other machines of the same type do not trigger the selected inspector.

Inspector feedback is strictly driven by successful belt arrivals and
dispatches that produce scheduled notes, never recipe consumption or
completion. Rhythm highlights wait for the actual audio-source start.
Summary fill peaks at only 5% of the machine color.

Editor selection, machine side panels, and yellow/red edit rails use a
1.5x width multiplier on the normal rhythmic stroke. Conveyor rails grow
inward to retain the fixed crossing footprint; draft/trim dashed previews
follow the source route note envelope.

Rhythm sidebars remain scrollable but editing events are blocked. Mobile
read-only tabs pause gameplay rather than closing the song; resume from
the map. A fitted full 72x72 factory preview reuses the original renderer
with an isolated canvas/camera. It shows baked machine and route pulses and sampled packet positions
(50 ms playback intervals), never frozen live packets. Hidden on narrow
stages. Enter/exit transitions move the fitted map between the original
camera and preview. Lane side rails blink in the note color on its onset.

Music remains a shared localStorage configuration, independent of factory
JSON and AST1. Reroll invalidates the fitted preview background via a score
revision and rebuilds the active rhythm phrase and packet frames.

The music editor shares ORCH1: codes separately from factory JSON/AST1.
They contain the complete shared catalog score (including unused types),
track volumes, harmony, modulation, BPM and phrase generation length.
Import validates all directions before replacing the shared score, disables
auto-random on entry, and uses the same reroll/invalidation path. Personal
master volume, game difficulty and factory data are not part of the code.

The music preset selector is global across factories. Legacy settings become
the first preset; new presets start with a fresh random 16-slot score at
120 BPM. Each preset retains its own musical code and random preferences.
Switching, renaming and deleting never modify the factory layout. The
active preset is automatically saved; the last preset cannot be deleted.

Regression suites (node tests/run-tests.js):
- orchestra-music: harmony, event periods, code and preset persistence.
- orchestra-audio: synthesis, mixing, transport fade, lifecycle.
- orchestra-rhythm: chart difficulty, score, replay and baked snapshots.
- orchestra-desktop / orchestra-mobile: end-to-end score sharing, presets,
  input, sidebars, map fit, packet animation, transitions, visual feedback,
  rerolls and real simulator isolation.
- orchestra: all five groups (also included in current).
