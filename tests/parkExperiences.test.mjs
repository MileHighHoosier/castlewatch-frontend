import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  isAllowedWdwItem,
  isCharacterExperienceText,
  isCharacterMeetEntity,
  normalizeExternalCharacterMeets,
  normalizeExternalShowTimes,
  sanitizeShowTimesResult,
  scheduleTimesFromItem,
} from "../app/lib/api.ts";
import {
  compareActivityPriority,
  getActivityBadges,
  getActivityUseCase,
  isActivityCandidate,
} from "../app/components/ParkCommandCenter.tsx";
import {
  isCharacterShow,
  selectUpcomingShows,
} from "../app/components/ShowTimesActivityLayer.tsx";

const NOW = new Date("2026-08-24T16:00:00.000Z");

function experience(overrides = {}) {
  return {
    id: overrides.displayName || "experience",
    displayName: "Festival of the Lion King",
    displayPark: "Animal Kingdom",
    displayWait: 10,
    displayLand: "Africa",
    is_open: true,
    ...overrides,
  };
}

function scheduledItem(overrides = {}) {
  return {
    id: overrides.name || "scheduled-item",
    name: "Festival of the Lion King",
    entityType: "SHOW",
    land: "Africa",
    status: "OPERATING",
    showtimes: [
      { startTime: "2026-08-24T17:00:00.000Z", endTime: "2026-08-24T17:30:00.000Z" },
    ],
    ...overrides,
  };
}

test("show schedules reject malformed entries, sort chronologically, and classify past times against a fixed clock", () => {
  const times = scheduleTimesFromItem({
    schedule: [
      { start: "2026-08-24T18:00:00.000Z" },
      { start: "not-a-date" },
      { start: "2026-08-24T15:00:00.000Z" },
      { start: "2026-08-24T17:00:00.000Z" },
    ],
  }, NOW);

  assert.deepEqual(times.map((time) => time.startTime), [
    "2026-08-24T15:00:00.000Z",
    "2026-08-24T17:00:00.000Z",
    "2026-08-24T18:00:00.000Z",
  ]);
  assert.deepEqual(times.map((time) => time.isPast), [true, false, false]);
});

test("external show normalization keeps timed Disney entertainment while separating characters and unrelated Orlando content", () => {
  const result = normalizeExternalShowTimes("Animal Kingdom", {
    liveData: [
      scheduledItem(),
      scheduledItem({ name: "Meet Mickey at Adventurers Outpost", entityType: "CHARACTER" }),
      scheduledItem({ name: "Meet Spider-Man", entityType: "CHARACTER", land: "Marvel Super Hero Island" }),
      scheduledItem({ name: "Seven Dwarfs Mine Train", entityType: "ATTRACTION", showtimes: [] }),
    ],
  }, "fixture", NOW);

  assert.equal(result.park, "Animal Kingdom");
  assert.equal(result.updated_at, NOW.toISOString());
  assert.deepEqual(result.shows.map((show) => show.name), ["Festival of the Lion King"]);
  assert.equal(result.shows[0].upcomingCount, 1);
});

test("character normalization accepts typed and named meet-and-greets but rejects rides and non-Disney results", () => {
  const result = normalizeExternalCharacterMeets("Magic Kingdom", {
    liveData: [
      scheduledItem({ name: "Donald Duck", entityType: "CHARACTER", land: "Storybook Circus" }),
      scheduledItem({ name: "Meet Mickey at Town Square Theater", entityType: "ATTRACTION", land: "Main Street, U.S.A." }),
      scheduledItem({ name: "Mickey's PhilharMagic", entityType: "CHARACTER", land: "Fantasyland" }),
      scheduledItem({ name: "Meet Spider-Man", entityType: "CHARACTER", land: "Marvel Super Hero Island" }),
    ],
  }, "fixture", NOW);

  assert.deepEqual(result.characters.map((character) => character.name), [
    "Donald Duck",
    "Meet Mickey at Town Square Theater",
  ]);
  assert.ok(result.characters.every((character) => character.park === "Magic Kingdom"));
});

test("character detection normalizes punctuation and whitespace without treating themed rides as meet-and-greets", () => {
  assert.equal(isCharacterExperienceText("  Meet   Disney Friends  "), true);
  assert.equal(isCharacterExperienceText("Mickey’s PhilharMagic"), false);
  assert.equal(isCharacterMeetEntity({ name: "Princess Fairytale Hall", type: "ATTRACTION" }), true);
  assert.equal(isCharacterMeetEntity({ name: "Mickey & Minnie's Runaway Railway", type: "CHARACTER" }), false);
});

test("non-Disney Orlando content fails closed in both direct and backend showtime paths", () => {
  assert.equal(isAllowedWdwItem({ name: "Hogwarts Frog Choir" }), false);
  assert.equal(isAllowedWdwItem({ name: "Disney Festival of Fantasy Parade" }), true);

  const sanitized = sanitizeShowTimesResult("Magic Kingdom", {
    park: "Wrong Park",
    shows: [
      { name: "Disney Festival of Fantasy Parade", times: [] },
      { name: "Hogwarts Frog Choir", times: [] },
    ],
  });

  assert.equal(sanitized.park, "Magic Kingdom");
  assert.deepEqual(sanitized.shows.map((show) => show.name), ["Disney Festival of Fantasy Parade"]);
});

test("the showtime card selects only upcoming non-character entertainment", () => {
  const result = {
    park: "Magic Kingdom",
    shows: [
      { name: "Festival of Fantasy Parade", times: [{ startTime: "future", isPast: false }] },
      { name: "Meet Mickey at Town Square Theater", times: [{ startTime: "future", isPast: false }] },
      { name: "Past Castle Show", times: [{ startTime: "past", isPast: true }] },
    ],
  };

  assert.equal(isCharacterShow(result.shows[1]), true);
  assert.deepEqual(selectUpcomingShows(result).map((show) => show.name), ["Festival of Fantasy Parade"]);
});

test("activity candidates include family experiences but exclude rides and single-rider entries", () => {
  assert.equal(isActivityCandidate(experience()), true);
  assert.equal(isActivityCandidate(experience({ displayName: "Journey of Water", displayLand: "World Nature" })), true);
  assert.equal(isActivityCandidate(experience({ displayName: "Seven Dwarfs Mine Train", displayLand: "Fantasyland" })), false);
  assert.equal(isActivityCandidate(experience({ displayName: "Test Track Single Rider", displayLand: "World Discovery" })), false);
});

test("seated shows retain show and cooling guidance", () => {
  const show = experience();
  assert.ok(getActivityBadges(show).includes("Show"));
  assert.ok(getActivityBadges(show).includes("A/C reset"));
  assert.equal(getActivityUseCase(show), "Seated show / A/C break.");
});

test("Disney Jr. Mickey Mouse Clubhouse Live remains a show activity", () => {
  const show = experience({
    displayName: "Disney Jr. Mickey Mouse Clubhouse Live!",
    displayPark: "Hollywood Studios",
    displayLand: "Animation Courtyard",
    displayWait: 0,
  });

  assert.equal(isActivityCandidate(show), true);
  assert.ok(getActivityBadges(show).includes("Show"));
  assert.equal(getActivityUseCase(show), "Character moment. Check timing buffer.");
});

test("kid-reset activities retain their distinct family-use guidance", () => {
  const reset = experience({ displayName: "The Boneyard", displayLand: "DinoLand U.S.A." });
  assert.ok(getActivityBadges(reset).includes("Kid reset"));
  assert.equal(getActivityUseCase(reset), "Kid reset: movement or play.");
});

test("character-themed activities stay in Activities unless they are true meet-and-greets", () => {
  const belle = experience({ displayName: "Enchanted Tales with Belle", displayLand: "Fantasyland" });
  assert.equal(isCharacterExperienceText(belle.displayName), false);
  assert.equal(isActivityCandidate(belle), true);
  assert.ok(getActivityBadges(belle).includes("Character"));
  assert.equal(getActivityUseCase(belle), "Character moment. Check timing buffer.");
});

test("activity ordering favors an open useful show over closed or scenery-only filler", () => {
  const sorted = [
    experience({ displayName: "Tree of Life", displayLand: "Discovery Island Trails", displayWait: 0 }),
    experience({ displayName: "Festival of the Lion King", is_open: false, displayWait: 0 }),
    experience({ displayName: "Festival of the Lion King", displayWait: 20 }),
  ].sort(compareActivityPriority);

  assert.equal(sorted[0].displayName, "Festival of the Lion King");
  assert.equal(sorted[0].is_open, true);
  assert.equal(sorted.at(-1).is_open, false);
});

test("show and character names remain on textContent-based rendering paths", async () => {
  const [showsSource, charactersSource] = await Promise.all([
    readFile(new URL("../app/components/ShowTimesActivityLayer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/CharacterMeetLayer.tsx", import.meta.url), "utf8"),
  ]);

  for (const source of [showsSource, charactersSource]) {
    assert.doesNotMatch(source, /dangerouslySetInnerHTML|\.innerHTML\s*=/);
  }
  assert.match(showsSource, /name\.textContent = show\.name/);
  assert.match(charactersSource, /name\.textContent = character\.name/);
});
