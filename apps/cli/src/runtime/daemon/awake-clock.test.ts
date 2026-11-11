import { expect, it } from "vite-plus/test";
import { AwakeClock } from "./awake-clock.js";

function fixture(maxStep = 10_000) {
  let wall = 1_000_000;
  const clock = new AwakeClock(maxStep, () => wall);
  return {
    clock,
    advance: (milliseconds: number) => {
      wall += milliseconds;
    },
  };
}

it("follows the wall clock while it is read regularly", () => {
  const { clock, advance } = fixture();
  expect(clock.now()).toBe(0);
  advance(5000);
  expect(clock.now()).toBe(5000);
  advance(5000);
  expect(clock.now()).toBe(10_000);
});

it("counts a suspension as one bounded step so a lease outlives it", () => {
  const { clock, advance } = fixture();
  const lease = clock.now() + 20_000;
  advance(5000);
  expect(clock.now()).toBe(5000);
  // The machine sleeps for an hour between two reads.
  advance(60 * 60 * 1000);
  expect(clock.now()).toBe(15_000);
  expect(clock.now()).toBeLessThan(lease);
});

it("still expires a lease whose holder stays silent while the process runs", () => {
  const { clock, advance } = fixture();
  const lease = clock.now() + 20_000;
  for (let tick = 0; tick < 5; tick++) {
    advance(5000);
    clock.now();
  }
  expect(clock.now()).toBeGreaterThan(lease);
});

it("never moves backwards when the wall clock is set back", () => {
  const { clock, advance } = fixture();
  advance(5000);
  expect(clock.now()).toBe(5000);
  advance(-60_000);
  expect(clock.now()).toBe(5000);
  advance(1000);
  expect(clock.now()).toBe(6000);
});
