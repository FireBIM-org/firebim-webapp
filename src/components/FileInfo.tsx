import React from 'react';

interface FileInfoField {
  label: string;
  value: React.ReactNode;
}

interface FileInfoProps {
  title: string;
  description?: string;
  fields: FileInfoField[];
}

const FileInfo: React.FC<FileInfoProps> = ({ title, description, fields }) => (
  <div className="mt-6 overflow-hidden bg-white shadow sm:rounded-lg">
    <div className="px-4 py-5 sm:px-6">
      <h3 className="text-lg leading-6 font-medium text-gray-900">{title}</h3>
      {description && <p className="mt-1 max-w-2xl text-sm text-gray-500">{description}</p>}
    </div>
    <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
        {fields.map((field, idx) => (
          <div className="sm:col-span-1" key={idx}>
            <dt className="text-sm font-medium text-gray-500">{field.label}</dt>
            <dd className="mt-1 text-sm text-gray-900">{field.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  </div>
);

export default FileInfo;
