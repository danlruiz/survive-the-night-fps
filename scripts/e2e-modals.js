// Modals e2e: every panel and screen that opens over the game, opened one at a time, with where its close cross sits
// against its card (it belongs in the top-right corner, the same inset on all of them) and a still of each. Also the
// pause menu's way into a screen and back out: closing the bestiary, the map, the leaderboard or Dead Hand that was
// opened from the Esc menu goes back to the menu, not to the game.
// usage: node scripts/e2e-modals.js [--root <tree>] [--out shots/clip/modals] [--build]
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  REPO,
  OUT,
  parseArgs,
  sleep,
  startGame,
  launchChrome,
  LIFE_MAX,
  CHEAP_SETTINGS,
} from "./clip/lib.js";

const args = parseArgs(process.argv.slice(2), { out: join(OUT, "modals") });
const root = args.root ? resolve(args.root) : REPO;
const out = resolve(args.out);
mkdirSync(out, { recursive: true });

let failed = 0;
const check = (name, ok, info) => {
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${info === undefined ? "" : " " + JSON.stringify(info)}`,
  );
};

// the visible close crosses, each against the card it is pinned to (its offsetParent): its gap to the card's top and
// right edges, its size, and whatever else in its head runs in under it
const CROSSES = () =>
  [...document.querySelectorAll(".set-close, .pls-close, .inv-close")]
    .filter((b) => b.getClientRects().length && !b.closest("[hidden]"))
    .map((b) => {
      const card = b.offsetParent || b.parentElement;
      const r = b.getBoundingClientRect(),
        c = card.getBoundingClientRect();
      // (the part of it that shows: cut to every box between it and the card that clips, as the zoomed map's canvas is)
      const seen = (o) => {
        const q = o.getBoundingClientRect();
        let [L, T, R, B] = [q.left, q.top, q.right, q.bottom];
        for (let a = o.parentElement; a && a !== card; a = a.parentElement) {
          if (getComputedStyle(a).overflow === "visible") continue;
          const k = a.getBoundingClientRect();
          [L, T, R, B] = [
            Math.max(L, k.left),
            Math.max(T, k.top),
            Math.min(R, k.right),
            Math.min(B, k.bottom),
          ];
        }
        return { L, T, R, B };
      };
      const hit = (o) =>
        o !== b &&
        o.getClientRects().length &&
        (() => {
          const q = seen(o);
          return (
            q.R > q.L &&
            q.B > q.T &&
            q.L < r.right - 1 &&
            q.R > r.left + 1 &&
            q.T < r.bottom - 1 &&
            q.B > r.top + 1
          );
        })();
      // (what shows: text of its own, a picture, a control; not the boxes they sit in, not the cross's own head)
      const shows = (o) =>
        !o.contains(b) &&
        !b.contains(o) &&
        ([...o.childNodes].some(
          (n) => n.nodeType === 3 && n.textContent.trim(),
        ) ||
          /^(BUTTON|INPUT|SELECT|IMG|CANVAS|svg)$/.test(o.tagName));
      const under = [...card.querySelectorAll("*")]
        .filter((o) => shows(o) && hit(o) && !o.closest("[hidden]"))
        .map((o) => (o.className.baseVal ?? o.className) || o.tagName);
      return {
        cls: b.className.baseVal ?? b.className,
        card: card.className,
        top: Math.round(r.top - c.top),
        right: Math.round(c.right - r.right),
        w: Math.round(r.width),
        h: Math.round(r.height),
        under,
      };
    });

let game = null,
  chrome = null;
try {
  game = await startGame(root, { seed: 1, build: !!args.build });
  chrome = await launchChrome({
    width: 1280,
    height: 720,
    life: LIFE_MAX,
    storage: { "stn.settings": CHEAP_SETTINGS },
  });
  const p = chrome.page;
  // signed in, with friends to list (the test server has no database): the panels as a player with an account sees them
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  const FAKE = {
    "/api/auth/me": {
      accounts: true,
      user: {
        id: "u-me",
        username: "Tester",
        email: "t@example.com",
        createdAt: ago(9000),
      },
    },
    "/api/friends": {
      friends: [
        {
          id: "u-1",
          username: "Ripley",
          status: "online",
          unread: 2,
          lastSeen: ago(1),
        },
        {
          id: "u-2",
          username: "Hicks",
          status: "offline",
          unread: 0,
          lastSeen: ago(300),
        },
        {
          id: "u-3",
          username: "Bishop",
          status: "offline",
          unread: 0,
          lastSeen: ago(4000),
        },
      ],
      incoming: [{ id: "u-4", username: "Newt", at: ago(20) }],
      outgoing: [{ id: "u-5", username: "Vasquez", at: ago(60) }],
    },
  };
  await p.setRequestInterception(true);
  p.on("request", (req) => {
    const body = FAKE[new URL(req.url()).pathname];
    if (body)
      req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    else req.continue();
  });
  await p.goto(game.url, { waitUntil: "load", timeout: 60000 });
  await sleep(3500);

  const shot = async (name) => p.screenshot({ path: join(out, name + ".png") });
  // one size, one inset, nothing under it (the inventory's labelled Close is its own)
  const crosses = async (name) => {
    const list = await p.evaluate(CROSSES);
    console.log(`      ${name}: ${JSON.stringify(list)}`);
    for (const x of list.filter((x) => x.cls !== "inv-close")) {
      const ok =
        x.w === 32 &&
        x.h === 32 &&
        Math.abs(x.top - 13) <= 1 &&
        Math.abs(x.right - 13) <= 1 &&
        !x.under.length;
      check(
        `${name}: the cross in its card's top-right corner, 32 px, clear of the head`,
        ok,
        ok ? undefined : x,
      );
    }
    return list;
  };

  // the splash's panels
  for (const [name, open] of [
    ["splash-friends", (ui) => ui.friends.show()],
    ["splash-account", (ui) => ui.accountPanel.show()],
    ["splash-achievements", (ui) => ui.achPanel.show()],
    ["splash-settings", (ui) => ui.settingsPanel.show()],
    ["splash-leaderboard", (ui) => ui.splash._showLeaderboard()],
  ]) {
    await p.evaluate(`(${open})(window.__game.ui)`);
    await sleep(500);
    await crosses(name);
    await shot(name);
    await p.keyboard.press("Escape");
    await sleep(300);
  }

  await p.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((x) => /^\s*(quick )?join/i.test(x.textContent))
      ?.click(),
  );
  for (
    let i = 0;
    i < 120 &&
    !(await p.evaluate(
      () => !!(window.__game && window.__game.myId && window.__game.vm),
    ));
    i++
  )
    await sleep(250);
  await sleep(2500);

  // the mouse: headless Chrome may not take it, so a stand-in that answers at once
  await p.evaluate(() => {
    const inp = window.__game.input;
    const change = (locked) => {
      if (inp.locked === locked) return;
      inp.locked = locked;
      inp.handlers.onLockChange?.(locked);
    };
    inp.requestLock = function () {
      if (!this.locked) setTimeout(() => change(true), 20);
    };
    inp.exitLock = function () {
      if (this.locked) setTimeout(() => change(false), 20);
    };
    window.__lock = change;
  });
  const pause = async () => {
    await p.evaluate(() => window.__lock(true));
    await sleep(100);
    await p.evaluate(() => window.__lock(false)); // (Esc, as the browser lets go of the mouse)
    await sleep(300);
  };
  const state = () =>
    p.evaluate(() => ({
      pause: window.__game.ui.pauseOpen,
      locked: window.__game.input.locked,
      up: !!window.__game.screenUp(),
    }));

  // the game's screens, each from the pause menu's row, then closed three ways: cross, Esc, a click outside
  const rows = { Bestiary: "bestiary", "Dead Hand": "cards" };
  for (const [row, key] of Object.entries(rows)) {
    for (const how of ["cross", "esc", "outside"]) {
      await pause();
      await p.evaluate(
        (row) =>
          [...document.querySelectorAll(".pm-row")]
            .find((b) => b.textContent.includes(row))
            ?.click(),
        row,
      );
      await sleep(600);
      if (how === "cross") {
        await crosses("pause-" + key);
        await shot("pause-" + key);
        await p.evaluate((key) => window.__game.ui[key].close.click(), key);
      } else if (how === "esc") {
        // (Esc steps back first inside Dead Hand: its "New to Dead Hand?", a card picked)
        for (
          let i = 0;
          i < 4 && (await p.evaluate((key) => window.__game.ui[key].open, key));
          i++
        ) {
          await p.keyboard.press("Escape");
          await sleep(200);
        }
      } else await p.mouse.click(4, 360);
      await sleep(300);
      const st = await state();
      check(
        `${row} from the Esc menu, closed by ${how}: back on the menu`,
        st.pause && !st.locked && !st.up,
        st,
      );
      await p.evaluate(() => window.__game.resumeFromPause());
      await sleep(200);
    }
  }

  // the Esc menu's own panels
  for (const [row, name] of [
    ["Friends", "pause-friends"],
    ["Achievements", "pause-achievements"],
    ["Perks", "pause-perks"],
    ["Settings", "pause-settings"],
    ["Invite friends", "pause-invite"],
    ["Field notes", "pause-notes"],
  ]) {
    await pause();
    await p.evaluate(
      (row) =>
        [...document.querySelectorAll(".pm-row")]
          .find((b) => b.querySelector(".pm-label")?.textContent === row)
          ?.click(),
      row,
    );
    await sleep(600);
    await crosses(name);
    await shot(name);
    await p.keyboard.press("Escape");
    await sleep(300);
    const st = await state();
    check(
      `${row} from the Esc menu, closed by Esc: back on the menu`,
      st.pause,
      st,
    );
    await p.evaluate(() => window.__game.resumeFromPause());
    await sleep(200);
  }

  // the field notes, closed by a click off them: off to the left of the rail, and on the rail itself (a row's own click
  // is eaten, as a modal's backdrop would): only the notes go, the menu stays
  for (const [where, at] of [
    ["left of the rail", () => [4, 360]],
    [
      "on the rail",
      () => {
        const r = document.querySelector(".pm-rail .pm-row").getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      },
    ],
  ]) {
    await pause();
    await p.evaluate(() =>
      [...document.querySelectorAll(".pm-row")]
        .find((b) => b.querySelector(".pm-label")?.textContent === "Field notes")
        ?.click(),
    );
    await sleep(600);
    const open = await p.evaluate(() => window.__game.ui.fieldNotes.visible);
    const [x, y] = await p.evaluate(`(${at})()`);
    await p.mouse.click(x, y);
    await sleep(300);
    const st = await state();
    const notes = await p.evaluate(() => window.__game.ui.fieldNotes.visible);
    check(
      `Field notes, a click ${where}: notes closed, still on the menu`,
      open && !notes && st.pause && !st.locked && !st.up,
      { open, notes, ...st },
    );
    await p.evaluate(() => window.__game.resumeFromPause());
    await sleep(200);
  }

  // [L], [M], Tab pinned, the inventory, and Friends from the sheet's tab
  await p.evaluate(() => window.__lock(true));
  await sleep(200);
  for (const [name, open, close] of [
    ["board", (g) => g.toggleBoard(true), (g) => g.toggleBoard(false)],
    [
      "board-friends",
      (g) => (
        g.toggleBoard(true),
        setTimeout(
          () =>
            document
              .querySelector(
                ".lb-frame .pls-tab[data-tab=friends], .pls-tab[data-tab=friends]",
              )
              ?.click(),
          200,
        )
      ),
      (g) => (g.ui.friends.hide(), g.toggleBoard(false)),
    ],
    ["roster", (g) => g.pinRoster(true), (g) => g.pinRoster(false)],
    [
      "roster-friends",
      (g) => (
        g.pinRoster(true),
        setTimeout(
          () =>
            [...document.querySelectorAll(".pls-tab[data-tab=friends]")]
              .find((b) => b.getClientRects().length)
              ?.click(),
          200,
        )
      ),
      (g) => (g.ui.friends.hide(), g.pinRoster(false)),
    ],
    ["map", (g) => g.toggleMap(true), (g) => g.toggleMap(false)],
    [
      "inventory",
      (g) => g.toggleInventory(true),
      (g) => g.toggleInventory(false),
    ],
  ]) {
    await p.evaluate(`(${open})(window.__game)`);
    await sleep(800);
    await crosses(name);
    await shot(name);
    await p.evaluate(`(${close})(window.__game)`);
    await sleep(300);
  }
} catch (e) {
  failed++;
  console.error(e);
} finally {
  await chrome?.close?.();
  game?.stop?.();
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
