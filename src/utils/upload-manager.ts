import { IfcParser } from '@ifc-lite/parser';

import apiClient from './api-client';
import { extractAndTransform } from './ifc-transformer';

export interface UploadOptions {
  onProgress?: (progress: number) => void;
  onSuccess?: () => void;
  onError?: (error: any) => void;
}

export async function handleIfcUpload(file: File, options: UploadOptions): Promise<void> {
  const { onProgress, onSuccess, onError } = options;

  try {
    // 1. Parse IFC file in the browser
    onProgress?.(10);
    const buffer = await file.arrayBuffer();
    const parser = new IfcParser();

    onProgress?.(20);
    const store = await parser.parseColumnar(buffer, {
      onProgress: (p) => {
        // Mapping parsing progress (0-100) to 20-60 range of total progress
        onProgress?.(20 + Math.round(p.percent * 0.4));
      },
    });

    // 2. Upload raw file to S3
    onProgress?.(70);
    const model = await apiClient.uploadModel(file);

    // 3. Transform and upload structured data
    onProgress?.(85);
    const payload = extractAndTransform(store);
    await apiClient.uploadModelData(model.id, payload);

    onProgress?.(100);
    onSuccess?.();
  } catch (error) {
    console.error('Upload error:', error);
    onError?.(error);
  }
}
