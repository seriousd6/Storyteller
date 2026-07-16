import { test, expect } from '@playwright/test';

// Earth — 2026 is built in the BROWSER now (owner: "why are we still using
// bake"; "everything should be in browser so the end user experience is what we
// build on"; "point it at the workers, no more drift").
//
// This is the test that makes "no drift" a fact rather than a claim. The bake
// and the browser were never SUPPOSED to disagree before either, and they
// disagreed three ways — China/India/USA had no roads for months, the browser
// read 1,500 cities as 3 towns and 3,260 villages, and the bake's road pass
// could not see the 2,012 feeder villages the bake itself had just created.
// Every one shipped, because a wrong world is still a perfectly valid world and
// nothing anywhere throws.
//
// So: a real user picking 🌎 Real Earth in a real browser, held to the census
// the bake prints. Nothing here mocks anything.

test.describe('Earth — 2026 builds in the browser (owner: no more drift)', () => {
  // ~45s of real generation in the worker, plus the app's own boot
  test.setTimeout(300_000);

  test('picking 🌎 Real Earth builds the real Earth, not an invented one', async ({ page }) => {
    await page.goto('/world/');
    await page.getByRole('button', { name: 'New', exact: true }).click();

    await page.locator('#nwName').fill('My Earth');
    await page.locator('#nwLandform').selectOption('earth');
    await page.locator('#nwSeed').fill(''); // blank = the canonical Earth
    await page.waitForTimeout(400);

    await page.locator('#nwCreate').click();
    // the tree only fills once the world is written — this IS the ~45s build
    await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 280_000 });

    const probe = await page.evaluate(async () => {
      // Read the world the app actually SAVED, straight out of its IndexedDB
      // ('stb:everdeep' / 'worlds'). The app keeps WORLD module-scope and does
      // not put it on window, and adding a hook just so a test can peek would be
      // shipping test scaffolding to users.
      const w = await new Promise<Record<string, any> | null>((resolve) => {
        const req = indexedDB.open('stb:everdeep', 1);
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const all = req.result.transaction('worlds', 'readonly').objectStore('worlds').getAll();
          all.onerror = () => resolve(null);
          all.onsuccess = () => {
            const worlds = all.result as Array<Record<string, any>>;
            resolve(worlds.find((x) => x.name === 'My Earth') ?? null);
          };
        };
      });
      if (!w) return null;
      const ents = Object.values(w.entities) as Array<Record<string, any>>;
      const plane = w.planes[0];
      const settlements = ents.filter((e) => e.kind === 'settlement');
      const ROADS = new Set(['highway', 'road', 'dirt', 'path']);
      return {
        name: w.name,
        seed: w.seed,
        settlements: settlements.length,
        regions: ents.filter((e) => e.kind === 'region').length,
        biomes: ents.filter((e) => e.kind === 'biome').length,
        rulers: ents.filter((e) => e.kind === 'person' && (e.tags ?? []).includes('ruler')).length,
        claims: Object.keys(plane.claims ?? {}).length,
        roads: (plane.routes ?? []).filter((r: Record<string, unknown>) => ROADS.has(String(r.kind))).length,
        rivers: (plane.routes ?? []).filter((r: Record<string, unknown>) => r.kind === 'river').length,
        anchors: (plane.anchors ?? []).length,
        party: !!plane.party,
        // a fantasyfied real city is the whole point: real coordinates, invented
        // name. The procedural path can't produce these.
        sample: settlements.slice(0, 3).map((e) => e.name),
      };
    });

    expect(probe, 'the app exposes no world — did creation fail?').not.toBeNull();
    const p = probe!;
    console.log(`  the BROWSER built: ${p.settlements} settlements, ${p.regions} regions, ${p.claims} realms with land, ${p.roads} roads, ${p.rivers} rivers`);
    console.log(`  e.g. ${p.sample.join(' · ')}`);

    // the user's own name and world, not the demo's
    expect(p.name).toBe('My Earth');
    expect(p.seed).toBe('earth');

    // ...but the demo's WORLD. These are the bake's printed census:
    //   1500 cities + 2012 feeder villages = 3512 settlements
    //   245 realms + 6 continents = 251 regions; 94 named features; 233 rulers
    expect(p.settlements).toBe(3512);
    expect(p.regions).toBe(251);
    expect(p.biomes).toBe(94);
    expect(p.rulers).toBe(233);
    expect(p.claims).toBe(182);
    expect(p.party).toBe(true);
    // THE REGRESSION this whole batch exists for: roads across the whole planet.
    // The bake skipped every country over 40 settlements as "too slow", so China,
    // India and the USA had none at all.
    expect(p.roads).toBe(1255);
    expect(p.rivers).toBeGreaterThan(400);
  });
});
