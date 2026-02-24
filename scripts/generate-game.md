# Mierdijuegos - Daily Game Generation Instructions

You are generating a new game for mierdijuegos.com.

## Step 1: Check existing games
Read `/home/ubuntu/clawd/mierdijuegos/public/games/games.json` to see all existing games and their mechanics. You MUST NOT repeat any mechanic that already exists.

## Step 1.5: Use Wolfram for physics/math (RECOMMENDED)
Before designing the mechanic, use Wolfram to compute real mathematical or physical phenomena that can power the game. This makes games more unique and grounded in real science.

**How to use Wolfram:**
```bash
# Get context/ideas for a mathematical phenomenon
bash /home/ubuntu/clawd/skills/wolfram/wolfram.sh context "interesting math phenomena for games"

# Query WolframAlpha for data
bash /home/ubuntu/clawd/skills/wolfram/wolfram.sh alpha "Lorenz attractor parameters"

# Compute actual equations/trajectories with Wolfram Language
bash /home/ubuntu/clawd/skills/wolfram/wolfram.sh eval 'NDSolve[{x'\''[t]==-10(x[t]-y[t]), ...}, {x,y,z}, {t,0,50}]'
```

**Examples of Wolfram-powered mechanics (across ALL domains):**

🔬 **Physics/Math:**
- Three-body gravitational problem (real orbital equations)
- Strange attractors (Lorenz, Rössler) as game maps
- Double pendulum chaos, wave interference, Mandelbrot zoom

🎵 **Music/Sound:**
- Real musical scales and frequency ratios as gameplay (query: "frequencies of C major scale")
- Chord consonance/dissonance scores to drive difficulty
- Rhythm patterns from mathematical sequences (Fibonacci, prime numbers)

🌍 **Geography/Countries:**
- Real country data (population, area, GDP) as game parameters
- Distance between real cities as level layout
- Flag colors as game palette, country shapes as obstacles

🗣️ **Language/Linguistics:**
- Word frequency data as scoring
- Phoneme similarities between languages as matching mechanics
- Unicode character properties as gameplay elements

🎨 **Color/Visual:**
- Color theory computations (complementary, analogous, triadic)
- Wavelength-to-color mapping as mechanic
- Color blindness simulation as difficulty modifier

🧬 **Science/Nature:**
- Chemical element properties (atomic radius, electronegativity) as game parameters
- DNA codon tables as puzzle mechanics
- Planet data (real orbital periods, sizes) for space games
- Animal speeds, lifespans, populations as game scaling

📊 **Data/Statistics:**
- Real statistical distributions (normal, Poisson) for enemy spawning
- Probability calculations for risk/reward mechanics
- Real financial data patterns as level generation

🕰️ **History/Time:**
- Historical dates and events as trivia-action hybrid
- Calendar computations (moon phases, equinoxes) as game cycles

🍕 **Food/Nutrition:**
- Caloric values, nutrient data as resource management
- Recipe ingredient ratios as crafting mechanics

**Use Wolfram to:**
1. Query REAL DATA from any domain to power game mechanics
2. Compute mathematical relationships that make gameplay feel grounded
3. Generate parameters that are surprising because they're TRUE
4. Make games that teach something real without feeling educational

The magic: players interact with real-world data without knowing it. A game about "matching colors" is secretly teaching wavelength physics. A game about "feeding creatures" uses real nutritional data. This is what makes mierdijuegos unique.

ALWAYS try to use Wolfram for at least one aspect of the game — even if it's just calibrating spawn rates with a real probability distribution or using real planet sizes for difficulty scaling.

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
- A game based on REAL physics computed by Wolfram (three-body, attractors, wave equations)
- A game where Mandelbrot zoom depth IS the difficulty
- A game using real electromagnetic field equations

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
