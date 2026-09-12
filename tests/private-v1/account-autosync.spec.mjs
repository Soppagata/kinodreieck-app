import { expect, navigateMobile, test } from "./fixtures.mjs";
import { PERSONAL_DATA_KEYS } from "../../src/lib/personalDataRegistry.js";

async function personalServer(page) {
  const values = await page.evaluate((keys) => keys.map((key) => [key, localStorage.getItem(key)]), PERSONAL_DATA_KEYS);
  const rows = new Map(values.filter(([, value]) => value != null)
    .map(([key, value]) => [key, { key, value, revision: 1 }]));
  let offline = false;
  await page.route("https://abcdefghijklmnopqrst.supabase.co/rest/v1/kd_personal**", async (route) => {
    if (offline) return route.abort("internetdisconnected");
    const request = route.request(), url = new URL(request.url());
    const key = url.searchParams.get("key")?.replace(/^eq\./u, "");
    let body, status = 200;
    if (request.method() === "GET") body = key ? (rows.has(key) ? [rows.get(key)] : []) : [...rows.values()];
    else {
      const payload = request.postDataJSON();
      const target = payload.key || key, previous = rows.get(target);
      if (request.method() === "POST" && previous) { status = 409; body = {}; }
      else if (request.method() === "PATCH" && url.searchParams.get("revision") !== `eq.${previous?.revision}`) body = [];
      else {
        const row = { key: target, value: payload.value, revision: (previous?.revision || 0) + 1 };
        rows.set(target, row); body = [row];
      }
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("kd:acct:ver") || "{}")["kd:master"])).toBe(1);
  return { rows, offline(value) { offline = value; } };
}

test("Kontopull zeigt neue Einträge ohne Reload und bewahrt den offenen Formularentwurf", async ({ privateApp }) => {
  const { page } = privateApp;
  const server = await personalServer(page);
  await navigateMobile(page, "Mediathek");
  await page.getByRole("button", { name: "+ Eintrag hinzufügen", exact: true }).click();
  const title = page.getByPlaceholder("Titel *", { exact: true });
  await title.fill("Mein noch ungespeicherter Entwurf");
  const current = server.rows.get("kd:master"), master = JSON.parse(current.value);
  master.filme.push({ ...master.filme[0], id: "anderes-geraet", titel: "Vom zweiten Gerät", jahr: 2026 });
  server.rows.set("kd:master", { ...current, value: JSON.stringify(master), revision: 2 });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator('[data-film-id="anderes-geraet"]')).toBeVisible();
  await expect(title).toHaveValue("Mein noch ungespeicherter Entwurf");
  expect(JSON.parse(server.rows.get("kd:master").value).filme.some((film) => film.titel === "Mein noch ungespeicherter Entwurf")).toBe(false);
});

test("UI-Eintrag samt Bewertung erreicht nach Netzrückkehr das Konto und überlebt Reload", async ({ privateApp }) => {
  const { page } = privateApp;
  const server = await personalServer(page);
  await navigateMobile(page, "Mediathek");
  await page.getByRole("button", { name: "+ Eintrag hinzufügen", exact: true }).click();
  await page.getByPlaceholder("Titel *", { exact: true }).fill("Offline Kontoprobe");
  await page.getByPlaceholder("Jahr *", { exact: true }).fill("2026");
  const axes = page.locator('.kd-mediathek-neuformular input[type="number"]');
  for (let i = 0; i < 3; i++) await axes.nth(i).fill(String(i + 3));
  server.offline(true);
  await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
  await expect(page.locator(".kd-syncchip")).toContainText("ausstehend");
  expect(JSON.parse(server.rows.get("kd:master").value).filme.some((film) => film.titel === "Offline Kontoprobe")).toBe(false);
  server.offline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => JSON.parse(server.rows.get("kd:master").value).filme.filter((film) => film.titel === "Offline Kontoprobe").length).toBe(1);
  expect(JSON.parse(server.rows.get("kd:master").value).filme.find((film) => film.titel === "Offline Kontoprobe").bewertung)
    .toEqual({ wie: 3, was: 4, warum: 5 });
  expect(JSON.parse(server.rows.get("kd:master").value).filme.find((film) => film.titel === "Offline Kontoprobe").bewertet_von)
    .toBe("private-v1");
  await expect(page.locator(".kd-syncchip")).toContainText("synchron");
  await page.reload();
  await navigateMobile(page, "Mediathek");
  await expect(page.locator(".kd-karte").filter({ hasText: "Offline Kontoprobe" })).toBeVisible();
});

test("Header und Start melden terminale Speicherfehler übereinstimmend", async ({ privateApp }) => {
  const { page } = privateApp;
  await page.evaluate(() => {
    localStorage.setItem("kd:acct:status", JSON.stringify({ zuGross: { "kd:master": true } }));
    window.dispatchEvent(new Event("focus"));
  });
  await expect(page.locator(".kd-syncchip")).toContainText("Speichergrenze erreicht");
  await expect(page.locator(".kd-vertrauen")).toContainText("Speichergrenze erreicht");
  await expect(page.locator(".kd-vertrauen")).not.toContainText("synchron");
});
