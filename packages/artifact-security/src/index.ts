/**
 * @studio137/artifact-security
 *
 * Mandatory scrubbing and scanning for public artifacts. Public exports run
 * through here before release; a failing scan blocks the export (spec §24).
 */

export * from "./scanner.js";
