import { expect, navigateMobile, test as fixtureTest } from "./fixtures.mjs";

const VIEWPORTS = [{ name: "320x640", width: 320, height: 640 }, { name: "393x852", width: 393, height: 852 }, { name: "430x932", width: 430, height: 932 }];
const frames = (page, count = 3) => page.evaluate((total) => new Promise((resolve) => { let remaining = total; const next = () => { remaining -= 1; remaining > 0 ? requestAnimationFrame(next) : resolve(); }; requestAnimationFrame(next); }), count);

const test = fixtureTest.extend({
  privateViewportApp: async ({ privateApp }, use) => {
    const { page } = privateApp;
    await page.addInitScript(() => {
      const listeners = new Map();
      const viewport = {
        width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1,
        addEventListener(type, listener) { const set = listeners.get(type) || new Set(); set.add(listener); listeners.set(type, set); },
        removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
        __set(next) { Object.assign(viewport, next); for (const type of ["resize", "scroll"]) listeners.get(type)?.forEach((listener) => listener(new Event(type))); },
      };
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
      window.__kdDesignViewport = viewport;
    });
    await page.reload();
    await expect(page.locator(".kd-app")).toBeVisible();
    await use({ page });
  },
});

const touchMovePrevented = (locator, deltaY, fingers = 1) => locator.evaluate((element, { deltaY: movement, fingers: count }) => {
  const send = (type, y) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: Array.from({ length: count }, (_, identifier) => ({ identifier, target: element, clientX: 100, clientY: y })) });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  };
  send("touchstart", 100);
  return send("touchmove", 100 + movement);
}, { deltaY, fingers });

for (const viewport of VIEWPORTS) {
  test(`D4 Suchrahmen und Menü sind bei ${viewport.name} vollständig bedienbar`, async ({ privateApp }) => {
    const { page } = privateApp;
    await page.setViewportSize(viewport);
    if (viewport.width === 393) {
      await navigateMobile(page, "Settings");
      await page.getByRole("button", { name: "Groß", exact: true }).click();
      await navigateMobile(page, "Start");
    }
    const suche = page.getByRole("search", { name: "Globale Suche in allen Bereichen" });
    await expect(suche).toBeVisible();
    for (const control of [suche.getByRole("textbox", { name: "Sucheingabe" }), suche.getByRole("button", { name: "Suchen" }), suche.getByRole("button", { name: "Menü öffnen" })]) {
      const box = await control.boundingBox();
      expect(box, "Shell-Control hat eine Box").not.toBeNull();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    if (viewport.width === 393) expect(await suche.getByRole("textbox", { name: "Sucheingabe" }).evaluate((input) => Number.parseFloat(getComputedStyle(input).fontSize))).toBeGreaterThanOrEqual(17.92);
    await suche.getByRole("button", { name: "Menü öffnen" }).click();
    const menu = page.getByRole("dialog", { name: "Menü" });
    for (const area of ["Start", "Kino", "Mediathek", "Streaming", "Entdecken", "Settings"]) await expect(menu.getByRole("button", { name: area, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });
}

test("D4 PWA-Keyboard-Anker, Gesten, Ergebnis-Scroll und Handoffs bleiben im privaten Mockkonto erhalten", async ({ privateViewportApp }, testInfo) => {
  const { page } = privateViewportApp;
  await navigateMobile(page, "Settings");
  await page.getByRole("button", { name: "Groß", exact: true }).click();
  await navigateMobile(page, "Start");
  const suche = page.getByRole("search", { name: "Globale Suche in allen Bereichen" });
  const input = suche.getByRole("textbox", { name: "Sucheingabe" });
  const searchButton = suche.getByRole("button", { name: "Suchen" });
  const menuButton = suche.getByRole("button", { name: "Menü öffnen" });
  const form = page.locator(".kd-globalsuche");
  expect(await input.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(17.92);
  await expect.poll(() => page.evaluate(() => window.__kdDesignViewport?.height)).toBe(852);
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.dataset.p3ScrollRestoreProbe = "";
    spacer.style.height = "1200px";
    spacer.setAttribute("aria-hidden", "true");
    document.body.append(spacer);
  });
  await frames(page, 4);
  await page.evaluate(() => window.scrollTo(0, Math.min(180, document.documentElement.scrollHeight - innerHeight)));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(180);
  const scrollBeforeKeyboard = await page.evaluate(() => window.scrollY);
  expect(scrollBeforeKeyboard).toBeGreaterThan(0);

  const inputBox = await input.boundingBox();
  expect(inputBox).not.toBeNull();
  await page.mouse.click(inputBox.x + inputBox.width / 2, inputBox.y + inputBox.height / 2);
  await frames(page, 4);
  await expect(form).not.toHaveClass(/tastatur-offen/);
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.evaluate(() => window.__kdDesignViewport.__set({ height: 500, offsetTop: 60, width: 393, scale: 1 }));
  await expect(form).toHaveClass(/tastatur-offen/);
  const anchor = () => form.evaluate((element) => Math.round(element.getBoundingClientRect().bottom - window.visualViewport.offsetTop - window.visualViewport.height));
  await expect.poll(anchor).toBe(-8);
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("fixed");
  expect(await touchMovePrevented(page.locator("main"), -30)).toBe(true);
  expect(await touchMovePrevented(page.locator("main"), -30, 2)).toBe(false);
  await page.evaluate(() => window.__kdDesignViewport.__set({ height: 500, offsetTop: 140, width: 393, scale: 1 }));
  await expect.poll(anchor).toBe(-8);
  await input.blur();
  await page.evaluate(() => window.__kdDesignViewport.__set({ height: 852, offsetTop: 0, width: 393, scale: 1 }));
  await expect(form).not.toHaveClass(/tastatur-offen/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBeforeKeyboard);
  expect(await touchMovePrevented(page.locator("main"), -30)).toBe(false);

  await input.focus();
  await frames(page, 4);
  await page.evaluate(() => window.__kdDesignViewport.__set({ height: 500, offsetTop: 60, width: 393, scale: 1 }));
  await expect(form).toHaveClass(/tastatur-offen/);
  await input.fill("Netflix");
  await searchButton.click();
  const antwort = page.getByRole("dialog", { name: /Suchergebnisse für Netflix/ });
  await expect(antwort).toBeVisible();
  await page.evaluate(() => window.__kdDesignViewport.__set({ height: 260, offsetTop: 60, width: 393, scale: 1 }));
  await expect.poll(anchor).toBe(-8);
  const visible = await suche.evaluate((element) => {
    const viewport = window.visualViewport;
    return ["input", ".kd-globalsuche-los", ".kd-globalsuche-menu", ".kd-globalsuche-antwort", ".kd-globalsuche-schliessen"].every((selector) => {
      const rect = element.querySelector(selector).getBoundingClientRect();
      return rect.top >= viewport.offsetTop && rect.bottom <= viewport.offsetTop + viewport.height && rect.left >= viewport.offsetLeft && rect.right <= viewport.offsetLeft + viewport.width;
    });
  });
  expect(visible).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("p3-search-dark-vv260.png") });
  const scroll = await antwort.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY }));
  expect(scroll.overflowY).toBe("auto");
  expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
  await antwort.evaluate((element) => { element.scrollTop = 0; });
  expect(await touchMovePrevented(antwort, 30)).toBe(true);
  expect(await touchMovePrevented(antwort, -30)).toBe(false);
  await antwort.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  expect(await touchMovePrevented(antwort, -30)).toBe(true);
  expect(await touchMovePrevented(antwort, 30)).toBe(false);

  await antwort.getByRole("button", { name: "Suchergebnisse schließen" }).click();
  await expect(input).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("fixed");
  await searchButton.click();
  const treffer = page.getByRole("dialog", { name: /Suchergebnisse für Netflix/ }).locator("[data-globaler-suchtreffer]").first();
  await treffer.click();
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("");
  await expect(page.getByRole("dialog", { name: /Suchergebnisse für Netflix/ })).toBeHidden();
});

test("D4 PWA-Menü, Rotation und Zoom geben den Tastatur-Lock frei", async ({ privateViewportApp }) => {
  const { page } = privateViewportApp;
  await navigateMobile(page, "Settings");
  await page.getByRole("button", { name: "Groß", exact: true }).click();
  await navigateMobile(page, "Start");
  const form = page.locator(".kd-globalsuche");
  const input = form.getByRole("textbox", { name: "Sucheingabe" });
  const menuButton = form.getByRole("button", { name: "Menü öffnen" });
  const openKeyboard = async () => {
    // Each scenario starts with the keyboard actually dismissed and uses a
    // native pointer/focus sequence, independent of another view's autofocus.
    await input.blur();
    await page.evaluate(() => window.__kdDesignViewport.__set({ height: 852, offsetTop: 0, width: 393, scale: 1 }));
    await frames(page, 4);
    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(input).toBeFocused();
    await frames(page, 4);
    await page.evaluate(() => window.__kdDesignViewport.__set({ height: 260, offsetTop: 60, width: 393, scale: 1 }));
    await expect(form).toHaveClass(/tastatur-offen/);
    await expect.poll(() => form.evaluate((element) => Math.round(element.getBoundingClientRect().bottom - visualViewport.offsetTop - visualViewport.height))).toBe(-8);
  };
  await openKeyboard();
  await menuButton.click();
  await expect(page.getByRole("dialog", { name: "Menü" })).toBeVisible();
  await page.evaluate(() => window.__kdDesignViewport.__set({ height: 852, offsetTop: 0, width: 393, scale: 1 }));
  await frames(page, 4);
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("");

  await openKeyboard();
  await page.setViewportSize({ width: 852, height: 393 });
  await page.evaluate(() => window.__kdDesignViewport.__set({ height: 393, offsetTop: 0, width: 852, scale: 1 }));
  await expect(form).not.toHaveClass(/tastatur-offen/);
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("");
  await page.setViewportSize({ width: 393, height: 852 });
  await openKeyboard();
  await page.evaluate(() => window.__kdDesignViewport.__set({ height: 260, offsetTop: 0, width: 393, scale: 1.35 }));
  await expect(form).not.toHaveClass(/tastatur-offen/);
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("");
});

test("D5 helle Shell bleibt vollständig sichtbar", async ({ privateApp }, testInfo) => {
  const { page } = privateApp;
  await page.setViewportSize({ width: 393, height: 852 });
  await navigateMobile(page, "Settings");
  await page.getByRole("button", { name: "Foyer (hell)", exact: true }).click();
  await expect(page.locator(".kd-app")).toBeVisible();
  await expect.poll(() => page.locator("html").getAttribute("data-kd-theme")).toBe("hell");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--kd-saal").trim())).toBe("#EDEAE3");
  await page.screenshot({ path: testInfo.outputPath("p3-shell-hell.png") });
});

test("D5 Login bleibt vollständig sichtbar", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem("kd:einstellungen", JSON.stringify({ theme: "hell", startTab: "start", schrift: "normal", modus: "" })); localStorage.setItem("kd:einstieg", JSON.stringify({ version: "private-v1", abgeschlossen: false, weg: "gast" })); });
  await page.goto("/");
  const login = page.locator(".kd-entry");
  await expect(login).toBeVisible();
  const marke = login.locator(".kd-entry-head h1");
  await expect(marke).toBeVisible();
  const markeStil = await marke.evaluate((element) => ({ family: getComputedStyle(element).fontFamily, weight: getComputedStyle(element).fontWeight, size: Number.parseFloat(getComputedStyle(element).fontSize) }));
  expect(markeStil.family).toContain("Fraunces");
  expect(markeStil.weight).toBe("900");
  expect(markeStil.size).toBeGreaterThanOrEqual(38);
  await expect(login.getByRole("button", { name: "Anmelden" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("p3-login.png") });
});
