import { afterEach, describe, expect, it } from "vitest";
import { cleanupM1Fixtures, createM1Harness, runM1FeatureToPlanned } from "../fixtures/m1.js";

afterEach(() => {
  cleanupM1Fixtures();
});

describe("M1 vertical slice baseline", () => {
  it("reaches Planned after solo governance, contract approval and plan approval", () => {
    const harness = createM1Harness();
    const change = runM1FeatureToPlanned(harness);

    expect(change?.lifecycle_state).toBe("Planned");
    expect(change?.operating_status).toBe("Active");
  });
});
