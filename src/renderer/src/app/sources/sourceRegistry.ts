import type { ISource, SourceType } from "./ISource";

export type SourceFactory = (args: {
  id: string;
  label?: string;
  options?: Record<string, unknown>;
}) => ISource;

const registry = new Map<SourceType, SourceFactory>();

export function registerSource(type: SourceType, factory: SourceFactory): void {
  registry.set(type, factory);
}

export function createSource(
  type: SourceType,
  args: { id: string; label?: string; options?: Record<string, unknown> },
): ISource {
  const factory = registry.get(type);
  if (!factory)
    throw new Error(`No factory registered for source type: ${type}`);
  return factory(args);
}
