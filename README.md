# LIGHT BENDER — Phase 3 Prototype

## Run
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## New in Phase 3
- Three laser colors: cyan, pink and gold.
- Color-matching target crystals.
- Tap-to-cycle color filters on the laser route.
- Color-coded laser beam rendering.
- Color puzzle mechanic introduced from level 11.
- Existing mirror, wall, reset, hint, progress and level navigation retained.

## Prototype status
This is still a development prototype. The generated level layouts need automated solvability checks and human playtesting. The filter mechanic is integrated into the beam path; splitters, teleporters, gates, full 100-level authored content, audio and Android packaging are not yet implemented.

## Build check
Run `npm run build` to check TypeScript and create `dist/`.

## Android packaging later
Capacitor + Android Studio are planned after puzzle validation and mobile QA.


## Phase 3 — Difficulty and mirror progression
- Required mirrors now form the actual laser route, rather than being only two route mirrors plus decorative extras.
- Difficulty bands deliberately increase required mirror counts: levels 1–10: 2; 11–25: 4; 26–45: 6; 46–70: 8; 71–100: 10.
- Additional decoy mirrors and blocking walls are introduced in later bands.
- Route generation is deterministic: replaying a level produces the same puzzle.
- The UI shows the current world and total mirror count.

This is a stronger generated prototype, but the 100 puzzle seeds should still undergo automated solvability and difficulty QA before a store release.

## Phase 4 additions
- Three-star rating: 3 stars at the minimum required-mirror move count, 2 stars within two extra moves, otherwise 1 star.
- Best move count is saved independently for each level in browser local storage.
- Sound toggle now enables/disables generated laser and victory tones using the Web Audio API. Audio starts only after a player interaction, as required by browsers.
- Win screen reports the move count and stars earned.
- Keyboard focus and reduced-motion accessibility styles added.

### Validation
The TypeScript source passes `tsc --noEmit`. Install dependencies with `npm install` before running the Vite production build or development server.


## Phase 5 — Advanced puzzle mechanics

Phase 5 adds mechanics to the actual laser simulation, introduced progressively by level:

- **Colour filter (level 11+):** changes the beam to pink as it passes through the tile.
- **Splitter (level 26+):** creates two additional perpendicular beam paths while the main beam continues.
- **Gate and switch (level 46+):** the gate blocks the laser until the player taps the `S` switch tile. Tapping the switch uses one move.
- **Paired teleporters (level 71+):** the beam entering one ring jumps to its paired ring and continues in the same direction.

Special tiles are placed on the intended route where possible. The existing mirror controls, stars, best-move records, sound preference, and saved level progress remain. Progress is stored locally in the browser.

### Controls
- Tap a mirror to rotate it.
- Tap the `S` switch to open or close the gate.
- Reset restarts the current level and resets its move count.

**Testing note:** Procedural levels should be play-tested across the level bands. This build is a feature implementation, not a claim that every generated layout has completed human QA or difficulty balancing.


## Phase 6 — 100-level campaign
- Added a level-select map with five themed world sections and 100 level tiles.
- Locked levels remain disabled until the player unlocks them by completing earlier levels.
- Current level is highlighted; completed levels show their saved star rating.
- Campaign summary displays unlocked levels and total stars earned.
- Level completion now saves the best star result per level in local storage.
- Progress remains offline on the same browser/device using localStorage. Clearing browser/app storage will erase local progress.

This is a campaign selection and progression layer; it does not claim that all 100 generated puzzles have been manually play-tested or individually hand-authored.
