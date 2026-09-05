import { describe, it, expect } from "vitest";
import {
  detectFormatFromSignature,
  validateAndProbeMedia,
  MAX_IMAGE_SIZE_BYTES,
} from "./media-validation";

describe("Media Validation & Signature Detection (R16, R17, R21)", () => {
  it("correctly identifies PNG magic bytes", () => {
    const pngHeader = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    expect(detectFormatFromSignature(pngHeader)).toBe("image/png");
  });

  it("correctly identifies JPEG magic bytes", () => {
    const jpegHeader = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    expect(detectFormatFromSignature(jpegHeader)).toBe("image/jpeg");
  });

  it("correctly identifies WebP magic bytes (RIFF ... WEBP)", () => {
    const webpHeader = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(detectFormatFromSignature(webpHeader)).toBe("image/webp");
  });

  it("correctly identifies MP4 ftyp signature at offset 4", () => {
    const mp4Header = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
    ]);
    expect(detectFormatFromSignature(mp4Header)).toBe("video/mp4");
  });

  it("returns null for unknown file signatures", () => {
    const randomHeader = new Uint8Array([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
    ]);
    expect(detectFormatFromSignature(randomHeader)).toBeNull();
  });

  it("returns null for truncated buffers shorter than 12 bytes", () => {
    const shortHeader = new Uint8Array([0x89, 0x50, 0x4e]);
    expect(detectFormatFromSignature(shortHeader)).toBeNull();
  });

  it("rejects empty files (0 bytes)", async () => {
    const emptyFile = new File([], "empty.png", { type: "image/png" });
    const result = await validateAndProbeMedia(emptyFile);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errorCode).toBe("empty-file");
    }
  });

  it("rejects files exceeding image size budget (> 10 MB)", async () => {
    const pngHeader = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const largeContent = new Uint8Array(MAX_IMAGE_SIZE_BYTES + 1024);
    largeContent.set(pngHeader, 0);

    const file = new File([largeContent], "huge.png", { type: "image/png" });
    const result = await validateAndProbeMedia(file);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errorCode).toBe("file-too-large");
      expect(result.errorMessage).toContain("10 MB");
    }
  });

  it("rejects files with invalid header signatures", async () => {
    const invalidContent = new Uint8Array([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    const file = new File([invalidContent], "fake.png", { type: "image/png" });
    const result = await validateAndProbeMedia(file);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errorCode).toBe("unsupported-format");
    }
  });

  it("successfully validates a legitimate PNG file buffer", async () => {
    const pngContent = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    ]);
    const file = new File([pngContent], "valid.png", { type: "image/png" });
    const result = await validateAndProbeMedia(file);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.mediaType).toBe("image");
      expect(result.mimeType).toBe("image/png");
      expect(result.sizeBytes).toBe(pngContent.length);
    }
  });

  it("successfully validates a legitimate MP4 video buffer", async () => {
    const mp4Content = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
      0x00, 0x00, 0x00, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32,
    ]);
    const file = new File([mp4Content], "sample.mp4", { type: "video/mp4" });
    const result = await validateAndProbeMedia(file);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.mediaType).toBe("video");
      expect(result.mimeType).toBe("video/mp4");
      expect(result.durationSeconds).toBeDefined();
    }
  });
});
