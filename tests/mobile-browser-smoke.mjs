import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
].filter(Boolean);

const SHOW_FIXTURE = {
  liveData: [
    {
      id: "festival-lion-king",
      name: "Festival of the Lion King",
      entityType: "SHOW",
      land: "Africa",
      status: "OPERATING",
      showtimes: [{ startTime: "2099-08-24T17:00:00.000Z" }],
    },
    {
      id: "mickey-town-square",
      name: "Meet Mickey at Town Square Theater",
      entityType: "CHARACTER",
      land: "Main Street, U.S.A.",
      status: "OPERATING",
      showtimes: [{ startTime: "2099-08-24T17:30:00.000Z" }],
    },
  ],
};

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error(`No supported Chrome executable found. Tried: ${CHROME_CANDIDATES.join(", ")}`);
}

async function getOpenPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error("Unable to reserve a local port");
  return port;
}

async function retry(label, operation, attempts = 80, delayMs = 250) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`${label} did not become ready: ${lastError instanceof Error ? lastError.message : lastError}`);
}

async function waitForServer(url) {
  return retry("Next.js production server", async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  });
}

async function connectToPage(debugPort) {
  const page = await retry("Chrome DevTools page", async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const targets = await response.json();
    const target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
    if (!target) throw new Error("No debuggable page target");
    return target;
  });

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("Chrome DevTools WebSocket failed")), { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const eventHandlers = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result || {});
      return;
    }

    for (const handler of eventHandlers.get(message.method) || []) {
      Promise.resolve(handler(message.params || {})).catch((error) => {
        console.error(`CDP ${message.method} handler failed`, error);
      });
    }
  });

  function send(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  function on(method, handler) {
    const handlers = eventHandlers.get(method) || [];
    handlers.push(handler);
    eventHandlers.set(method, handlers);
  }

  return { socket, send, on };
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode) return;

  await new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(forceTimer);
      resolve();
    };
    const forceTimer = setTimeout(() => {
      child.kill("SIGKILL");
      finish();
    }, 2_000);

    child.once("exit", finish);
    child.kill("SIGTERM");
  });
}

async function run() {
  const chromePath = findChrome();
  const [appPort, debugPort] = await Promise.all([getOpenPort(), getOpenPort()]);
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), "castlewatch-chrome-"));
  const appUrl = `http://127.0.0.1:${appPort}`;
  let serverOutput = "";
  let chromeOutput = "";

  const server = spawn(process.execPath, [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(appPort),
  ], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });

  const chrome = spawn(chromePath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  chrome.stdout.on("data", (chunk) => { chromeOutput += chunk; });
  chrome.stderr.on("data", (chunk) => { chromeOutput += chunk; });

  let cdp;
  try {
    await waitForServer(appUrl);
    cdp = await connectToPage(debugPort);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await cdp.send("Fetch.enable", {
      patterns: [{ urlPattern: "*api.themeparks.wiki/*", requestStage: "Request" }],
    });
    cdp.on("Fetch.requestPaused", async ({ requestId }) => {
      await cdp.send("Fetch.fulfillRequest", {
        requestId,
        responseCode: 200,
        responseHeaders: [
          { name: "Content-Type", value: "application/json" },
          { name: "Access-Control-Allow-Origin", value: "*" },
        ],
        body: Buffer.from(JSON.stringify(SHOW_FIXTURE)).toString("base64"),
      });
    });

    await cdp.send("Page.navigate", { url: appUrl });
    const evaluation = await cdp.send("Runtime.evaluate", {
      expression: `
        (async () => {
          const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const waitFor = async (check, label) => {
            for (let attempt = 0; attempt < 100; attempt += 1) {
              const value = check();
              if (value) return value;
              await sleep(100);
            }
            throw new Error("Timed out waiting for " + label);
          };
          const buttonNamed = (selector, label) =>
            Array.from(document.querySelectorAll(selector)).find((node) => node.textContent?.trim() === label);

          await waitFor(() => document.querySelector(".command-center h2")?.textContent === "Magic Kingdom", "initial park dashboard");
          await waitFor(() => {
            const button = document.querySelector(".top-park-button");
            return document.readyState === "complete" && button && parseFloat(getComputedStyle(button).minHeight) >= 44;
          }, "production stylesheet");
          const topButtons = Array.from(document.querySelectorAll(".top-park-button"));
          if (topButtons.length !== 6) throw new Error("Expected six primary navigation buttons");
          const minimumTopButtonHeight = Math.min(...topButtons.map((button) => button.getBoundingClientRect().height));
          if (minimumTopButtonHeight < 44) {
            throw new Error("Primary navigation touch target is " + minimumTopButtonHeight + "px at viewport " + window.innerWidth + "px");
          }
          const navColumns = getComputedStyle(document.querySelector(".top-park-banner")).gridTemplateColumns.split(" ").length;
          if (navColumns !== 3) throw new Error("Mobile primary navigation did not collapse to three columns");

          const activities = buttonNamed(".section-tab", "Activities");
          if (!activities) throw new Error("Activities tab is missing");
          activities.click();
          await waitFor(() => document.querySelector(".compact-panel h3")?.textContent === "Shows & family activities", "Activities panel");
          await waitFor(() => document.querySelector(".castlewatch-showtimes-card")?.textContent.includes("Festival of the Lion King"), "timed show card");

          const characters = await waitFor(() => buttonNamed(".section-tab", "Characters"), "Characters tab");
          if (characters.getBoundingClientRect().height < 44) throw new Error("Characters touch target is smaller than 44px");
          characters.click();
          const characterPanel = await waitFor(() => {
            const panel = document.querySelector(".castlewatch-characters-panel:not(.castlewatch-character-hidden)");
            return panel?.textContent.includes("Meet Mickey at Town Square Theater") ? panel : null;
          }, "Characters panel");

          const epcot = buttonNamed(".top-park-button", "🌐Epcot");
          if (!epcot) throw new Error("Epcot navigation button is missing");
          epcot.click();
          await waitFor(() => document.querySelector(".command-center h2")?.textContent === "Epcot", "park switch");

          const overflow = document.documentElement.scrollWidth - window.innerWidth;
          if (overflow > 1) throw new Error("Mobile page has horizontal overflow of " + overflow + "px");

          return {
            viewport: [window.innerWidth, window.innerHeight],
            navButtons: topButtons.length,
            navColumns,
            activitiesHeading: "Shows & family activities",
            characterPanel: characterPanel.querySelector("h3")?.textContent,
            selectedPark: document.querySelector(".command-center h2")?.textContent,
            horizontalOverflow: overflow,
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    if (evaluation.exceptionDetails) {
      throw new Error(evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text || "Browser evaluation failed");
    }
    const result = evaluation.result?.value;
    assert.deepEqual(result.viewport, [390, 844]);
    assert.equal(result.navButtons, 6);
    assert.equal(result.navColumns, 3);
    assert.equal(result.activitiesHeading, "Shows & family activities");
    assert.equal(result.characterPanel, "Characters & meet-and-greets");
    assert.equal(result.selectedPark, "Epcot");
    assert.ok(result.horizontalOverflow <= 1);
    console.log("CastleWatch mobile browser smoke passed", result);
  } catch (error) {
    if (serverOutput) console.error("Next.js output:\n" + serverOutput);
    if (chromeOutput) console.error("Chrome output:\n" + chromeOutput);
    throw error;
  } finally {
    cdp?.socket.close();
    await Promise.all([stopProcess(server), stopProcess(chrome)]);
    await retry("Chrome profile cleanup", () => rm(profileDirectory, { recursive: true, force: true }), 10, 100);
  }
}

await run();
