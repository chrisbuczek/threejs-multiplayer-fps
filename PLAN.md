# Multiplayer FPS — Implementation Plan

A browser FPS built with **three.js + TypeScript (no UI framework)**, inspired by the gameplay feel of Call of Duty: Modern Warfare (2019).
Two modes (Team Deathmatch, Deathmatch), two maps (Dust2-style, Shipment-style), rooms with a lobby, name-only login.

> This plan is meant to be executed phase by phase by Claude Code. Each phase ends in a runnable, testable state.
> Guiding rule: **simplicity first**. Small files, plain classes/functions, no clever abstractions, no frameworks beyond what is listed.

---

## 1. Architecture overview

```
mp-fps/
├── client/        # Vite + TypeScript + three.js  → deployed to Vercel (static site)
├── server/        # Node.js + TypeScript + ws     → deployed to Railway / Render / Fly.io
└── shared/        # Types, constants, protocol messages, weapon stats (used by both)
```

### Why the server is NOT on Vercel
Vercel runs serverless functions with no persistent process and no WebSocket server. A real-time shooter needs a long-lived process that runs a game loop at a fixed tick rate and keeps WebSocket connections open. Therefore:

- **Client** → Vercel (static build from `client/dist`).
- **Server** → any host with persistent Node processes. Recommended: **Railway** (simplest), alternatives Render or Fly.io.
- The client reads the server URL from `VITE_SERVER_URL` (env variable set in Vercel).

### Networking model
- **Authoritative server.** The server owns the truth: positions, health, hits, kills, scores, match timer.
- **Client-side prediction** for the local player's movement (instant response), with **server reconciliation**.
- **Entity interpolation** for remote players (render ~100 ms in the past for smoothness).
- **Lag-compensated hitscan**: the server rewinds other players' hitboxes to the shooter's view time when validating a shot.
- Transport: plain **WebSocket** (`ws` package on server, native `WebSocket` in browser). JSON messages for simplicity (fine at ≤12 players; can be swapped to binary later if needed).
- Server tick: **30 Hz** simulation, snapshots broadcast at **20 Hz**. Client renders at display rate.

---

## 2. Tech stack

| Area | Choice | Reason |
|---|---|---|
| Language | TypeScript (strict) everywhere | One language, shared types |
| Client build | Vite | Zero-config TS, fast dev server, static output for Vercel |
| 3D | three.js (+ `three/examples/jsm` addons) | Requirement |
| Post-processing | `postprocessing` (pmndrs) library | Better SSAO (N8AO), bloom, SMAA than examples; still framework-free |
| Physics/collision | Custom: capsule vs. static map via `three-mesh-bvh` | Simple, fast, deterministic enough; no full physics engine needed |
| UI | Plain HTML/CSS overlays + small TS view classes | No framework, per requirement |
| Server | Node 20+, `ws`, `tsx` for dev, `tsc` for build | Minimal |
| Collision on server | Same `three-mesh-bvh` + map geometry module (three.js runs fine headless) | Same collision code on both sides |
| Lint/format | ESLint + Prettier | Conventions |
| Tests | Vitest (shared logic: weapons, damage, room rules, movement) | Lightweight |
| Monorepo | npm workspaces (`client`, `server`, `shared`) | No extra tooling |

---

## 3. Folder structure

```
shared/src/
  protocol.ts        # All message types (ClientMessage / ServerMessage discriminated unions)
  constants.ts       # TICK_RATE, PLAYER_SPEED, GRAVITY, BUY_WINDOW_SECONDS=10, etc.
  weapons.ts         # WeaponId + stats table (single source of truth)
  types.ts           # PlayerState, RoomSettings, RoomSummary, GameMode, MapId, Team
  movement.ts        # Pure function: applyInput(state, input, dt, collider) → state (used by client prediction + server)
  maps/              # Map definitions as data: boxes/brushes, spawn points, materials, light positions
    dust2.ts
    shipment.ts

server/src/
  index.ts           # HTTP + WebSocket server bootstrap, health endpoint
  connection.ts      # Per-socket handling, message parsing/validation
  lobby.ts           # Room registry: create, list, join, leave
  room.ts            # Room: settings, players, host, state machine (LOBBY → PLAYING → LOBBY)
  match.ts           # Match simulation: tick loop, spawning, combat, scoring, timer
  combat.ts          # Hitscan raycast, lag compensation, damage, headshot detection
  history.ts         # Ring buffer of past player hitbox positions (for rewind)
  spawns.ts          # Spawn point selection (away from enemies)
  validation.ts      # Validate incoming messages (zod or hand-written guards)

client/src/
  main.ts            # Entry: create App
  app.ts             # Screen router: NameScreen → RoomListScreen → LobbyScreen → GameScreen
  net/
    socket.ts        # WebSocket wrapper with typed send/on, reconnect
  screens/           # Plain DOM screens (each: mount(), unmount())
    nameScreen.ts
    roomListScreen.ts
    createRoomDialog.ts
    lobbyScreen.ts
    gameScreen.ts
  game/
    game.ts          # Owns renderer, scene, loop; wires subsystems
    renderer.ts      # WebGLRenderer + post-processing composer setup
    lighting.ts      # Sun, sky, environment map, shadow setup per map
    mapBuilder.ts    # Builds meshes + BVH collider from shared map data
    input.ts         # Keyboard/mouse state, pointer lock, key bindings
    localPlayer.ts   # Prediction, reconciliation, camera, ADS, sprint, crouch
    remotePlayers.ts # Interpolated remote player models
    weapons/
      weaponView.ts  # First-person viewmodel, sway, bob, recoil animation
      weaponController.ts # Fire rate, ammo, reload, ADS, sends fire events
    effects/
      muzzleFlash.ts
      tracers.ts
      impacts.ts     # Bullet holes/decals, sparks, dust
      bloodBurst.ts  # Headshot red cloud particle effect
    audio.ts         # Positional audio (THREE.PositionalAudio)
  ui/
    hud.ts           # Health, ammo, crosshair, killfeed, timer, score
    buyMenu.ts       # B menu
    scoreboard.ts    # TAB
    headshotBanner.ts
    hitmarker.ts
  styles/
    main.css
  assets/            # models (glTF), textures, sounds, HDRI
```

Conventions: one responsibility per file, named exports, no default exports, `camelCase` files, `PascalCase` classes, constants in `UPPER_SNAKE_CASE`, no `any`. Keep functions short; prefer pure functions in `shared/`.

---

## 4. User flow

1. **Name screen** — single input "Your name" (2–16 chars, trimmed, sanitized). Stored in `localStorage` for convenience. No accounts.
2. **Room list** — table of public rooms: name, map, mode, players `x/max`, status (Lobby / In game). Buttons: *Refresh* (also auto-refresh every 3 s), *Create room*, *Join*. Joining by invite link skips this screen.
3. **Create room dialog** (creator becomes **host**):
   - Room name
   - Map: Dust2 / Shipment
   - Mode: Team Deathmatch / Deathmatch
   - **Private** toggle (private rooms are hidden from the list; join only via invite link)
   - **Player health** (e.g. 50 / 100 / 150 / 200; default 100)
   - **Allowed weapons** (checkbox per weapon; at least one required)
   - Max players (2–12), score limit, time limit (sensible defaults: TDM 75 kills / 10 min, DM 30 kills / 10 min)
4. **Lobby (waiting room)** — player list (with teams in TDM, players may switch team), settings summary, **invite link** with *Copy* button (`https://<vercel-app>/?room=<roomId>`).
   - Host sees: *Start game*, *Edit settings*, *Close room*.
   - Others see: *Leave room*.
   - If host leaves, host passes to the longest-connected player.
5. **Match** — see section 6.
6. **End of match** — final scoreboard for ~10 s, then everyone returns to the **same lobby**. Host can start again or quit.

Invite link handling: on load, if `?room=` exists, after the name screen the client joins that room directly. Room IDs are random, unguessable (e.g. 10-char nanoid) so private rooms stay private.

---

## 5. Network protocol (shared/src/protocol.ts)

Discriminated unions on `type`. Examples:

**Client → Server**
- `hello { name }`
- `listRooms`
- `createRoom { settings }`
- `joinRoom { roomId }` / `leaveRoom`
- `updateSettings { settings }` (host only, lobby only)
- `switchTeam { team }`
- `startMatch` (host only)
- `input { seq, dt, moveX, moveZ, yaw, pitch, jump, crouch, sprint, ads }` — sent every client frame (batched at ~60 Hz)
- `fire { seq, weaponId, origin, direction, clientTime }`
- `reload`
- `buyWeapon { weaponId }` (only valid within buy window)
- `ping { t }`

**Server → Client**
- `welcome { playerId }`
- `roomList { rooms: RoomSummary[] }`
- `roomState { room }` (lobby snapshot: players, teams, settings, host)
- `matchStart { map, mode, settings, spawn }`
- `snapshot { serverTime, lastProcessedInput, players: [{ id, pos, yaw, pitch, crouch, weaponId, alive }] }`
- `hit { attackerId, victimId, damage, headshot }` (to attacker for hitmarker, to victim for damage indicator)
- `kill { killerId, victimId, weaponId, headshot }` (broadcast → killfeed, headshot effects)
- `spawn { playerId, pos, buyWindowEndsAt }`
- `scores { ... }`
- `matchEnd { finalScores, winner }`
- `error { message }`
- `pong { t }`

Every incoming message is validated on the server (type, ranges, rate limits). Never trust client positions or damage.

---

## 6. Gameplay (MW2019 feel)

### Movement (shared `movement.ts`, identical on client and server)
- WASD move, mouse look (pointer lock), **Shift** sprint (hold; cannot fire while sprinting; short sprint-to-fire delay), **Space** jump, **C / Ctrl** crouch (toggle), optional slide when crouching during sprint (phase 8 nice-to-have).
- Speeds approx.: walk 5.0 m/s, sprint 7.5 m/s, crouch 2.5 m/s, ADS 3.0 m/s. Gravity 20 m/s², jump velocity ~6 m/s.
- Acceleration/friction for weighty feel (not instant stop).
- Capsule collider (radius 0.35 m, height 1.8 m standing / 1.2 m crouched), collision against map BVH, step-up for small ledges.
- Weapons modify movement speed (AWP slower, Deagle faster).

### Controls (CoD defaults)
| Key | Action |
|---|---|
| Mouse | Look |
| LMB | Fire |
| RMB | Aim down sights (hold) |
| R | Reload |
| Shift | Sprint |
| Space | Jump |
| C / Ctrl | Crouch |
| 1 / 2 / scroll | Primary / secondary (Desert Eagle is secondary) |
| B | Buy menu (only first 10 s after spawn) |
| Tab | Scoreboard (hold) |
| Esc | Release mouse / pause overlay (settings: sensitivity, FOV, volume, leave match) |

### Weapons (shared/src/weapons.ts — single stats table)
All damage values are **body** damage at default 100 HP; limbs ×0.85. **Headshot from any weapon = instant kill** regardless of configured health (implemented as `damage = Infinity` on head hitbox).

| Weapon | Slot | Fire mode | RPM | Body dmg | Mag | Reload | Spread hip/ADS | Notes |
|---|---|---|---|---|---|---|---|---|
| AK-47 | Primary | Auto | 600 | 34 | 30 | 2.5 s | med / low | Strong vertical recoil |
| M4A4 | Primary | Auto | 750 | 28 | 30 | 2.2 s | med / very low | Controllable recoil |
| AWP | Primary | Bolt | 41 | 115 (one-shot body at 100 HP) | 5 | 3.6 s | huge / zero (scoped) | Scope overlay, 4× zoom, slow ADS |
| Shotgun | Primary | Pump | 70 | 9 pellets × 20, falloff | 8 | per-shell 0.5 s | wide cone | Damage falloff 5–15 m |
| Desert Eagle | Secondary | Semi | 220 | 55 | 7 | 2.0 s | med / low | Heavy kick |

- Damage falloff by range for all except AWP.
- Recoil: deterministic pattern per weapon + small random; camera kick + recovery (CoD style), viewmodel kick.
- ADS: FOV zoom (e.g. 80 → 60, AWP → 20 with scope overlay), lower spread, slower movement, ADS time per weapon.
- Ammo: reserve ammo = 3 mags; refill on respawn.
- Only weapons allowed in room settings are shown/buyable; server rejects disallowed weapons.
- Default loadout on spawn: first allowed primary + Desert Eagle if allowed.

### Buy menu (B)
- Available for **10 s after each spawn** (`BUY_WINDOW_SECONDS = 10`); countdown shown in HUD ("Press B to change weapon — 7s").
- DOM overlay with weapon cards (icon, name, key stats bars). Click or press number keys. Free (no economy) — it's a loadout picker.
- Server enforces the window using `buyWindowEndsAt`.

### Hit detection & hitboxes
- Server-side hitscan raycast against simplified hitboxes per player: **head (sphere)**, torso (box/capsule), limbs (capsules).
- Lag compensation: server stores 1 s of hitbox history; rewinds to `clientTime - interpolationDelay` (clamped to max 200 ms).
- Walls block shots (raycast vs map BVH first). No wall penetration (keep simple).
- Client shows immediate local effects (muzzle flash, tracer, impact) but **hit markers/kills only come from server**.

### Modes
- **Team Deathmatch**: two teams (e.g. "Allies" blue / "Coalition" red), auto-balance on join, team spawns, friendly fire OFF, first team to score limit or most kills at time limit wins.
- **Deathmatch**: free-for-all, spawn away from enemies, first to score limit wins; top 3 shown at end.
- Respawn after 3 s (death cam looking at killer), 2 s spawn protection (cancelled when firing).

### Scoreboard (Tab)
Hold Tab → overlay: per team (or single list in DM) — name, kills, deaths, K/D, headshots, ping; local player highlighted; match timer and score at top.

### HUD
Crosshair (dynamic spread, hidden in ADS), ammo `mag / reserve`, health bar with red screen-edge vignette when damaged and regen after 5 s without damage (MW2019 style), killfeed (top-right, headshot icon), score/timer (top), damage direction indicators, hitmarker (white; red X on kill), minimap (optional, later phase).

### Headshot kill effect
When the local player gets a headshot kill:
1. **"HEADSHOT" banner**: large, center-upper screen, bold condensed font, red/white with glow. CSS animation: scale from 2.5 → 1 with overshoot, slight rotation shake, chromatic split flash, then fade/slide out after ~1.2 s. Combo counter if multiple in a row ("HEADSHOT ×2").
2. Distinct sound (sharp "ding" + crunch).
3. **Red mist burst** visible to everyone at the victim's head: GPU particle system (`THREE.Points` or instanced sprites with soft red smoke texture) — ~150–250 particles, outward velocity cone, gravity + drag, size grows, opacity fades over ~1.5 s, a few heavier droplets that fall and leave **blood decals** on nearby surfaces. Lit by scene (use a lit sprite material or fake lighting by tinting with sun intensity).
4. Slight camera punch + brief slow time scale on the killcam for the victim (optional).

---

## 7. Realistic lighting & rendering

Goal: as close to modern AAA look as three.js allows while staying at 60 FPS on a mid-range GPU.

- **Renderer**: `WebGLRenderer` with `antialias: false` (AA done in post), `outputColorSpace = SRGBColorSpace`, `toneMapping = ACESFilmicToneMapping` (or AgX), tuned exposure per map, physically correct lights (default in current three).
- **Materials**: `MeshStandardMaterial` / `MeshPhysicalMaterial` with full PBR texture sets (albedo, normal, roughness, metalness, AO) from CC0 sources (ambientCG, Poly Haven). Use KTX2/Basis compressed textures for size.
- **Image-based lighting**: HDRI sky per map (Poly Haven: sunny desert for Dust2; overcast/dusk harbor for Shipment) loaded with `RGBELoader` → `PMREMGenerator` → `scene.environment`. Also used as visible sky background.
- **Sun**: `DirectionalLight` aligned with HDRI sun direction, **Cascaded Shadow Maps** (`three/examples/jsm/csm/CSM`) — 3–4 cascades, 2048 maps, PCF soft shadows, tuned bias/normalBias.
- **Baked lighting** (biggest realism win): bake ambient occlusion + indirect bounce into lightmaps in Blender for static map geometry; apply via `aoMap`/`lightMap` (uv2). Dynamic objects (players, weapons) get IBL + sun + shadows.
- **Light probes**: a few `LightProbe`s (or irradiance volume) baked from the map so players darken correctly in interiors/tunnels.
- **Post-processing** (pmndrs `postprocessing`):
  - **N8AO** (screen-space ambient occlusion)
  - **Bloom** (selective, low intensity – muzzle flashes, sun glints)
  - **SMAA** anti-aliasing
  - Subtle **vignette**, **chromatic aberration** on damage, **film grain** (low)
  - Optional: SSR on wet/metal surfaces for Shipment (quality setting "Ultra")
  - Optional: volumetric god rays from sun (Dust2 tunnels), fog (`FogExp2`) for depth/haze.
- **Muzzle flash** = short-lived `PointLight` (pooled, max 4 active) + additive flash sprite.
- **Viewmodel**: rendered in a second pass / separate scene with its own camera (narrower FOV) so the gun never clips walls; still receives IBL.
- **Graphics quality settings**: Low / Medium / High / Ultra toggling shadow resolution, cascades, AO, bloom, pixel ratio, anisotropy.

---

## 8. Maps

> Legal note: "Dust2" and "Shipment" are maps owned by Valve and Activision. Recreate **layouts inspired by them** using your own geometry and CC0 textures — do **not** rip original game assets. Name them in-game e.g. "Dust" and "Shipment" or keep names for private use only.

Approach: build maps in **Blender** (blockout → detail → bake lightmaps), export as **glTF (.glb)** with a separate low-poly **collision mesh** and **empties for spawn points** (named `spawn_A_01`, `spawn_B_01`, `spawn_ffa_01`). Claude Code can generate an initial **procedural blockout in TypeScript** from box data (`shared/maps/*.ts`) so the game is playable before art exists; the glTF replaces visuals later while the server keeps using the simple collision data.

### Dust2-style (large, 6–12 players)
- Desert town, sandstone walls, wooden doors, crates, arches.
- Layout areas: T spawn, CT spawn, Long A (with doors and pit), A site (ramp, goose), Short A / Catwalk, Mid (doors, xbox), B tunnels (upper/lower), B site (platform, window, car).
- Lighting: harsh midday sun, strong warm shadows, high exposure, blue sky HDRI, light dusty haze.
- TDM spawns: Team A ↔ T side, Team B ↔ CT side. DM: ~24 spawns spread across map.

### Shipment-style (tiny, chaotic, 2–12 players)
- ~40 × 40 m square, grid of shipping containers (3×3 layout) with gaps, some stacked containers on edges, cargo nets, crates; surrounded by high container walls.
- Lighting: overcast/dusk harbor HDRI, cooler tones, sodium/floodlights (a few shadow-less spot lights + baked), wet metal (higher reflectance).
- Spawn logic is critical: pick spawn farthest from all enemies' line of sight.

---

## 9. Assets (all free/CC0 or self-made)

- **Weapons**: CC0/CC-BY low-poly-to-mid-poly glTF models (Sketchfab with permissive license, Quaternius, or self-modeled). Each with viewmodel arms + world model.
- **Player character**: one rigged soldier glTF (e.g. Mixamo character + animations: idle, run, crouch, aim, death) recolored per team.
- **Animations**: three.js `AnimationMixer`, upper/lower body blend (legs run, torso aims with pitch).
- **Sounds**: freesound.org (CC0) — per-weapon fire (near/far), reload, footsteps per surface, hitmarker, headshot, kill confirm. Positional audio for remote players.
- **Textures/HDRIs**: ambientCG, Poly Haven.
- Placeholder assets first (colored boxes/capsules, procedural sounds) so gameplay is never blocked on art. Keep a `client/src/assets/CREDITS.md` with licenses.

---

## 10. Server design details

- **Room state machine**: `LOBBY → PLAYING → ENDED → LOBBY`.
- **Lobby registry**: `Map<roomId, Room>`; empty rooms deleted after 30 s; `listRooms` returns only public rooms.
- **Match loop** (`setInterval` at 30 Hz, using measured delta):
  1. Apply queued inputs per player using `shared/movement.ts` (clamp dt, reject impossible values).
  2. Process fire events (rate-limited by weapon RPM, ammo tracked on server).
  3. Store hitbox history.
  4. Handle deaths, respawns, health regen, spawn protection, buy windows.
  5. Check win conditions / timer.
  6. Broadcast snapshot every other tick... (20 Hz) to players in the room.
- **Anti-cheat basics**: server-side ammo/fire rate/movement speed, buy window, weapon whitelist; max name length; message rate limits; ignore malformed messages.
- **Health endpoint** `GET /health` for the host platform.
- **CORS/origin check**: accept WebSocket only from configured `ALLOWED_ORIGIN` (Vercel domain + localhost).
- Config via env: `PORT`, `ALLOWED_ORIGIN`.

---

## 11. Implementation phases

Each phase: implement → lint → tests → manual check in browser. Keep commits small.

**Phase 0 — Setup**
npm workspaces, TS configs (strict), ESLint/Prettier, Vite client, `tsx` server dev, shared package import working in both, `npm run dev` runs both concurrently.

**Phase 1 — Offline movement sandbox**
Renderer, input + pointer lock, procedural Shipment blockout, BVH collision, capsule movement (walk, sprint, crouch, jump), basic lighting.

**Phase 2 — Rooms & lobby (no gameplay)**
Name screen, socket wrapper, room list, create room dialog with all settings, lobby, invite link, host controls, private rooms, host migration, return to lobby.

**Phase 3 — Networked movement**
Server match loop, input messages, snapshots, client prediction + reconciliation, remote player interpolation with placeholder capsules.

**Phase 4 — Weapons & combat**
Weapon stats table, viewmodel (placeholder), firing, recoil, ADS, reload, server hitscan with hitboxes + lag compensation, damage, health regen, death, respawn, killfeed, hitmarkers, headshot = instant kill.

**Phase 5 — Modes, scoring, UI**
TDM + DM rules, teams, spawn selection, scoreboard (Tab), match timer, score limit, end screen → back to lobby, buy menu (B, 10 s window), weapon whitelist enforcement, configured health.

**Phase 6 — Headshot spectacle & effects**
HEADSHOT banner animation, blood mist particle burst + decals, muzzle flash lights, tracers, impact decals/particles, damage vignette, audio (positional).

**Phase 7 — Realistic rendering**
HDRI IBL, CSM shadows, PBR textures, post-processing stack (N8AO, bloom, SMAA, etc.), tone mapping tuning, graphics quality settings, separate viewmodel pass.

**Phase 8 — Maps & art**
Dust2-style full layout, Shipment final, glTF maps with baked lightmaps, character model + animations, weapon models, sounds. Optional: slide, minimap.

**Phase 9 — Polish & deploy**
Performance pass (instancing, texture compression, draw-call budget < 300, 60 FPS target), settings menu (sensitivity, FOV, volume, quality, saved in localStorage), reconnect handling, deployment configs + README.

---

## 12. Testing

- **Unit (Vitest)**: weapon damage/falloff, headshot = kill, movement step function, spawn selection, room rules (host-only actions, private rooms hidden, buy window, whitelist).
- **Integration**: spin up server in test, connect 2 fake clients via `ws`, create/join room, start match, simulate a fire event → assert `kill` message.
- **Manual**: two browser windows locally; Chrome DevTools network throttling to test 100–200 ms latency.

---

## 13. Deployment (you do this manually)

### Server → Railway (example)
1. Push repo to GitHub.
2. Railway → New Project → Deploy from GitHub → set **root directory** `server` (or use workspace build command).
3. Build: `npm install && npm run build -w shared && npm run build -w server`; Start: `npm run start -w server`.
4. Env vars: `ALLOWED_ORIGIN=https://<your-app>.vercel.app`. Railway sets `PORT`.
5. Copy the public URL, e.g. `wss://mp-fps-server.up.railway.app`.

### Client → Vercel
1. Vercel → Add New Project → import the same GitHub repo.
2. **Root Directory**: `client`. Framework preset: **Vite**. Build: `npm run build`, Output: `dist`.
3. Env var: `VITE_SERVER_URL=wss://mp-fps-server.up.railway.app`.
4. Deploy. `client/vercel.json` rewrites all paths to `index.html` so invite links work.
5. Update `ALLOWED_ORIGIN` on the server if the Vercel domain changes.

A `README.md` with these exact steps plus local dev instructions (`npm install`, `npm run dev`) will be produced in Phase 9.

---

## 14. Known limits / honest expectations

- three.js in a browser can look very good (PBR + IBL + baked light + CSM + AO), but not at MW2019's level of fidelity; expect "high-quality indie" visuals.
- High-quality art (maps, weapon models, animations) is the largest effort and is mostly outside what code alone can produce; the plan keeps the game fully playable with placeholders and swaps art in later.
- JSON over WebSocket and a single server region are fine for friends-and-small-groups play; players far from the server region will feel latency.
