import { IfcParser } from '@ifc-lite/parser';

import { components } from '@/types/api';

import apiClient from './api-client';
import { extractAndTransform } from './ifc-transformer';
type ExecutionProfile = components['schemas']['LexiconExecutionProfile'];

export interface UploadOptions {
  onProgress?: (progress: number) => void;
  onSuccess?: () => void;
  onError?: (error: any) => void;
  profile?: ExecutionProfile | any;
  profileId?: string;
}

export async function handleIfcUpload(file: File, options: UploadOptions): Promise<void> {
  const { onProgress, onSuccess, onError } = options;
  let { profile, profileId } = options;

  try {
    onProgress?.(5);
    if (profileId && profileId !== 'full-hierarchy' && !profile) {
      const response = await apiClient.getProfile(profileId);
      profile = response.profile_record.profile;
    }
    onProgress?.(10);
    const buffer = await file.arrayBuffer();
    const parser = new IfcParser();
    onProgress?.(20);
    const store = await parser.parseColumnar(buffer, {
      onProgress: (p) => {
        onProgress?.(20 + Math.round(p.percent * 0.4));
      },
    });

    onProgress?.(70);
    const model = await apiClient.uploadModel(file);
    onProgress?.(85);

    const payload = extractAndTransform(store, profile);
    await apiClient.uploadModelData(model.id, payload);

    onProgress?.(100);
    onSuccess?.();
  } catch (error) {
    console.error('Upload error:', error);
    onError?.(error);
  }
}
