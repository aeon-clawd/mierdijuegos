# Mierdijuegos - Daily Game Generation Instructions

You are generating a new game for mierdijuegos.com.

## Step 1: Check existing games
Read `/home/ubuntu/clawd/mierdijuegos/public/games/games.json` to see all existing games and their mechanics. You MUST NOT repeat any mechanic that already exists.

## Step 2: Invent a revolutionary mechanic
The game MUST have a mechanic that feels genuinely novel. Think beyond standard game genres. Examples of the kind of innovation expected:
- A game controlled by tilting the phone (DeviceOrientation API)
- A game where the rules change every 10 seconds
- A game where you draw the level as you play
- A game where sound/microphone input matters
- A game where two fingers do opposite things
- A game where the UI lies to you
- A game where gravity depends on screen color
- A game where you play in reverse (start at the end)
- A game where the map is your real clock time

DO NOT use: standard platformers, match-3, flappy bird clones, basic shooters, or any vanilla genre without a radical twist.

## Step 3: Generate the game
Create a SINGLE HTML file at `/home/ubuntu/clawd/mierdijuegos/public/games/{id}/index.html` where id is `{number}-{slug}` (e.g., `005-nombre-del-juego`).

Requirements:
- **Single HTML file** — all CSS and JS inline, no external dependencies
- **Mobile-first** — touch controls, responsive, `user-scalable=no`
- **Visual style** — dark background (#0a0a0a), neon colors (green #00ff41, magenta #ff00ff, cyan #00ffff, yellow #ffff00, red #ff0040)
- **Start screen** — title, description of the mechanic, play button
- **Game over screen** — score, funny message in Spanish, retry button, link back to "/" (más mierdijuegos)
- **UI** — score display, any relevant status info
- **Canvas-based** — use HTML5 Canvas for rendering
- **Performant** — 60fps on mobile, no memory leaks
- **Fun** — it should be playable and interesting for at least 30 seconds
- **Sound** — optional but appreciated (Web Audio API, no external files)
- **Language** — UI text in Spanish

## Step 4: Update games.json
Add the new game entry to `/home/ubuntu/clawd/mierdijuegos/public/games/games.json`. The entry must have:
```json
{
  "id": "005-slug-name",
  "title": "Nombre Del Juego",
  "date": "YYYY-MM-DD",  // today's date
  "description": "One-liner describing the mechanic in Spanish",
  "mechanic": "Short mechanic label",
  "emoji": "🎮"  // pick a relevant emoji
}
```

## Step 5: Build and deploy
```bash
cd /home/ubuntu/clawd/mierdijuegos
npx astro build
git add -A
git commit -m "🎮 New game: {title}"
npx vercel --yes --prod
git push -q
```

## Step 6: Verify
Check that the Vercel deployment succeeded (look for "Aliased:" in output).

## IMPORTANT RULES
- NEVER repeat a mechanic from games.json
- The game MUST work on mobile (touch controls)
- The game MUST be playable (not broken)
- Keep it under 15KB per HTML file
- Today's date for the JSON entry
- Test that `npx astro build` succeeds before deploying
