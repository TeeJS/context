/**
 * Download and install documentation packages from a registry server.
 */

import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  getPackageFileName,
  type PackageInfo,
  readPackageInfo,
} from "./store.js";

const DATA_DIR = join(homedir(), ".context", "packages");
const DEFAULT_MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024;

function getMaxDownloadBytes(): number {
  const configured = process.env.CONTEXT_MAX_DOWNLOAD_BYTES;
  if (configured === undefined) return DEFAULT_MAX_DOWNLOAD_BYTES;
  const normalized = configured.trim();
  if (normalized === "") return DEFAULT_MAX_DOWNLOAD_BYTES;

  if (!/^\d+$/.test(normalized)) {
    throw new Error(
      "CONTEXT_MAX_DOWNLOAD_BYTES must be a positive integer byte count",
    );
  }

  const maxBytes = Number(normalized);
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error(
      "CONTEXT_MAX_DOWNLOAD_BYTES must be a positive integer byte count",
    );
  }

  return maxBytes;
}

function createDownloadLimitStream(maxBytes: number): Transform {
  let downloadedBytes = 0;

  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloadedBytes += chunk.byteLength;
      if (downloadedBytes > maxBytes) {
        callback(
          new Error(`Download exceeded the ${maxBytes} byte size limit`),
        );
        return;
      }
      callback(null, chunk);
    },
  });
}

export interface SearchResultEntry {
  registry: string;
  name: string;
  version: string;
  description?: string;
  size?: number;
}

/**
 * Search for packages on a registry server.
 */
export async function searchPackages(
  serverUrl: string,
  registry: string,
  name: string,
  version?: string,
): Promise<SearchResultEntry[]> {
  const params = new URLSearchParams({ registry, name });
  if (version) params.set("version", version);

  const url = `${serverUrl}/search?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as SearchResultEntry[];
}

/**
 * Download and install a package from a registry server.
 * Returns the installed PackageInfo.
 */
export async function downloadPackage(
  serverUrl: string,
  registry: string,
  name: string,
  version: string,
): Promise<PackageInfo> {
  const maxBytes = getMaxDownloadBytes();
  const url = `${serverUrl}/packages/${encodeURIComponent(registry)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}/download`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Download failed: ${response.status} ${response.statusText}`,
    );
  }

  if (!response.body) {
    throw new Error("Download failed: no response body");
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (!/^\d+$/.test(contentLength) || !Number.isSafeInteger(declaredBytes)) {
      await response.body.cancel();
      throw new Error(
        `Download failed: invalid Content-Length ${contentLength}`,
      );
    }
    if (declaredBytes > maxBytes) {
      await response.body.cancel();
      throw new Error(
        `Download size ${declaredBytes} exceeds the ${maxBytes} byte limit`,
      );
    }
  }

  // Download to a temp file first, then validate and move
  mkdirSync(DATA_DIR, { recursive: true });
  const safeName = name.replaceAll("/", "__");
  const tempPath = join(DATA_DIR, `.downloading-${Date.now()}-${safeName}.db`);

  try {
    const fileStream = createWriteStream(tempPath);
    const { Readable } = await import("node:stream");
    const nodeStream = Readable.fromWeb(
      response.body as import("stream/web").ReadableStream,
    );
    await pipeline(nodeStream, createDownloadLimitStream(maxBytes), fileStream);

    // Validate the package
    const info = readPackageInfo(tempPath);

    // Move to final location
    const destPath = join(
      DATA_DIR,
      getPackageFileName(info.name, info.version),
    );

    if (existsSync(destPath)) {
      unlinkSync(destPath);
    }
    renameSync(tempPath, destPath);
    info.path = destPath;

    return info;
  } catch (err) {
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
    throw err;
  }
}
