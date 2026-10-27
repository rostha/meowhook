'use client';

import React from 'react';
import {
  IconFilm,
  IconMusic,
  IconFileArchive,
  IconFileCode,
  IconFileText,
  IconPaperclip,
} from '@/components/MeowIcons';

const FileTypeIcon = React.memo(function FileTypeIcon({ mimeType, fileName, size = 20 }: { mimeType: string; fileName: string; size?: number }) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (mimeType.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext))
    return <IconFilm size={size} style={{ color: 'var(--accent)' }} />;
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext))
    return <IconMusic size={size} style={{ color: '#a78bfa' }} />;
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext) || mimeType.includes('zip') || mimeType.includes('rar'))
    return <IconFileArchive size={size} style={{ color: '#fbbf24' }} />;
  if (['js', 'ts', 'jsx', 'tsx', 'json', 'xml', 'html', 'css', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'md', 'yaml', 'yml', 'sh'].includes(ext))
    return <IconFileCode size={size} style={{ color: '#34d399' }} />;
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'csv', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext))
    return <IconFileText size={size} style={{ color: '#60a5fa' }} />;
  return <IconPaperclip size={size} style={{ color: 'var(--text-muted)' }} />;
});

export default FileTypeIcon;
