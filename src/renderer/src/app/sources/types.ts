export type ImageSourceDescriptor = {
  type: "image";
  label: string;
  dataUrl: string; // persisted as data URL for now (could be file path later)
  options?: {
    fillMode?: "cover" | "contain" | "stretch";
  };
};

export type SyphonSourceDescriptor = {
  type: "syphon";
  label: string;
  serverIndex: number;
};

export type SourceDescriptor = ImageSourceDescriptor | SyphonSourceDescriptor;
