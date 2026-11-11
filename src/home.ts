/* ============================================================
   LIGHT BENDER — HOME SCREEN CONTROLLER (Phase 1)
   Runs on load. The game (main.ts) renders behind the home
   screen; home hides itself when the player starts playing.

   Communication with the game uses custom window events:
   - "lb:play-level"  (detail = level number)  -> game loads level
   - "lb:open-achievements"                    -> game opens panel
   ============================================================ */

import {
  walletBalance,
  walletEarned,
  walletSpent,
  walletHistory,
  type HistoryEntry
} from "./wallet";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const home = $("homeScreen");
const SOUND_KEY = "lb-sound";

function safeNumber(value: string | null, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

/* ---------------- state helpers ---------------- */

function isSoundOn(): boolean {
  return localStorage.getItem(SOUND_KEY) !== "off";
}

function unlockedLevel(): number {
  return Math.max(1, Math.min(100, safeNumber(localStorage.getItem("lb-level"), 1)));
}

function campaignStats(): { unlocked: number; solved: number; stars: number } {
  const unlocked = unlockedLevel();
  let solved = 0;
  let stars = 0;

  for (let n = 1; n <= 100; n++) {
    const s = safeNumber(localStorage.getItem(`lb-stars-${n}`), 0);
    if (s > 0) solved++;
    stars += s;
  }

  return { unlocked, solved, stars };
}

/** First level the player has not solved yet (within unlocked range). */
function firstIncompleteLevel(): number {
  const unlocked = unlockedLevel();
  for (let n = 1; n <= unlocked; n++) {
    if (safeNumber(localStorage.getItem(`lb-stars-${n}`), 0) === 0) return n;
  }
  return unlocked;
}

/* ---------------- rendering ---------------- */

function refreshHome() {
  const { unlocked, solved, stars } = campaignStats();

  $("homeGold").textContent = walletBalance().toLocaleString();
  $("homeContinue").textContent =
    `▶  CONTINUE — LEVEL ${String(unlocked).padStart(2, "0")}`;

  $("homeCampaignLevel").textContent =
    `${String(unlocked).padStart(2, "0")} / 100`;
  $("homeCampaignStars").textContent = `${stars} / 300 ★`;
  $("homeCampaignSolved").textContent = `${solved} PUZZLES SOLVED`;
  $("homeCampaignBar").style.width = `${unlocked}%`;

  $("homeSound").textContent = isSoundOn() ? "♫" : "♪";
}

function showHome() {
  $("mapModal").classList.add("hidden");
  home.classList.remove("hidden");
  window.scrollTo(0, 0);
  refreshHome();
}

function hideHome() {
  home.classList.add("hidden");
}

/* ---------------- navigation ---------------- */

function playLevel(n: number) {
  hideHome();
  window.scrollTo(0, 0);
  // Dispatch on document: main.ts listens on document (window events
  // do not propagate down to document listeners).
  document.dispatchEvent(new CustomEvent("lb:play-level", { detail: n }));
}

/* ---------------- modal helper ---------------- */

function ensureModal(id: string): HTMLElement {
  let modal = document.getElementById(id);
  if (!modal) {
    modal = document.createElement("div");
    modal.id = id;
    modal.className = "home-modal hidden";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
  }
  return modal;
}

/* ---------------- settings modal ---------------- */

function formatHistoryEntry(entry: HistoryEntry): string {
  const sign = entry.amount > 0 ? "+" : "−";
  return `${sign}${Math.abs(entry.amount)} GOLD · ${entry.reason}`;
}

function openSettings() {
  const modal = ensureModal("homeSettingsModal");
  const history = walletHistory().slice(0, 5);
  const historyRows = history.length
    ? history.map(entry => `<span>${formatHistoryEntry(entry)}</span>`).join("")
    : "<span>Complete puzzles to start earning gold.</span>";

  modal.innerHTML = `
    <div class="home-modal-card">
      <span class="home-modal-kicker">LIGHT BENDER</span>
      <h2>SETTINGS</h2>

      <button type="button" id="settingsSound" class="home-settings-sound">
        SOUND — ${isSoundOn() ? "ON" : "OFF"}
      </button>

      <div class="home-wallet-grid">
        <div class="home-wallet-cell">
          <small>WALLET</small><b>🪙 ${walletBalance().toLocaleString()}</b>
        </div>
        <div class="home-wallet-cell">
          <small>EARNED</small><b>🪙 ${walletEarned().toLocaleString()}</b>
        </div>
        <div class="home-wallet-cell">
          <small>SPENT</small><b>🪙 ${walletSpent().toLocaleString()}</b>
        </div>
      </div>

      <div class="home-history" aria-label="Recent gold activity">
        ${historyRows}
      </div>

      <button type="button" id="settingsReset" class="home-reset-btn">
        RESET ALL PROGRESS
      </button>
      <button type="button" id="settingsClose" class="home-modal-btn">
        CLOSE
      </button>
    </div>`;

  modal.classList.remove("hidden");

  const resetBtn = modal.querySelector<HTMLButtonElement>("#settingsReset")!;
  let resetArmed = false;

  modal.querySelector("#settingsSound")!.addEventListener("click", () => {
    localStorage.setItem(SOUND_KEY, isSoundOn() ? "off" : "on");
    document.dispatchEvent(new CustomEvent("lb:sound-changed", { detail: isSoundOn() }));
    refreshHome();
    const button = modal.querySelector<HTMLButtonElement>("#settingsSound")!;
    button.textContent = `SOUND — ${isSoundOn() ? "ON" : "OFF"}`;
  });

  resetBtn.addEventListener("click", () => {
    if (!resetArmed) {
      resetArmed = true;
      resetBtn.textContent = "TAP AGAIN TO CONFIRM";
      resetBtn.classList.add("danger-armed");
      return;
    }

    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("lb-")) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
    window.location.reload();
  });

  modal.querySelector("#settingsClose")!.addEventListener("click", () => {
    modal.classList.add("hidden");
    refreshHome();
  });

  modal.addEventListener("click", event => {
    if (event.target === modal) modal.classList.add("hidden");
  }, { once: true });
}

/* ---------------- shop modal (real UI, full shop = Phase 4) ------- */

function openShop() {
  const modal = ensureModal("homeShopModal");

  modal.innerHTML = `
    <div class="home-modal-card">
      <span class="home-modal-kicker">COSMETIC SHOP</span>
      <h2>COMING SOON</h2>
      <p>Mirror skins, beam colours, crystal styles and board themes are being crafted in the workshop.</p>
      <div class="home-modal-wallet">
        <span>🪙</span>
        <b>${walletBalance().toLocaleString()}</b>
        <small>GOLD READY TO SPEND</small>
      </div>
      <p class="home-modal-hint">Every puzzle you solve pays gold — your balance is saved automatically.</p>
      <button type="button" id="shopClose" class="home-modal-btn">CLOSE</button>
    </div>`;

  modal.classList.remove("hidden");

  modal.querySelector("#shopClose")!.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  modal.addEventListener("click", event => {
    if (event.target === modal) modal.classList.add("hidden");
  }, { once: true });
}

/* ---------------- sound toggle ---------------- */

function toggleSound() {
  localStorage.setItem(SOUND_KEY, isSoundOn() ? "off" : "on");
  document.dispatchEvent(new CustomEvent("lb:sound-changed", { detail: isSoundOn() }));
  refreshHome();
}

/* ---------------- wiring ---------------- */

$("homeContinue").addEventListener("click", () => playLevel(unlockedLevel()));
$("homePlay").addEventListener("click", () => playLevel(firstIncompleteLevel()));

$("homeLevels").addEventListener("click", () => {
  hideHome();
  window.setTimeout(() => $("mapBtn").click(), 100);
});

$("homeShop").addEventListener("click", openShop);
$("homeSettings").addEventListener("click", openSettings);
$("homeSound").addEventListener("click", toggleSound);
$("homeAchievements").addEventListener("click", () => {
  // main.ts listens and opens the achievements panel above home.
  document.dispatchEvent(new CustomEvent("lb:open-achievements"));
});

document.addEventListener("lb:open-settings", openSettings);

document.getElementById("homeBtn")?.addEventListener("click", showHome);

refreshHome();
