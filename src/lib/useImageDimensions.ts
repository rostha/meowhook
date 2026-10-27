'use client';

import { useState, useEffect, useCallback } from 'react';

interface ImageDimensions {
  width: number;
  height: number;
}

const cache = new Map<string, ImageDimensions>();

export function useImageDimensions(url: string | undefined, knownWidth?: number, knownHeight?: number): ImageDimensions | null {
  const [dims, setDims] = useState<ImageDimensions | null>(() => {
    if (knownWidth && knownHeight) {
      return { width: knownWidth, height: knownHeight };
    }
    if (url && cache.has(url)) {
      return cache.get(url)!;
    }
    return null;
  });

  const loadImage = useCallback(() => {
    if (!url) {
      setDims(null);
      return;
    }

    if (knownWidth && knownHeight) {
      const d = { width: knownWidth, height: knownHeight };
      cache.set(url, d);
      setDims(d);
      return;
    }

    if (cache.has(url)) {
      setDims(cache.get(url)!);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const d = { width: img.naturalWidth, height: img.naturalHeight };
      cache.set(url, d);
      setDims(d);
    };
    img.onerror = () => {
      setDims(null);
    };
    img.src = url;
  }, [url, knownWidth, knownHeight]);

  useEffect(() => {
    loadImage();
  }, [loadImage]);

  return dims;
}

/** Calculate Discord-style rendered image dimensions.
 *  Discord constraints: max-width = containerWidth, max-height = 300px.
 *  Returns { width, height } in pixels for the rendered image.
 */
export function calculateDiscordImageSize(
  naturalWidth: number,
  naturalHeight: number,
  containerWidth: number = 400,
  maxHeight: number = 300,
): { width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: containerWidth, height: maxHeight };
  }

  const aspectRatio = naturalWidth / naturalHeight;

  // Start with fitting to container width
  let renderedWidth = Math.min(naturalWidth, containerWidth);
  let renderedHeight = renderedWidth / aspectRatio;

  // If height exceeds max, scale down based on height
  if (renderedHeight > maxHeight) {
    renderedHeight = maxHeight;
    renderedWidth = renderedHeight * aspectRatio;
  }

  // Discord has a minimum height of ~60px for very wide images
  if (renderedHeight < 60) {
    renderedHeight = 60;
    renderedWidth = renderedHeight * aspectRatio;
    if (renderedWidth > containerWidth) {
      renderedWidth = containerWidth;
      renderedHeight = renderedWidth / aspectRatio;
    }
  }

  return { width: Math.round(renderedWidth), height: Math.round(renderedHeight) };
}
