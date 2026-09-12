import { expect, navigateMobile, test } from "./fixtures.mjs";

test("Veröffentlichte Blogs lassen sich mit aktivem Konto suchen und vollständig lesen", async ({ privateApp }, testInfo) => {
  const { page } = privateApp;
  const before = await page.evaluate(() => localStorage.getItem("kd:artikel"));
  const reads = [];
  await page.route("https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/kd_list_shared_articles", async (route) => {
    const request = route.request();
    reads.push({ method: request.method(), authorization: request.headers().authorization, body: request.postDataJSON() });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{
      publication_id: "11111111-1111-4111-8111-111111111111",
      share_token: "22222222-2222-4222-8222-222222222222",
      article_id: "synthetic-published-blog", author: "Max", updated_at: "2026-08-02T21:20:58Z",
      payload: { titel: "Test Blog-Sharing", autor: "Max", erstellt_am: "2026-08-02T21:20:23Z",
        text: "Ein veröffentlichter Testabsatz.\n\nDieser zweite Absatz gehört zur vollständigen Leseansicht.",
        liste: [{ eingabe: "Alien", jahr: 1979 }], geordnet: true },
    }]) });
  });
  await navigateMobile(page, "Entdecken");
  await page.getByRole("button", { name: "Blog", exact: true }).click();
  await expect(page.getByRole("button", { name: "Meine Artikel", exact: true })).toBeVisible();
  expect(reads).toHaveLength(0);
  await page.getByRole("button", { name: "Veröffentlicht", exact: true }).click();
  const list = page.getByRole("region", { name: "Veröffentlichte Blogs" });
  await list.getByRole("searchbox", { name: "Nach Titel oder Autor suchen" }).fill("test blog-sharing");
  await expect(list.getByRole("heading", { name: "Test Blog-Sharing", exact: true })).toBeVisible();
  await list.getByRole("button", { name: "Test Blog-Sharing lesen" }).click();
  const reader = page.locator(".kd-blog-leseansicht");
  await expect(reader.getByRole("heading", { name: "Test Blog-Sharing", exact: true })).toBeVisible();
  await expect(reader).toContainText("Dieser zweite Absatz gehört zur vollständigen Leseansicht.");
  await expect(reader).toContainText("Alien (1979)");
  await expect(reader.getByRole("button")).toHaveCount(1);
  await expect(reader.getByRole("button", { name: /Bearbeiten/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ Neuer Artikel", exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("veroeffentlichter-blog-mobil.png"), fullPage: true });
  await reader.getByRole("button", { name: "← Veröffentlicht", exact: true }).click();
  await expect(list.getByRole("searchbox")).toHaveValue("test blog-sharing");
  await page.getByRole("button", { name: "Meine Artikel", exact: true }).click();
  await expect(page.locator(".kd-blog-karte").filter({ hasText: "Privatrelease Artikel" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("kd:artikel"))).toBe(before);
  expect(reads).toEqual([{ method: "POST", authorization: "Bearer synthetic-private-v1-access", body: {} }]);
});

test("Ein Konto ohne positive Geschmackssignale sieht beliebte Titel und keine grundlosen persönlichen Karten", async ({ privateApp }, testInfo) => {
  const { page } = privateApp;
  await navigateMobile(page, "Entdecken");
  await page.getByRole("button", { name: "Empfehlungen", exact: true }).click();
  const recommendations = page.getByRole("region", { name: "Für mich", exact: true });
  await expect(recommendations).toContainText("Noch keine persönliche Passung im aktuellen Angebot.");
  await expect(recommendations.locator(".kd-entdecken-auswahlkarte")).toHaveCount(0);
  await expect(recommendations.locator(".kd-entdecken-beliebtliste article").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("empfehlungen-ohne-profil-mobil.png"), fullPage: true });
});
