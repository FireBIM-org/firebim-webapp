import { IfcTypeEnum } from '@ifc-lite/data';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'react-toastify';

import { NeoUpload } from '@/features/ingestion/NeoUpload';
import { listRules } from '@/features/rulebook/api';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { components } from '@/types/api';
import { handleIfcUpload } from '@/utils/upload-manager';

import Layout from '../../components/Layout';
import LoadingSpinner from '../../components/LoadingSpinner';
import apiClient from '../../utils/api-client';

type Profile = components['schemas']['LexiconProfileSummaryItem'] & {
  target_classes?: string[];
};

const FULL_HIERARCHY_PROFILE: Profile = {
  id: 'full-hierarchy',
  name: 'Full Hierarchy',
  description: 'Keep all IFC objects without filtering',
  ontology_family: 'none',
  country: 'none',
  version: 'none',
  target_count: 0,
  property_requirement_count: 0,
  target_classes: Object.values(IfcTypeEnum).map((c) => c.toString()),
  updated_at: new Date().toISOString(),
};

export default function UploadModel() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const router = useRouter();
  const [backend, setBackend] = useState<'neo' | 'legacy'>('neo');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [profiles, setProfiles] = useState<Profile[]>([FULL_HIERARCHY_PROFILE]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>(FULL_HIERARCHY_PROFILE.id);
  const [loadingProfiles, setLoadingProfiles] = useState(true);

  useEffect(() => {
    if (!user || backend !== 'legacy') return;
    async function deriveProfile() {
      const rules = await listRules();
      const ruleIds = rules.map((r) => r.rule_id);
      if (ruleIds.length < 1) {
        return null;
      }

      const response = await apiClient.deriveLexiconProfile({
        ontology_family: 'fbo',
        country: 'dk',
        version: 'latest',
        rule_ids: ruleIds,
      });
      return {
        id: response.profile.rule_id,
        name: 'Derived Profile from rules',
        target_count: response.profile.target_classes?.length || 0,
        property_requirement_count: response.profile.property_paths?.length || 0,
        updated_at: new Date().toISOString(),
        ontology_family: response.ontology_family,
        country: response.country,
        version: response.version,
        ...response.profile,
      } as Profile;
    }
    async function loadProfiles() {
      try {
        const response = await apiClient.getProfiles();
        const items = (response.profiles || []).filter(
          (item): item is Profile => 'ontology_family' in item,
        );
        const derivedProfile = await deriveProfile();

        const allProfiles = [FULL_HIERARCHY_PROFILE, ...items];
        if (derivedProfile) {
          allProfiles.push(derivedProfile);
        }

        setProfiles(allProfiles);
        // 'full-hierarchy' is already the default state
      } catch (error) {
        console.error('Failed to load profiles:', error);
        toast.error('Failed to load Lexicon profiles');
      } finally {
        setLoadingProfiles(false);
      }
    }
    loadProfiles();
  }, [user, backend]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) {
        return;
      }

      if (!selectedProfileId && profiles.length > 0) {
        toast.error('Please select a Lexicon profile');
        return;
      }

      const file = acceptedFiles[0];

      // Check if the file is an IFC file
      if (!file.name.toLowerCase().endsWith('.ifc')) {
        toast.error('Please upload an IFC file (.ifc extension)');
        return;
      }

      setIsUploading(true);
      setUploadProgress(0);

      const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
      await handleIfcUpload(file, {
        profileId: selectedProfileId,
        profileName: selectedProfile?.name,
        profile: selectedProfile?.target_classes ? selectedProfile : undefined,
        onProgress: (p) => setUploadProgress(p),
        onSuccess: () => {
          toast.success('Model uploaded and processed successfully!');
          router.push('/ifc-models');
        },
        onError: (error) => {
          console.error('Upload error:', error);
          toast.error('Failed to upload model. Please try again.');
        },
      });

      setIsUploading(false);
    },
    [router, selectedProfileId, profiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: isUploading,
  });

  if (authLoading || !user) {
    return (
      <Layout title="Uploading... | FireBIM">
        <LoadingSpinner />
      </Layout>
    );
  }

  return (
    <Layout title="Upload IFC Model | FireBIM">
      <div className="py-6">
        <h1 className="text-2xl font-semibold text-gray-900">Upload IFC Model</h1>
        <p className="mt-1 text-sm text-gray-500">
          Select immutable translation ingestion or the separate legacy workflow.
        </p>
      </div>

      <div className="mb-5">
        <label htmlFor="ingestion-backend" className="block text-sm font-medium text-gray-700">
          Ingestion workflow
        </label>
        <select
          id="ingestion-backend"
          value={backend}
          disabled={isUploading}
          onChange={(event) => setBackend(event.target.value as 'neo' | 'legacy')}
          className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="neo">Published translation revision — raw IFC4</option>
          <option value="legacy">Legacy — browser extraction and SQL</option>
        </select>
      </div>
      {backend === 'neo' ? (
        <NeoUpload userId={user.id} />
      ) : (
        <div className="mt-5 md:mt-0">
          <div className="shadow sm:overflow-hidden sm:rounded-md">
            <div className="space-y-6 bg-white px-4 py-5 sm:p-6">
              <div>
                <label htmlFor="profile" className="block text-sm font-medium text-gray-700">
                  Legacy Lexicon Profile
                </label>
                <select
                  id="profile"
                  name="profile"
                  className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-base focus:border-orange-500 focus:ring-orange-500 focus:outline-none sm:text-sm"
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                  disabled={isUploading || loadingProfiles}
                >
                  {loadingProfiles ? (
                    <option key="loading">Loading profiles...</option>
                  ) : profiles.length === 0 ? (
                    <option key="no found" value="">
                      No profiles found
                    </option>
                  ) : (
                    profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))
                  )}
                </select>
                <p className="mt-2 text-xs text-gray-500">
                  Select a profile to filter and transform the IFC data
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">IFC File</label>
                <div className="mt-1 flex justify-center rounded-md border-2 border-dashed border-gray-300 px-6 pt-5 pb-6">
                  <div className="space-y-1 text-center" {...getRootProps()}>
                    <input {...getInputProps()} id="fileInput" />
                    <svg
                      className="mx-auto h-12 w-12 text-gray-400"
                      stroke="currentColor"
                      fill="none"
                      viewBox="0 0 48 48"
                      aria-hidden="true"
                    >
                      <path
                        d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div className="flex text-sm text-gray-600">
                      <p className="pl-1">
                        {isDragActive
                          ? 'Drop the file here'
                          : isUploading
                            ? 'Uploading...'
                            : 'Drag and drop an IFC file, or click to select'}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500">IFC files only</p>
                  </div>
                </div>
              </div>

              {isUploading && (
                <div className="mt-4">
                  <div className="overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-orange-500"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <p className="mt-2 text-center text-sm text-gray-500">
                    Uploading... {uploadProgress}%
                  </p>
                </div>
              )}
            </div>
            <div className="bg-gray-50 px-4 py-3 text-right sm:px-6">
              <button
                onClick={() => router.push('/ifc-models')}
                type="button"
                className="mr-3 inline-flex justify-center rounded-md border border-transparent bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex justify-center rounded-md border border-transparent bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:outline-none"
                onClick={() => document.getElementById('fileInput')?.click()}
                disabled={isUploading}
              >
                {isUploading ? 'Uploading...' : 'Upload Model'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
