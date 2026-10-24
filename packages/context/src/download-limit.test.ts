import { existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("downloadPackage size limit", () => {
  let testHome: string;

  beforeEach(() => {
    testHome = join(
      tmpdir(),
      `context-download-home-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    process.env.CONTEXT_MAX_DOWNLOAD_BYTES = "10";
    vi.doMock("node:os", async () => {
      const actual = await vi.importActual<typeof import("node:os")>("node:os");
      return { ...actual, homedir: () => testHome };
    });
  });

  afterEach(() => {
    delete process.env.CONTEXT_MAX_DOWNLOAD_BYTES;
    vi.unstubAllGlobals();
    vi.doUnmock("node:os");
    vi.resetModules();
    if (existsSync(testHome)) {
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  it("rejects an oversized declared Content-Length before writing", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(body, { headers: { "content-length": "11" } }),
        ),
      ),
    );
    const { downloadPackage } = await import("./download.js");

    await expect(
      downloadPackage("https://registry.example", "npm", "large", "1.0.0"),
    ).rejects.toThrow("Download size 11 exceeds the 10 byte limit");

    expect(cancelled).toBe(true);
    expect(existsSync(join(testHome, ".context", "packages"))).toBe(false);
  });

  it("aborts a chunked response after its streamed bytes exceed the limit", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(11));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body)),
    );
    const { downloadPackage } = await import("./download.js");

    await expect(
      downloadPackage("https://registry.example", "npm", "large", "1.0.0"),
    ).rejects.toThrow("Download exceeded the 10 byte size limit");

    expect(cancelled).toBe(true);
    const packagesDir = join(testHome, ".context", "packages");
    expect(readdirSync(packagesDir)).toEqual([]);
  });

  it("rejects an invalid configured limit before fetching", async () => {
    process.env.CONTEXT_MAX_DOWNLOAD_BYTES = "unlimited";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { downloadPackage } = await import("./download.js");

    await expect(
      downloadPackage("https://registry.example", "npm", "large", "1.0.0"),
    ).rejects.toThrow(
      "CONTEXT_MAX_DOWNLOAD_BYTES must be a positive integer byte count",
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the default limit when the configured value is blank", async () => {
    process.env.CONTEXT_MAX_DOWNLOAD_BYTES = "  ";
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(body, {
            headers: { "content-length": "536870913" },
          }),
      ),
    );
    const { downloadPackage } = await import("./download.js");

    await expect(
      downloadPackage("https://registry.example", "npm", "large", "1.0.0"),
    ).rejects.toThrow(
      "Download size 536870913 exceeds the 536870912 byte limit",
    );
  });
});
