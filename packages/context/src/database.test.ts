import { afterEach, describe, expect, it, vi } from "vitest";
import { loadNativeDriver } from "./database.js";

describe("loadNativeDriver", () => {
  const failing = () => {
    throw new Error("no native binding");
  };

  afterEach(() => vi.restoreAllMocks());

  it("returns the driver when it loads", () => {
    const driver = {};
    expect(loadNativeDriver("1", () => driver)).toBe(driver);
  });

  it("falls back with a warning when the driver is unavailable", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(loadNativeDriver(undefined, failing)).toBeNull();
    expect(loadNativeDriver("0", failing)).toBeNull();
    expect(loadNativeDriver("", failing)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("no native binding"),
    );
  });

  it("fails closed when CONTEXT_REQUIRE_NATIVE_SQLITE is set", () => {
    for (const flag of ["1", "true", " TRUE "]) {
      expect(() => loadNativeDriver(flag, failing)).toThrow(
        /CONTEXT_REQUIRE_NATIVE_SQLITE is set: no native binding/,
      );
    }
  });
});
