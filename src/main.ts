
/// <reference types="vite/client" />
import "./style.css";
import "./home";
import { awardLevelReward, walletBalance } from "./wallet";

type Direction = 0 | 1 | 2 | 3;
type Point = { x: number; y: number };
type Mirror = Point & { slash: boolean; required: boolean };
type Special = Point & {
  kind: "splitter" | "filter" | "gate" | "switch" | "teleporter";
  pair?: Point;
  color?: string;
};
type BeamPoint = Point & { color: string };

const SIZE = 7;
const canvas = document.querySelector<HTMLCanvasElement>("#gameCanvas")!;
const ctx = canvas.getContext("2d")!;
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

function readStoredNumber(key: string, fallback = 0): number {
  const raw = localStorage.getItem(key);
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

const worldBands = [
  { name: "WORLD 1 · FIRST LIGHT", start: 1, end: 20, tag: "Learn the beam" },
  { name: "WORLD 2 · COLOR GARDEN", start: 21, end: 40, tag: "Think in colour" },
  { name: "WORLD 3 · PRISM WORKS", start: 41, end: 60, tag: "Split and redirect" },
  { name: "WORLD 4 · THE LOCK", start: 61, end: 80, tag: "Unlock the path" },
  { name: "WORLD 5 · WARP ZONE", start: 81, end: 100, tag: "Master every mechanic" }
];

type WorldTheme = {
  id: string;
  title: string;
  skyA: string;
  skyB: string;
  tileA: string;
  tileB: string;
  accent: string;
  beam: string;
  wall: string;
};

const worldThemes: WorldTheme[] = [
  { id: "first-light", title: "FIRST LIGHT", skyA: "#102b55", skyB: "#071326", tileA: "#183c69", tileB: "#10294c", accent: "#63dfff", beam: "#62efff", wall: "#547da5" },
  { id: "color-garden", title: "COLOR GARDEN", skyA: "#48205b", skyB: "#111b3e", tileA: "#35244f", tileB: "#202c4c", accent: "#ff78cf", beam: "#5cf5ee", wall: "#8a578f" },
  { id: "prism-works", title: "PRISM WORKS", skyA: "#07505a", skyB: "#071a2d", tileA: "#12404d", tileB: "#102d3c", accent: "#55ffe0", beam: "#75fff0", wall: "#548b91" },
  { id: "the-lock", title: "THE LOCK", skyA: "#4b1d2b", skyB: "#100e20", tileA: "#382333", tileB: "#241b2c", accent: "#ff765f", beam: "#ffbd70", wall: "#a35b55" },
  { id: "warp-zone", title: "WARP ZONE", skyA: "#33206f", skyB: "#090d28", tileA: "#29245a", tileB: "#171b43", accent: "#b68aff", beam: "#b89aff", wall: "#7762b5" }
];

function getTheme(n: number): WorldTheme {
  return worldThemes[Math.min(4, Math.floor((n - 1) / 20))];
}

function applyWorldTheme(n: number) {
  const theme = getTheme(n);
  document.body.dataset.world = theme.id;
  document.documentElement.style.setProperty("--world-accent", theme.accent);
  document.documentElement.style.setProperty("--world-sky-a", theme.skyA);
  document.documentElement.style.setProperty("--world-sky-b", theme.skyB);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = "#FFF8FF";
  document.title = `LIGHT BENDER · ${theme.title}`;
}


let level = Math.max(1, Math.min(100, readStoredNumber("lb-level", 1)));
let moves = 0;
let solved = false;
let hintVisible = false;
let selectedCell: Point | null = null;
let soundEnabled = localStorage.getItem("lb-sound") !== "off";
let audioContext: AudioContext | null = null;

let mirrors: Mirror[] = [];
let walls: Point[] = [];
let beam: BeamPoint[] = [];
let specials: Special[] = [];
let gateOpen = false;
let teleporterExit: Point | null = null;
let hitTarget = false;

let source: Point = { x: 0, y: 3 };
let target: Point = { x: 6, y: 3 };
const cell = canvas.width / SIZE;

function getWorld(n: number) {
  return worldBands.find(w => n >= w.start && n <= w.end) || worldBands[0];
}

function seeded(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

function difficulty(n: number) {
  if (n <= 10) return { turns: 1, decoys: 0, walls: 0, label: "WARM UP" };
  if (n <= 25) return { turns: 2, decoys: 1, walls: 0, label: "EASY" };
  if (n <= 45) return { turns: 3, decoys: 2, walls: 1, label: "MEDIUM" };
  if (n <= 70) return { turns: 4, decoys: 3, walls: 2, label: "HARD" };
  return { turns: 5, decoys: 4, walls: 3, label: "EXPERT" };
}

function direction(a: Point, b: Point): Direction {
  if (b.x > a.x) return 0;
  if (b.y > a.y) return 1;
  if (b.x < a.x) return 2;
  return 3;
}

function reflect(dir: Direction, slash: boolean): Direction {
  return slash
    ? ([3, 2, 1, 0] as Direction[])[dir]
    : ([1, 0, 3, 2] as Direction[])[dir];
}

function correctMirror(incoming: Direction, outgoing: Direction): boolean {
  return reflect(incoming, true) === outgoing;
}

function addSegment(path: Point[], to: Point) {
  let current = path[path.length - 1];

  while (current.x !== to.x || current.y !== to.y) {
    const dx = Math.sign(to.x - current.x);
    const dy = Math.sign(to.y - current.y);

    current = { x: current.x + dx, y: current.y + dy };
    path.push({ ...current });
  }
}

function makePuzzle(n: number) {
  const cfg = difficulty(n);
  const rng = seeded(n * 7919 + 37);

  const startY = Math.floor(rng() * 7);
  source = { x: 0, y: startY };

  const path: Point[] = [{ ...source }];
  let currentY = startY;

  const turnColumns = [1, 2, 3, 4, 5].slice(0, cfg.turns);

  for (let i = 0; i < turnColumns.length; i++) {
    const x = turnColumns[i];

    addSegment(path, { x, y: currentY });

    let nextY = Math.floor(rng() * 7);

    if (nextY === currentY) nextY = (nextY + 2 + i) % 7;

    if (n > 25 && Math.abs(nextY - currentY) < 2) {
      nextY = (nextY + 3) % 7;
    }

    addSegment(path, { x, y: nextY });
    currentY = nextY;
  }

  addSegment(path, { x: 6, y: currentY });
  target = { x: 6, y: currentY };

  const required: Mirror[] = [];

  for (let i = 1; i < path.length - 1; i++) {
    const incoming = direction(path[i - 1], path[i]);
    const outgoing = direction(path[i], path[i + 1]);

    if (incoming !== outgoing) {
      const correct = correctMirror(incoming, outgoing);
      required.push({
        ...path[i],
        slash: !correct,
        required: true
      });
    }
  }

  const pathKeys = new Set(path.map(p => `${p.x},${p.y}`));
  const free: Point[] = [];

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!pathKeys.has(`${x},${y}`)) free.push({ x, y });
    }
  }

  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }

  mirrors = [...required];

  for (let i = 0; i < cfg.decoys && i < free.length; i++) {
    const p = free[i];
    mirrors.push({ ...p, slash: rng() < 0.5, required: false });
  }

  walls = free.slice(cfg.decoys, cfg.decoys + cfg.walls).map(p => ({ ...p }));

  specials = [];
  gateOpen = false;
  teleporterExit = null;

  const mirrorKeys = new Set(required.map(m => `${m.x},${m.y}`));

  const straight = path
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) =>
      i > 0 &&
      i < path.length - 1 &&
      direction(path[i - 1], p) === direction(p, path[i + 1]) &&
      !mirrorKeys.has(`${p.x},${p.y}`)
    );

  const occupied = new Set<string>([
    ...path.map(p => `${p.x},${p.y}`),
    ...walls.map(p => `${p.x},${p.y}`),
    ...mirrors.map(p => `${p.x},${p.y}`)
  ]);

  const pickStraight = (offset: number) =>
    straight.length
      ? straight[Math.min(straight.length - 1, Math.floor((straight.length - 1) * offset))]
      : null;

  if (n >= 11) {
    const a = pickStraight(0.25);
    if (a) specials.push({ ...a.p, kind: "filter", color: "#ff70c8" });
  }

  if (n >= 26) {
    const a = pickStraight(0.48);

    if (a && !specials.some(t => t.x === a.p.x && t.y === a.p.y)) {
      specials.push({ ...a.p, kind: "splitter" });
    }
  }

  if (n >= 46) {
    const a = pickStraight(0.72);

    if (a && !specials.some(t => t.x === a.p.x && t.y === a.p.y)) {
      specials.push({ ...a.p, kind: "gate" });
    }

    const sw = free.find(p =>
      !occupied.has(`${p.x},${p.y}`) &&
      !specials.some(t => t.x === p.x && t.y === p.y)
    );

    if (sw) specials.push({ ...sw, kind: "switch" });
  }

  if (n >= 71) {
    let pair: [Point, Point] | null = null;

    for (let i = 0; i < path.length - 2; i++) {
      const d1 = direction(path[i], path[i + 1]);
      const d2 = direction(path[i + 1], path[i + 2]);

      if (
        d1 === d2 &&
        !specials.some(t => t.x === path[i].x && t.y === path[i].y) &&
        !specials.some(t => t.x === path[i + 2].x && t.y === path[i + 2].y)
      ) {
        pair = [path[i], path[i + 2]];
        break;
      }
    }

    if (pair) {
      specials.push(
        { ...pair[0], kind: "teleporter", pair: pair[1] },
        { ...pair[1], kind: "teleporter", pair: pair[0] }
      );
    }
  }

  // FIX: Show the actual campaign world, not the difficulty label.
  const world = getWorld(n);
  $("worldLabel").textContent = world.name;

  $("mirrorCount").textContent = String(mirrors.length);
}

function playTone(frequency: number, duration = 0.12) {
  if (!soundEnabled) return;

  try {
    audioContext ??= new AudioContext();

    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.12,
      audioContext.currentTime + 0.015
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime + duration
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch {
    // Audio is optional.
  }
}

function getStars(moveCount: number, requiredCount: number) {
  if (moveCount <= requiredCount) return 3;
  if (moveCount <= requiredCount + 2) return 2;
  return 1;
}

function showCampaignOverlay(title: string, subtitle: string, icon = "✦") {
  let overlay = document.getElementById("campaignOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "campaignOverlay";
    overlay.className = "campaign-overlay";
    overlay.setAttribute("role", "status");
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="campaign-overlay-card">
      <div class="campaign-overlay-orb">${icon}</div>
      <span class="campaign-kicker">LIGHT BENDER CAMPAIGN</span>
      <h2>${title}</h2>
      <p>${subtitle}</p>
      <button type="button" class="primary-btn" id="campaignContinue">CONTINUE →</button>
    </div>`;
  overlay.classList.add("show");
  const close = () => overlay?.classList.remove("show");
  overlay.querySelector("#campaignContinue")?.addEventListener("click", close, { once: true });
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  }, { once: true });
  window.setTimeout(close, 6500);
}

function showWorldIntroduction(n: number) {
  const worldIndex = Math.floor((n - 1) / 20) + 1;
  const key = `lb-world-intro-${worldIndex}`;
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, "shown");
  const world = getWorld(n);
  const theme = getTheme(n);
  document.documentElement.style.setProperty("--world-accent", theme.accent);
  showCampaignOverlay(world.name, world.tag, worldIndex === 5 ? "✧" : "✦");
}

function showMilestoneCelebration(completedLevel: number) {
  const nextWorld = worldBands.find(w => w.start === completedLevel + 1);
  if (nextWorld) {
    showCampaignOverlay("WORLD COMPLETE!", `${getWorld(completedLevel).name} mastered. ${nextWorld.name} is now unlocked!`, "🏆");
  } else if (completedLevel === 100) {
    showCampaignOverlay("LIGHT MASTER!", "You completed all 100 puzzles. You are a true master of light!", "👑");
  }
}


type Achievement = { id: string; title: string; description: string; icon: string; test: () => boolean };

const achievements: Achievement[] = [
  { id: "first-ray", title: "FIRST RAY", description: "Solve your first puzzle.", icon: "✦", test: () => solvedCount() >= 1 },
  { id: "perfect-light", title: "PERFECT LIGHT", description: "Earn 3 stars on any level.", icon: "★", test: () => hasAnyThreeStars() },
  { id: "ten-solves", title: "LIGHT APPRENTICE", description: "Complete 10 different levels.", icon: "◈", test: () => solvedCount() >= 10 },
  { id: "fifty-solves", title: "PRISM EXPERT", description: "Complete 50 different levels.", icon: "❖", test: () => solvedCount() >= 50 },
  { id: "hundred-stars", title: "STAR COLLECTOR", description: "Collect 100 stars across the campaign.", icon: "✧", test: () => totalCampaignStars() >= 100 },
  { id: "all-worlds", title: "WORLD TRAVELLER", description: "Reach the final world.", icon: "◎", test: () => readStoredNumber("lb-level", 1) >= 81 },
  { id: "light-master", title: "LIGHT MASTER", description: "Complete all 100 levels.", icon: "♛", test: () => readStoredNumber("lb-level", 1) >= 100 && readStoredNumber("lb-stars-100", 0) > 0 }
];

function solvedCount() {
  let count = 0;
  for (let n = 1; n <= 100; n++) if (readStoredNumber(`lb-stars-${n}`, 0) > 0) count++;
  return count;
}

function totalCampaignStars() {
  let total = 0;
  for (let n = 1; n <= 100; n++) total += readStoredNumber(`lb-stars-${n}`, 0);
  return total;
}

function hasAnyThreeStars() {
  for (let n = 1; n <= 100; n++) if (readStoredNumber(`lb-stars-${n}`, 0) === 3) return true;
  return false;
}

function unlockedAchievementIds(): string[] {
  try { return JSON.parse(localStorage.getItem("lb-achievements") || "[]") as string[]; }
  catch { return []; }
}

function showAchievementToast(item: Achievement) {
  let toast = document.getElementById("achievementToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "achievementToast";
    toast.className = "achievement-toast";
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span class="achievement-toast-icon">${item.icon}</span><span><small>ACHIEVEMENT UNLOCKED</small><strong>${item.title}</strong><em>${item.description}</em></span>`;
  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");
  window.setTimeout(() => toast?.classList.remove("show"), 3600);
  playTone(740, 0.18);
  window.setTimeout(() => playTone(990, 0.2), 140);
}

function checkAchievements() {
  const unlocked = unlockedAchievementIds();
  let changed = false;
  for (const item of achievements) {
    if (!unlocked.includes(item.id) && item.test()) {
      unlocked.push(item.id);
      changed = true;
      showAchievementToast(item);
    }
  }
  if (changed) localStorage.setItem("lb-achievements", JSON.stringify(unlocked));
}

function openAchievements() {
  const unlocked = unlockedAchievementIds();
  let panel = document.getElementById("achievementPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "achievementPanel";
    panel.className = "achievement-panel modal hidden";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    document.body.appendChild(panel);
  }
  const cards = achievements.map(item => {
    const earned = unlocked.includes(item.id);
    return `<article class="achievement-card ${earned ? "earned" : "locked"}"><span class="achievement-icon">${earned ? item.icon : "?"}</span><span><strong>${item.title}</strong><small>${item.description}</small></span><b>${earned ? "UNLOCKED" : "LOCKED"}</b></article>`;
  }).join("");
  panel.innerHTML = `<div class="achievement-card-shell"><div class="achievement-panel-head"><div><span class="eyebrow">YOUR REWARDS</span><h2>ACHIEVEMENTS</h2><p>${unlocked.length} / ${achievements.length} unlocked</p></div><button class="icon-btn" id="closeAchievements" aria-label="Close achievements">×</button></div><div class="achievement-list">${cards}</div></div>`;
  panel.classList.remove("hidden");
  panel.querySelector("#closeAchievements")?.addEventListener("click", () => panel?.classList.add("hidden"));
  panel.addEventListener("click", event => { if (event.target === panel) panel?.classList.add("hidden"); }, { once: true });
}

function installAchievementButton() {
  const actions = document.querySelector(".top-actions");
  if (!actions || document.getElementById("achievementBtn")) return;
  const button = document.createElement("button");
  button.id = "achievementBtn";
  button.className = "map-open-btn achievement-open-btn";
  button.type = "button";
  button.textContent = "BADGES";
  button.addEventListener("click", openAchievements);
  actions.insertBefore(button, actions.querySelector("#soundBtn"));
}

function createLevel() {
  document.body.classList.remove("level-entering");
  void document.body.offsetWidth;
  document.body.classList.add("level-entering");
  window.setTimeout(() => document.body.classList.remove("level-entering"), 650);
  moves = 0;
  solved = false;
  hintVisible = false;
  selectedCell = null;
  gateOpen = false;

  makePuzzle(level);
  applyWorldTheme(level);

  $("levelTitle").textContent = `LEVEL ${String(level).padStart(2, "0")}`;
  $("moves").textContent = "0";

  const best = localStorage.getItem(`lb-best-${level}`);
  $("bestMoves").textContent = best || "—";

  $("soundBtn").textContent = soundEnabled ? "♫" : "♪";
  $("progressFill").style.width = `${level}%`;
  $("levelProgressValue").textContent = `LEVEL ${String(level).padStart(2, "0")} / 100`;
  const savedStars = Math.max(0, Math.min(3, readStoredNumber(`lb-stars-${level}`, 0)));
  $("levelStars").textContent = `${"★".repeat(savedStars)}${"☆".repeat(3 - savedStars)}`;

  $("nextBtn").toggleAttribute("disabled", true);
  $("modalNextBtn").toggleAttribute("disabled", level >= 100);
  $("modalNextBtn").textContent = level >= 100 ? "CAMPAIGN COMPLETE" : "NEXT LEVEL  →";
  $("message").textContent = "Rotate the mirrors to guide the laser into the crystal.";

  $("winModal").classList.add("hidden");

  simulate();
  draw();
  showWorldIntroduction(level);
}

function simulate() {
  beam = [];
  hitTarget = false;

  const queue: {
    x: number;
    y: number;
    dir: Direction;
    color: string;
    skipTeleport?: boolean;
    skipSplitter?: boolean;
  }[] = [
    { x: source.x, y: source.y, dir: 0, color: "#42e8ff" }
  ];

  const visited = new Set<string>();

  while (queue.length) {
    const ray = queue.shift()!;

    for (let step = 0; step < 120; step++) {
      const key = `${ray.x},${ray.y},${ray.dir},${ray.color}`;

      if (visited.has(key)) break;
      visited.add(key);

      beam.push({ x: ray.x, y: ray.y, color: ray.color });

      if (ray.x === target.x && ray.y === target.y) {
        hitTarget = true;
        break;
      }

      if (walls.some(w => w.x === ray.x && w.y === ray.y)) break;

      const tile = specials.find(t => t.x === ray.x && t.y === ray.y);

      if (tile?.kind === "gate" && !gateOpen) break;

      if (tile?.kind === "filter") {
        ray.color = tile.color || "#ff70c8";
      }

      if (tile?.kind === "splitter" && !ray.skipSplitter) {
        queue.push({
          x: ray.x,
          y: ray.y,
          dir: ((ray.dir + 1) % 4) as Direction,
          color: ray.color,
          skipSplitter: true
        });

        queue.push({
          x: ray.x,
          y: ray.y,
          dir: ((ray.dir + 3) % 4) as Direction,
          color: ray.color,
          skipSplitter: true
        });
      }

      ray.skipSplitter = false;

      if (tile?.kind === "teleporter" && tile.pair && !ray.skipTeleport) {
        ray.x = tile.pair.x;
        ray.y = tile.pair.y;
        ray.skipTeleport = true;
      } else {
        ray.skipTeleport = false;
      }

      const mirror = mirrors.find(m => m.x === ray.x && m.y === ray.y);

      if (mirror) {
        ray.dir = reflect(ray.dir, mirror.slash);
      }

      const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][ray.dir];

      ray.x += d[0];
      ray.y += d[1];

      if (ray.x < 0 || ray.x >= SIZE || ray.y < 0 || ray.y >= SIZE) {
        break;
      }
    }
  }

  if (hitTarget && !solved) {
    solved = true;

    const requiredCount = mirrors.filter(m => m.required).length;
    const stars = getStars(moves, requiredCount);

    const previousStars = readStoredNumber(`lb-stars-${level}`, 0);

    if (stars > previousStars) {
      localStorage.setItem(`lb-stars-${level}`, String(stars));
    }
    const displayedStars = Math.max(stars, Math.min(3, previousStars));
    $("levelStars").textContent = `${"★".repeat(displayedStars)}${"☆".repeat(3 - displayedStars)}`;

    const previousBest = readStoredNumber(`lb-best-${level}`, 0);

    if (!previousBest || moves < previousBest) {
      localStorage.setItem(`lb-best-${level}`, String(moves));
      $("bestMoves").textContent = String(moves);
    }

    $("earnedStars").textContent = "★ ".repeat(stars) + "☆ ".repeat(3 - stars);
    $("winDetail").textContent = `Solved in ${moves} moves · ${stars} of 3 stars`;

    playTone(660, 0.16);
    window.setTimeout(() => playTone(880, 0.22), 130);

    $("nextBtn").removeAttribute("disabled");
    $("modalNextBtn").toggleAttribute("disabled", level >= 100);
    $("modalNextBtn").textContent = level >= 100 ? "CAMPAIGN COMPLETE" : "NEXT LEVEL  →";
    $("message").textContent = `Puzzle solved in ${moves} moves!`;

    // Phase 2 — gold reward. Pays only for star counts not already paid.
    const reward = awardLevelReward(level, stars);
    const winReward = document.getElementById("winReward");

    if (winReward) {
      if (reward > 0) {
        winReward.textContent =
          `+${reward} GOLD · WALLET ${walletBalance().toLocaleString()}`;
        winReward.classList.remove("hidden");
      } else {
        winReward.classList.add("hidden");
      }
    }

    $("winModal").classList.remove("hidden");

    // FIX: never downgrade unlocked progress when replaying old levels.
    const unlockedNow = Math.max(1, readStoredNumber("lb-level", 1));
    localStorage.setItem("lb-level", String(Math.min(100, Math.max(unlockedNow, level + 1))));
    checkAchievements();
    if (level % 20 === 0 || level === 100) {
      window.setTimeout(() => showMilestoneCelebration(level), 350);
    }
  }
}

function roundedRect(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function glowCircle(x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 28;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function draw() {
  const s = canvas.width;
  const c = s / SIZE;
  const theme = {
    ...getTheme(level),
    skyA: "#F0E9FF",
    skyB: "#FFF8FF",
    tileA: "#FFFFFF",
    tileB: "#F7F2FF",
    accent: "#39D9FF",
    beam: "#39D9FF",
    wall: "#D9C9F4"
  };

  ctx.clearRect(0, 0, s, s);

  const bg = ctx.createLinearGradient(0, 0, s, s);
  bg.addColorStop(0, theme.skyA);
  bg.addColorStop(1, theme.skyB);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, s, s);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? theme.tileA : theme.tileB;
      roundedRect(x * c + 5, y * c + 5, c - 10, c - 10, 14);
      ctx.fill();

      ctx.strokeStyle = "#DCCFF2";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  if (selectedCell) {
    ctx.save();
    ctx.strokeStyle = "#FF5CB8";
    ctx.lineWidth = 4;
    roundedRect(selectedCell.x * c + 7, selectedCell.y * c + 7, c - 14, c - 14, 14);
    ctx.stroke();
    ctx.restore();
  }

  if (beam.length) {
    for (let i = 1; i < beam.length; i++) {
      const a = beam[i - 1];
      const b = beam[i];

      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1) continue;

      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = b.color || theme.beam;
      ctx.lineWidth = 10;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 20;

      ctx.beginPath();
      ctx.moveTo((a.x + 0.5) * c, (a.y + 0.5) * c);
      ctx.lineTo((b.x + 0.5) * c, (b.y + 0.5) * c);
      ctx.stroke();

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  walls.forEach(w => {
    const wx = (w.x + 0.5) * c;
    const wy = (w.y + 0.5) * c;

    ctx.save();
    ctx.fillStyle = theme.wall;
    ctx.strokeStyle = "#B99BEA";
    ctx.lineWidth = 2;

    roundedRect(wx - 19, wy - 19, 38, 38, 8);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(wx - 10, wy - 9);
    ctx.lineTo(wx + 10, wy + 9);
    ctx.moveTo(wx + 10, wy - 9);
    ctx.lineTo(wx - 10, wy + 9);
    ctx.stroke();
    ctx.restore();
  });

  glowCircle((source.x + 0.5) * c, (source.y + 0.5) * c, 17, theme.accent);

  ctx.fillStyle = "#fff4d6";
  ctx.beginPath();
  ctx.arc((source.x + 0.5) * c, (source.y + 0.5) * c, 7, 0, Math.PI * 2);
  ctx.fill();

  const tx = (target.x + 0.5) * c;
  const ty = (target.y + 0.5) * c;

  ctx.save();
  ctx.translate(tx, ty);
  ctx.rotate(Math.PI / 4);
  ctx.shadowColor = hitTarget ? "#ffe56c" : "#a76cff";
  ctx.shadowBlur = hitTarget ? 34 : 18;
  ctx.fillStyle = hitTarget ? "#FFD65A" : "#FF5CB8";

  roundedRect(-13, -13, 26, 26, 5);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#796B91";
  ctx.font = "bold 11px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("TARGET", tx, ty + 34);

  specials.forEach(t => {
    const sx = (t.x + 0.5) * c;
    const sy = (t.y + 0.5) * c;

    ctx.save();
    ctx.translate(sx, sy);

    if (t.kind === "filter") {
      ctx.fillStyle = "#FFE5F4";
      ctx.strokeStyle = "#FF5CB8";
      roundedRect(-19, -19, 38, 38, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#D93391";
      ctx.font = "bold 19px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("◈", 0, 7);
    }

    if (t.kind === "splitter") {
      ctx.fillStyle = "#DDF9FF";
      ctx.strokeStyle = "#39D9FF";
      roundedRect(-19, -19, 38, 38, 10);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#138CAD";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(0, 0);
      ctx.lineTo(9, -10);
      ctx.moveTo(0, 0);
      ctx.lineTo(9, 10);
      ctx.stroke();
    }

    if (t.kind === "gate") {
      ctx.fillStyle = gateOpen ? "#E3FAEF" : "#FFF0E8";
      ctx.strokeStyle = gateOpen ? "#58C98B" : "#FF9A72";
      roundedRect(-19, -19, 38, 38, 9);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 17px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(gateOpen ? "✓" : "▥", 0, 6);
    }

    if (t.kind === "switch") {
      ctx.fillStyle = gateOpen ? "#E3FAEF" : "#FFF6D8";
      ctx.strokeStyle = gateOpen ? "#58C98B" : "#D7A900";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("S", 0, 5);
    }

    if (t.kind === "teleporter") {
      ctx.fillStyle = "#EEE8FF";
      ctx.strokeStyle = "#6C3BFF";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#B69AFF";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  });

  mirrors.forEach(m => {
    const mx = (m.x + 0.5) * c;
    const my = (m.y + 0.5) * c;

    ctx.save();
    ctx.translate(mx, my);

    const mirrorFill = ctx.createLinearGradient(-18, -22, 18, 22);
    mirrorFill.addColorStop(0, m.required ? "#FFFFFF" : "#F5F1FF");
    mirrorFill.addColorStop(1, m.required ? "#D9F8FF" : "#E8E1F7");
    ctx.fillStyle = mirrorFill;
    ctx.strokeStyle = m.required ? "#7C62D9" : "#B9AED0";
    ctx.lineWidth = 2;

    roundedRect(-22, -22, 44, 44, 11);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = "#39D9FF";
    ctx.shadowBlur = 15;
    ctx.strokeStyle = "#39D9FF";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";

    ctx.beginPath();

    if (m.slash) {
      ctx.moveTo(-12, 12);
      ctx.lineTo(12, -12);
    } else {
      ctx.moveTo(-12, -12);
      ctx.lineTo(12, 12);
    }

    ctx.stroke();
    ctx.restore();

    if (hintVisible && m.required) {
      ctx.strokeStyle = "#FFD65A";
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(mx, my, 29, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });
}

function nextLevel() {
  if (level >= 100) {
    $("message").textContent =
      "You completed all 100 launch puzzles. Congratulations!";
    return;
  }

  level++;
  localStorage.setItem("lb-level", String(level));
  installAchievementButton();
createLevel();
}

function openLevelMap() {
  const unlocked = Math.max(1, Math.min(100, readStoredNumber("lb-level", 1)));

  const host = $("worldSections");
  host.innerHTML = "";

  let totalStars = 0;

  for (let i = 1; i <= 100; i++) {
    totalStars += readStoredNumber(`lb-stars-${i}`, 0);
  }

  $("campaignProgress").textContent = `${unlocked} / 100 LEVELS UNLOCKED`;
  $("campaignStars").textContent = `${totalStars} / 300 STARS`;

  for (const world of worldBands) {
    const section = document.createElement("section");
    section.className = `world-section world-${getTheme(world.start).id}`;

    const heading = document.createElement("div");
    heading.className = "world-heading";

    const title = document.createElement("strong");
    title.textContent = world.name;

    const tag = document.createElement("span");
    tag.textContent = world.tag;

    heading.append(title, tag);
    section.append(heading);

    let worldCompleted = 0;
    let worldStars = 0;
    for (let n = world.start; n <= world.end; n++) {
      const earned = readStoredNumber(`lb-stars-${n}`, 0);
      if (earned > 0) worldCompleted++;
      worldStars += earned;
    }

    const progressWrap = document.createElement("div");
    progressWrap.className = "world-progress-wrap";
    const progressMeta = document.createElement("div");
    progressMeta.className = "world-progress-meta";
    progressMeta.innerHTML = `<span>${worldCompleted} / 20 COMPLETED</span><span>${worldStars} / 60 ★</span>`;
    const progressTrack = document.createElement("div");
    progressTrack.className = "world-progress-track";
    const progressFill = document.createElement("div");
    progressFill.className = "world-progress-fill";
    progressFill.style.width = `${worldCompleted / 20 * 100}%`;
    progressTrack.append(progressFill);
    progressWrap.append(progressMeta, progressTrack);
    section.append(progressWrap);

    const grid = document.createElement("div");
    grid.className = "level-grid";

    for (let n = world.start; n <= world.end; n++) {
      const btn = document.createElement("button");
      btn.className = "level-tile";

      const isUnlocked = n <= unlocked;
      const stars = readStoredNumber(`lb-stars-${n}`, 0);

      btn.disabled = !isUnlocked;
      btn.classList.toggle("current", n === level);
      btn.classList.toggle("completed", stars > 0);

      btn.innerHTML =
        `<span class="tile-number">${String(n).padStart(2, "0")}</span>` +
        `<span class="tile-stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span>`;

      btn.setAttribute(
        "aria-label",
        `Level ${n}${isUnlocked ? `, ${stars} stars` : ", locked"}`
      );

      if (isUnlocked) {
        btn.addEventListener("click", () => {
          level = n;
          localStorage.setItem("lb-level", String(Math.max(unlocked, n)));
          createLevel();
          $("mapModal").classList.add("hidden");
        });
      }

      grid.append(btn);
    }

    section.append(grid);
    host.append(section);
  }

  $("mapModal").classList.remove("hidden");
}

$("mapBtn").addEventListener("click", openLevelMap);

$("closeMapBtn").addEventListener("click", () =>
  $("mapModal").classList.add("hidden")
);

$("mapModal").addEventListener("click", e => {
  if (e.target === $("mapModal")) {
    $("mapModal").classList.add("hidden");
  }
});

canvas.addEventListener("pointerdown", e => {
  if (solved) return;

  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * canvas.width / rect.width;
  const y = (e.clientY - rect.top) * canvas.height / rect.height;

  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);

  const special = specials.find(v => v.x === gx && v.y === gy);

  if (special?.kind === "switch") {
    gateOpen = !gateOpen;
    moves++;

    playTone(gateOpen ? 620 : 320, 0.1);
    $("moves").textContent = String(moves);
    $("message").textContent = gateOpen
      ? "Gate unlocked! Guide the beam through it."
      : "Gate locked again.";

    simulate();
    draw();
    return;
  }

  const m = mirrors.find(v => v.x === gx && v.y === gy);
  if (!m) return;

  selectedCell = { x: gx, y: gy };
  m.slash = !m.slash;
  moves++;

  playTone(420, 0.07);
  $("moves").textContent = String(moves);

  hintVisible = false;
  simulate();
  draw();
});

$("resetBtn").addEventListener("click", createLevel);
$("nextBtn").addEventListener("click", nextLevel);
$("modalNextBtn").addEventListener("click", nextLevel);

$("backBtn").addEventListener("click", () => {
  if (level > 1) {
    level--;
    createLevel();
  }
});

$("hintBtn").addEventListener("click", () => {
  hintVisible = true;
  $("message").textContent =
    "Hint: rotate route mirrors, tap S to open gates, and watch special tiles change the beam.";
  draw();
});

$("pauseBtn").addEventListener("click", () => {
  $("pauseModal").classList.remove("hidden");
  $("resumeBtn").focus();
});

$("resumeBtn").addEventListener("click", () => $("pauseModal").classList.add("hidden"));
$("pauseRestartBtn").addEventListener("click", () => {
  $("pauseModal").classList.add("hidden");
  createLevel();
});
$("pauseMapBtn").addEventListener("click", () => {
  $("pauseModal").classList.add("hidden");
  openLevelMap();
});
$("pauseSettingsBtn").addEventListener("click", () => {
  $("pauseModal").classList.add("hidden");
  document.dispatchEvent(new CustomEvent("lb:open-settings"));
});
$("pauseHomeBtn").addEventListener("click", () => {
  $("pauseModal").classList.add("hidden");
  $("homeBtn").click();
});
$("replayBtn").addEventListener("click", createLevel);
$("winMapBtn").addEventListener("click", () => {
  $("winModal").classList.add("hidden");
  openLevelMap();
});

$("soundBtn").addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem("lb-sound", soundEnabled ? "on" : "off");
  $("soundBtn").textContent = soundEnabled ? "♫" : "♪";

  if (soundEnabled) playTone(520, 0.1);
});

document.addEventListener("lb:sound-changed", event => {
  soundEnabled = (event as CustomEvent<boolean>).detail;
  $("soundBtn").textContent = soundEnabled ? "♫" : "♪";
});

installAchievementButton();
createLevel();

/* ---------------- events from the home screen (src/home.ts) ------- */

// Home "CONTINUE" / "PLAY" ask the game to load a specific level.
document.addEventListener("lb:play-level", event => {
  const target = (event as CustomEvent<number>).detail;

  if (typeof target === "number" && target >= 1 && target <= 100) {
    level = target;
    createLevel();
    window.scrollTo(0, 0);
  }
});

// Home "BADGES" tile opens the achievements panel above the home screen.
document.addEventListener("lb:open-achievements", () => {
  openAchievements();
  const panel = document.getElementById("achievementPanel");
  if (panel) panel.style.zIndex = "10000";
});
