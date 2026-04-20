/**
 * Asset descriptor and adapter contract types.
 *
 * INTENT: Shared binary asset boundary — portable types for cross-host asset exchange.
 * INPUT: None (pure type definitions)
 * OUTPUT: AssetDescriptor, AssetIOAdapter types
 * SIDE EFFECT: None
 * FAILURE: N/A — compile-time only
 */

/** Portable binary payload type used at shared package boundaries. */
export type BinaryPayload = ArrayBuffer | Uint8Array;

/** Minimal standardized metadata for an asset result. */
export interface AssetMetadata {
  readonly mimeType: string;
  readonly byteLength: number;
  readonly width?: number;
  readonly height?: number;
  readonly thumbnailRef?: string;
}

/**
 * Shared asset result envelope.
 *
 * Hosts return their own opaque reference format inside this envelope.
 * Shared runtime code relies only on standardized metadata and declared adapter operations.
 */
export interface AssetDescriptor {
  /** Host-owned opaque reference (e.g. blob URL, file handle, layer ref). */
  readonly ref: unknown;
  /** Standardized metadata for the asset. */
  readonly metadata: AssetMetadata;
}

/**
 * Host-agnostic adapter interface for binary asset read/write.
 *
 * All file or host document access flows through implementations of this contract.
 * The engine and workflows depend on this interface, never on DOM / Node.js / UXP FS APIs.
 */
export interface AssetIOAdapter {
  /**
   * Read binary data from a host-defined source reference.
   *
   * INTENT: Convert host-native asset into portable binary payload.
   * FAILURE: Throws or returns structured asset_io_error / host_capability_error.
   */
  read(sourceRef: unknown): Promise<{ data: BinaryPayload; descriptor: AssetDescriptor }>;

  /**
   * Write binary data to a host-defined target.
   *
   * INTENT: Persist generated output through host-specific mechanism.
   * FAILURE: Throws or returns structured asset_io_error / host_capability_error.
   */
  write(data: BinaryPayload, target: unknown): Promise<AssetDescriptor>;
}
