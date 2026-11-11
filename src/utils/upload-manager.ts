import { components } from '@/types/api';

import apiClient, { type IngestionJob, type IfcUploadSession } from './api-client';
import { createRequestId } from './request-id';
type ExecutionProfile = components['schemas']['LexiconExecutionProfile'];

export interface UploadOptions {
  backend?: 'legacy' | 'neo';
  revisionId?: string;
  maxInputBytes?: number;
  requestId?: string;
  signal?: AbortSignal;
  onSession?: (session: IfcUploadSession) => void;
  onStage?: (stage: 'hashing' | 'transferring' | 'admitting') => void;
  onBytesProgress?: (loaded: number, total: number) => void;
  onProgress?: (progress: number) => void;
  onSuccess?: () => void;
  onError?: (error: any) => void;
  profile?: ExecutionProfile | any;
  profileId?: string;
  profileName?: string;
}

export async function handleIfcUpload(
  file: File,
  options: UploadOptions,
): Promise<IngestionJob | void> {
  const { onProgress, onSuccess, onError } = options;
  let { profile, profileId } = options;
  let profileName = options.profileName;

  try {
    if (options.backend === 'neo') {
      if (
        !profileId ||
        !options.revisionId ||
        !options.maxInputBytes ||
        file.size <= 0 ||
        file.size > options.maxInputBytes ||
        !file.name.toLowerCase().endsWith('.ifc')
      ) {
        throw new Error(
          'Select a supported published revision and an IFC4 file within the server input limit.',
        );
      }
      options.signal?.throwIfAborted();
      options.onStage?.('hashing');
      const bytes = await file.arrayBuffer();
      const digest =
        typeof globalThis.crypto?.subtle?.digest === 'function'
          ? new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
          : (await import('@noble/hashes/sha2.js')).sha256(new Uint8Array(bytes));
      options.signal?.throwIfAborted();
      const sha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
      const session = await apiClient.initiateIfcUpload(
        {
          request_id: options.requestId ?? createRequestId(),
          filename: file.name,
          size_bytes: file.size,
          sha256,
          profile_id: profileId,
          revision_id: options.revisionId,
        },
        options.signal,
      );
      options.onSession?.(session);
      if (session.status !== 'completed') {
        options.onStage?.('transferring');
        await apiClient.transferIfcUpload(file, session, options.onBytesProgress, options.signal);
      }
      options.onStage?.('admitting');
      const job = await apiClient.completeIfcUpload(session.id, options.signal);
      onSuccess?.();
      return job;
    }
    const { IfcParser } = await import('@ifc-lite/parser');
    const { extractAndTransform } = await import('./ifc-transformer');
    onProgress?.(5);
    if (!profileId && !profile) {
      profileId = 'full-hierarchy';
    }
    if (profileId && profileId !== 'full-hierarchy' && !profile) {
      const response = await apiClient.getProfile(profileId);
      if (!('profile' in response.profile_record))
        throw new Error('Select a legacy execution profile');
      profile = response.profile_record.profile;
      profileName ??= response.profile_record.name;
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
    await apiClient.uploadModelData(model.id, {
      ...payload,
      conversion_profile_id: profileId ?? profile?.rule_id,
      conversion_profile_name:
        profileName ?? (profileId === 'full-hierarchy' ? 'Full Hierarchy' : undefined),
    });

    onProgress?.(100);
    onSuccess?.();
  } catch (error) {
    console.error('Upload error:', error);
    onError?.(error);
  }
}
