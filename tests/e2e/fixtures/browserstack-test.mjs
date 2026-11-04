import { chromium } from "playwright";
import { test as base, expect } from "@playwright/test";

const CONTEXT_OPTION_KEYS = [
  "acceptDownloads",
  "baseURL",
  "bypassCSP",
  "colorScheme",
  "deviceScaleFactor",
  "extraHTTPHeaders",
  "forcedColors",
  "geolocation",
  "hasTouch",
  "ignoreHTTPSErrors",
  "isMobile",
  "javaScriptEnabled",
  "locale",
  "permissions",
  "reducedMotion",
  "screen",
  "serviceWorkers",
  "timezoneId",
  "userAgent",
  "viewport"
];

function browserContextOptions(projectUse = {}) {
  const options = {};
  for (const key of CONTEXT_OPTION_KEYS) {
    if (projectUse[key] !== undefined) options[key] = projectUse[key];
  }
  if (!options.baseURL && process.env.E2E_BASE_URL) {
    options.baseURL = process.env.E2E_BASE_URL;
  }
  return options;
}

function browserStackCommand(page, command) {
  return page.evaluate(() => {}, "browserstack_executor: " + JSON.stringify(command));
}

export function isBrowserStackIOS(testInfo) {
  if (!process.env.BROWSERSTACK_AUTOMATION) return false;
  const projectUse = testInfo.project.use ?? {};
  return Boolean(projectUse.deviceName) || String(projectUse.browserName ?? "").toLowerCase() === "safari";
}

export const test = base.extend({
  // A fresh remote connection per test avoids reusing an iOS session after its
  // single supported BrowserContext has been consumed by a previous test.
  testBrowser: async ({}, use, testInfo) => {
    let browser;
    if (process.env.BROWSERSTACK_AUTOMATION) {
      const connectOptions = testInfo.project.use.connectOptions;
      if (!connectOptions) {
        throw new Error("BrowserStack connectOptions were not provided for this test session.");
      }
      browser = await chromium.connect(connectOptions);
    } else {
      browser = await chromium.launch({ headless: testInfo.project.use.headless !== false });
    }

    try {
      await use(browser);
    } finally {
      await browser.close().catch(() => undefined);
    }
  },
  context: async ({ testBrowser }, use, testInfo) => {
    const context = await testBrowser.newContext(browserContextOptions(testInfo.project.use));
    try {
      await use(context);
    } finally {
      await context.close().catch(() => undefined);
    }
  },
  page: async ({ context }, use, testInfo) => {
    const page = await context.newPage();
    if (testInfo.project.use.actionTimeout) {
      page.setDefaultTimeout(testInfo.project.use.actionTimeout);
    }
    if (testInfo.project.use.navigationTimeout) {
      page.setDefaultNavigationTimeout(testInfo.project.use.navigationTimeout);
    }
    await use(page);
  }
});

test.afterEach(async ({ testBrowser }, testInfo) => {
  if (!process.env.BROWSERSTACK_AUTOMATION) return;
  const page = testBrowser.contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => !candidate.isClosed());
  if (!page) return;

  const status = testInfo.status === "passed"
    ? "passed"
    : ["failed", "timedOut"].includes(testInfo.status) ? "failed" : "";
  await browserStackCommand(page, {
    action: "setSessionName",
    arguments: { name: testInfo.titlePath.join(" > ").slice(0, 240) }
  }).catch(() => undefined);

  // Mark the session last: BrowserStack can close a session after its status is set.
  if (status) {
    const reason = String(testInfo.error?.message ?? "")
      .replace(/https?:\/\/[^\s]+/gi, "[url]")
      .replace(/[\r\n\t]+/g, " ")
      .slice(0, 240);
    await browserStackCommand(page, {
      action: "setSessionStatus",
      arguments: { status, reason }
    }).catch(() => undefined);
  }
});

export { expect };
