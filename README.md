# Threejs multiplayer FPS

A first-person shooter for the browser, inspired by the gameplay of Call of Duty: Modern Warfare (2019).
It is built with **three.js + TypeScript**, without any UI framework, and has a **Node.js** game server.

- Modes: **Team Deathmatch** and **Deathmatch**
- Maps: **MedycynaPraktycznaSunny** (default), **MedycynaPraktycznaKrakoskieCzystePowietrze** (foggy) and **MedycynaPraktycznaNight** — an office street with a playable building in three weathers — plus **Shipment** (tiny container yard)
- Weapons: AK-47, M4A4, Sniper, Shotgun, Desert Eagle. **Headshots kill in one shot** (the M4A4 needs two).
- Rooms: create (public/private, invite link, player health, allowed weapons, score/time limit), browse, join, and a lobby where the host starts the match
- No accounts: players just type a name

👉 **To play locally, see [LOCALRUN.md](LOCALRUN.md).**

## Project structure

```
shared/   Code used by both sides: types, network protocol, weapon stats, maps, movement physics, hitboxes
server/   Node.js WebSocket game server (authoritative simulation)
client/   Browser game (Vite + three.js, plain DOM UI)
```

| Area | Where |
|---|---|
| Network messages | `shared/src/protocol.ts` |
| Weapon stats (damage, RPM, recoil…) | `shared/src/weapons.ts` |
| Maps (ASCII grids, easy to edit) | `shared/src/maps/dust2.ts`, `shared/src/maps/shipment.ts` |
| Movement physics (client prediction = server) | `shared/src/movement.ts` |
| Rooms / lobby | `server/src/room.ts`, `server/src/lobby.ts` |
| Match simulation, scoring, respawns | `server/src/match.ts` |
| Hit detection + lag compensation | `server/src/combat.ts`, `server/src/history.ts` |
| Screens (name, room list, lobby) | `client/src/screens/` |
| Game loop and wiring | `client/src/game/game.ts` |
| Lighting & post-processing | `client/src/game/lighting.ts`, `client/src/game/renderer.ts` |
| HUD, buy menu, scoreboard, headshot banner | `client/src/ui/` |

## How it works (short)

- The **server is authoritative**. It runs at 30 ticks per second, moves players with the shared movement code, checks fire rate and ammo, does the hit detection, and keeps the score.
- The **client predicts** your own movement instantly, then corrects it smoothly when the server's state arrives (reconciliation).
- **Other players** are drawn 100 ms in the past and interpolated between snapshots, so they move smoothly.
- **Lag compensation:** when you shoot, the server rewinds other players to where you saw them (up to 250 ms).
- **Rendering:** physically based materials, an analytic sky baked into an environment map (image-based lighting), soft sun shadows, hemisphere bounce light, fog, and post-processing: GTAO ambient occlusion, bloom, ACES tone mapping and SMAA. Graphics quality presets are low, medium, high and ultra.
- **No asset downloads:** textures, weapon and soldier models, and all sounds are generated in code. This keeps the project self-contained. Real art can be swapped in later (see PLAN.md, phase 8).

## Deployment

The **client** goes on **Vercel** (a static site). The **server** needs a host that keeps a Node process and WebSockets running, e.g. **Railway**. Vercel cannot host the game server.

### 1. Push to GitHub

```bash
git init && git add . && git commit -m "Initial commit"
# create an empty repo on GitHub, then:
git remote add origin https://github.com/<you>/mp-fps.git
git push -u origin main
```

### 2. Server → Railway

1. https://railway.app → **New Project** → **Deploy from GitHub repo** → pick the repo.
2. Keep the root directory as the repo root. Railway runs `npm install` and then `npm start`, which starts the server.
3. Under **Settings → Networking**, click **Generate Domain**. You get something like `mp-fps-production.up.railway.app`.
4. Under **Variables**, add `ALLOWED_ORIGIN=https://<your-vercel-app>.vercel.app` (fill it in after step 3 below; comma-separate multiple origins).
   Railway sets `PORT` automatically.
5. Check `https://<railway-domain>/health`. It should return `{"ok":true,...}`.

### 3. Client → Vercel

1. https://vercel.com → **Add New… → Project** → import the same repo.
2. Keep **Root Directory** as the repo root. The included `vercel.json` already sets the build (`npm run build`) and the output (`client/dist`).
3. Under **Environment Variables**, add `VITE_SERVER_URL=wss://<railway-domain>` (note **wss://**).
4. Click **Deploy**. Then put the final Vercel URL into Railway's `ALLOWED_ORIGIN` (step 2.4). Railway redeploys by itself.

Invite links use the Vercel domain automatically (`https://<app>.vercel.app/?room=<id>`).

## Differences from PLAN.md (chosen for simplicity)

- **Collision:** custom axis-aligned box collision in `shared/movement.ts` instead of `three-mesh-bvh`. All maps are made of boxes, so this is simpler and runs identically on the server without three.js.
- **Post-processing:** three.js's built-in passes (GTAO, Unreal bloom, SMAA, OutputPass) instead of the `postprocessing` package, so there is one fewer dependency.
- **Shadows:** one high-resolution sun shadow map that follows the player and is snapped to texels, instead of cascaded shadow maps. This is much simpler, and the coverage is enough for these map sizes.
- **Assets:** procedural textures, models and synthesized audio instead of downloaded CC0 files (no licensing or download steps).
- **Snapshots:** sent every server tick (30 Hz) instead of 20 Hz.
- **Crouch:** on C only (Ctrl+W would close the browser tab).
- **Default server port:** 3456 (3001 is often taken by other dev servers).
