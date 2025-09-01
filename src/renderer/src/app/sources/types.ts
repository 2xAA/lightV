export type DescriptorOptionsBase = {
  fillMode?: "cover" | "contain" | "stretch";
};

export type ImageSourceDescriptor = {
  type: "image";
  label: string;
  dataUrl: string; // persisted as data URL for now (could be file path later)
  options?: DescriptorOptionsBase;
};

export type SyphonSourceDescriptor = {
  type: "syphon";
  label: string;
  serverIndex: number;
  options?: DescriptorOptionsBase;
};

export type VideoSourceDescriptor = {
  type: "video";
  label: string;
  dataUrl: string;
  options?: DescriptorOptionsBase & {
    loop?: boolean;
    muted?: boolean;
    playbackRate?: number; // 1.0 is normal speed
  };
};

export type WebcamSourceDescriptor = {
  type: "webcam";
  label: string;
  deviceId?: string;
  options?: DescriptorOptionsBase;
};

export type ShaderSourceDescriptor = {
  type: "shader";
  label: string;
  frag: string;
  options?: DescriptorOptionsBase;
};

export type SourceDescriptor =
  | ImageSourceDescriptor
  | SyphonSourceDescriptor
  | VideoSourceDescriptor
  | WebcamSourceDescriptor
  | ShaderSourceDescriptor;
