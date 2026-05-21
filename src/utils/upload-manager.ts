import { IfcParser } from '@ifc-lite/parser';

import { listRules } from '../features/rulebook/api';
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

    // Fetch Lexicon profile for filtering
    let profile;
    try {
      const rules = await listRules();
      const ruleIds = rules.map((r) => r.rule_id);

      if (ruleIds.length > 0) {
        const response = await apiClient.deriveLexiconProfile({
          ontology_family: 'fbo',
          country: 'dk',
          version: 'latest',
          rule_ids: ruleIds,
        });
        profile = response.profile;
      }
    } catch (e) {
      console.warn('Failed to fetch Lexicon profile, proceeding without filtering:', e);
    }

    const payload = extractAndTransform(store, profile);
    await apiClient.uploadModelData(model.id, payload);

    onProgress?.(100);
    onSuccess?.();
  } catch (error) {
    console.error('Upload error:', error);
    onError?.(error);
  }
}
