'use client';
import { useRef, useState, type ChangeEvent } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { IconLoader, IconUpload } from '@/components/MeowIcons';
import { getUploadSizeError } from '@/lib/uploadLimits';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

interface ImageUploadButtonProps {
  onUpload: (previewUrl: string, file: File) => void;
  onMultiUpload?: (files: { previewUrl: string; file: File }[]) => void;
  disabled?: boolean;
  disabledTitle?: string;
  multiple?: boolean;
  maxFiles?: number;
}

export default function ImageUploadButton({
  onUpload,
  onMultiUpload,
  disabled,
  disabledTitle,
  multiple = false,
  maxFiles = 10
}: ImageUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const showToast = useAppStore((s) => s.showToast);

  const handleClick = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Reset input so user can re-select same file
    e.target.value = '';

    // Check max files limit for multi-upload
    if (multiple && files.length > maxFiles) {
      showToast(`Too many files selected. Maximum is ${maxFiles} files.`, 'error');
      return;
    }

    setLoading(true);

    const validFiles: { previewUrl: string; file: File }[] = [];
    const errors: string[] = [];

    for (const file of files) {
      // Validate type
      if (!ALLOWED_TYPES.includes(file.type)) {
        errors.push(`"${file.name}": Invalid type (only PNG, JPG, GIF, WebP allowed)`);
        continue;
      }

      // Validate size
      const sizeError = getUploadSizeError(file);
      if (sizeError) {
        errors.push(sizeError);
        continue;
      }

      try {
        const previewUrl = URL.createObjectURL(file);
        validFiles.push({ previewUrl, file });
      } catch {
        errors.push(`"${file.name}": Failed to process`);
      }
    }

    // Report errors if any
    if (errors.length > 0) {
      const summary = errors.length === 1 ? errors[0] : `${errors.length} files rejected: ${errors.join('; ')}`;
      showToast(summary, 'error');
    }

    // Process valid files
    if (validFiles.length > 0) {
      if (multiple && onMultiUpload) {
        onMultiUpload(validFiles);
        showToast(`${validFiles.length} image${validFiles.length > 1 ? 's' : ''} attached!`, 'success');
      } else {
        // Single file mode - process first valid file only
        const { previewUrl, file } = validFiles[0];
        onUpload(previewUrl, file);
        showToast(`Image "${file.name}" attached!`, 'success');
      }
    }

    setLoading(false);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={handleChange}
        style={{ display: 'none' }}
        multiple={multiple}
      />
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={handleClick}
        disabled={loading || disabled}
        title={disabled ? disabledTitle || 'Upload disabled' : multiple ? `Upload up to ${maxFiles} images` : 'Upload image from device'}
        aria-label={disabled ? disabledTitle || 'Upload disabled' : multiple ? `Upload up to ${maxFiles} images` : 'Upload image from device'}
        style={{
          padding: '4px 8px',
          color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? <IconLoader size={16} /> : <IconUpload size={16} />}
      </button>
    </>
  );
}
