/// <reference types="vite/client" />

declare module 'react-easy-crop' {
  import { Component } from 'react';

  export interface Area {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export interface Crop {
    x: number;
    y: number;
  }

  export interface CropperProps {
    image: string;
    crop: Crop;
    zoom: number;
    aspect?: number;
    onCropChange: (crop: Crop) => void;
    onZoomChange: (zoom: number) => void;
    onCropComplete?: (croppedArea: Area, croppedAreaPixels: Area) => void;
    cropShape?: 'rect' | 'round';
    showGrid?: boolean;
    restrictPosition?: boolean;
    minZoom?: number;
    maxZoom?: number;
    style?: React.CSSProperties;
    classes?: {
      containerClassName?: string;
      mediaClassName?: string;
    };
  }

  export default class Cropper extends Component<CropperProps> {}
}

declare module 'browser-image-compression' {
  export interface Options {
    maxSizeMB?: number;
    maxWidthOrHeight?: number;
    useWebWorker?: boolean;
    fileType?: string;
    initialQuality?: number;
    alwaysKeepResolution?: boolean;
  }

  export default function imageCompression(file: File, options?: Options): Promise<File>;
}
