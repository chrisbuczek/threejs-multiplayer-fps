# Running and testing locally

You don't need Vercel or Railway to play. Everything runs on your own computer.

## 1. Requirements

- **Node.js 20 or newer.** Check with `node -v`. Download it from https://nodejs.org if needed.
- A desktop browser with WebGL 2 (Chrome, Edge or Firefox). A mouse is recommended.

## 2. Install (first time only)

Open a terminal in the project folder (`mp-fps/`) and run:

```bash
npm install
```

## 3. Start the game

```bash
npm run dev
```

This starts two things at once:

| Part | Address | What it is |
|---|---|---|
| `[server]` | `ws://localhost:3456` | Node.js game server (rooms, simulation, hits) |
| `[client]` | http://localhost:5173 | The game in the browser (Vite dev server) |

Wait until you see `Game server listening on port 3456` and the `Local: http://localhost:5173/` line.
Leave this terminal open. Press `Ctrl+C` to stop both.

## 4. Test with two players in two browser windows

1. Open **http://localhost:5173** in a first window.
2. Open **http://localhost:5173** in a **second window**. The easiest options:
   - a private/incognito window of the same browser (`Ctrl+Shift+N` in Chrome, `Cmd+Shift+N` on Mac), or
   - a different browser (e.g. Chrome + Firefox).

   Put the two windows **side by side** so both stay visible. Browsers pause games in hidden or minimized windows.
3. **Window 1:** type a name (e.g. `Alice`) → **Play** → **Create room**.
   Pick the map, mode, health and allowed weapons, then click **Create room**. You are now the host in the lobby.
4. **Window 2:** type another name (e.g. `Bob`) → **Play**. The room shows up in the list (refreshes every 3 s) → **Join**.
   - For a **private** room: in window 1 click **Copy invite link** and open that link in window 2 (or paste it into the "Paste invite link or room code" box).
5. **Window 1 (host):** click **Start game**. Both windows load the match.
6. **Click inside a window** to capture the mouse and play. Only the window you clicked receives your keyboard and mouse.
   To switch to the other player, press **Esc** (this releases the mouse), then click into the other window.

### Things to try

| Test | How |
|---|---|
| Movement | WASD, Shift sprint, Space jump, C crouch (toggle) |
| Shooting | Left mouse = fire, right mouse (hold) = aim down sights, R = reload |
| Switch weapon | 1 / 2 or the mouse wheel |
| Buy menu | Press **B** within **10 seconds** after (re)spawning. Pick with 1–5 or a click |
| Scoreboard | Hold **Tab** |
| Headshot | Aim at the other player's head. Any weapon kills in one shot, a big **HEADSHOT** banner appears, and a red mist cloud bursts from the head |
| AWP scope | Buy the AWP (B → 3) and hold right mouse |
| Respawn | After a kill, the victim watches a death cam for 3 s, then respawns |
| End of match | Create a room with **Time limit = 1** (or a low score limit) to quickly reach the end screen. Everyone returns to the lobby after ~10 s. The host can start again or leave |
| Settings | Esc → sensitivity, FOV, volume, graphics quality (quality applies from the next match) |

Tip: to land a headshot without a second person, move window 2's player so it stands still in view
(walk it into the open, press Esc), then switch to window 1 and shoot it.

## 5. Play with other devices on your network (optional)

The `[client]` line also prints a `Network:` address, e.g. `http://192.168.0.32:5173`.
Other computers on the same Wi-Fi can open it. The client automatically connects to the game server on the same host (port 3456).
If it doesn't connect, allow Node.js through your firewall.

## 6. Run the automated checks

```bash
npm test          # unit + integration tests (movement, maps, weapons, rooms, combat)
npm run typecheck # TypeScript in all three packages
npm run lint      # ESLint
```

## 7. Try the production build locally (optional)

This is the same output that Vercel will serve:

```bash
npm run build                 # builds client/dist
npm start                     # terminal 1: game server
npm run preview -w client     # terminal 2: serves client/dist on http://localhost:4173
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `EADDRINUSE ... 3456` | Something else uses the port. Run `PORT=4000 npm run dev -w server` and the client with `VITE_SERVER_URL=ws://localhost:4000 npm run dev -w client` (two terminals). |
| "Cannot reach the game server" | The server isn't running. Check the `[server]` lines in the terminal. |
| Mouse doesn't move the view | Click inside the game. The pause menu must disappear. |
| Low FPS | Esc → Graphics → `medium` or `low`, then start a new match. |
| One window freezes | That window is hidden or minimized. Keep both visible side by side. |
| Ctrl doesn't crouch | On purpose: Ctrl+W would close the browser tab. Use **C**. |
