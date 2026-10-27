import { describe, expect, it } from 'vitest';
import { getUploadSizeError, MAX_UPLOAD_BYTES } from './uploadLimits';

describe('Discord default upload size', () => {
  it.each([0, MAX_UPLOAD_BYTES - 1, MAX_UPLOAD_BYTES])('accepts %i bytes', size => {
    expect(getUploadSizeError({ name: 'file.pdf', size })).toBeNull();
  });

  it.each([MAX_UPLOAD_BYTES + 1, 25 * 1024 * 1024])('rejects %i bytes with an actionable file-specific error', size => {
    expect(getUploadSizeError({ name: 'video.mp4', size })).toContain('"video.mp4"');
    expect(getUploadSizeError({ name: 'video.mp4', size })).toContain('20 MiB');
  });
});
