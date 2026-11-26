import React, { useEffect, useRef, useState } from 'react';
import { Film } from 'lucide-react';
import { useApp } from '../store/AppContext';

const loadedImageUrls = new Set<string>();

interface SmartImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackTitle?: string;
  fit?: 'cover' | 'contain';
  objectPosition?: 'center' | 'right' | 'left' | 'top';
  transparentBg?: boolean;
  backdropFill?: boolean;
  shrinkToImage?: boolean;
  imgMask?: string;
}

const OBJECT_POSITION_CLASS: Record<NonNullable<SmartImageProps['objectPosition']>, string> = {
  center: 'object-center',
  right: 'object-right',
  left: 'object-left',
  top: 'object-top',
};

export const SmartImage: React.FC<SmartImageProps> = ({
  src,
  alt,
  className = '',
  fallbackTitle,
  fit = 'cover',
  objectPosition = 'center',
  transparentBg = false,
  backdropFill = false,
  shrinkToImage = false,
  imgMask,
}) => {
  const { batterySaver } = useApp();
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(() => Boolean(src && loadedImageUrls.has(src)));
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
    if (!src) {
      setLoaded(false);
      return;
    }
    if (loadedImageUrls.has(src) || imgRef.current?.complete) {
      loadedImageUrls.add(src);
      setLoaded(true);
    } else {
      setLoaded(false);
    }
  }, [src]);

  if (!src || errored) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[var(--sx-primary-container)]/50 via-[var(--sx-surface-high)] to-[var(--sx-surface-container)] p-3 text-center select-none ${className}`}
      >
        <Film className="w-6 h-6 text-[var(--sx-primary)] opacity-70 mb-1.5 shrink-0" />
        {fallbackTitle && (
          <span className="text-[11px] font-semibold text-[var(--sx-on-surface-muted)] line-clamp-2 leading-tight">
            {fallbackTitle}
          </span>
        )}
      </div>
    );
  }

  const fitClass = fit === 'contain' ? 'object-contain' : 'object-cover';
  const posClass = OBJECT_POSITION_CLASS[objectPosition];
  const containerBgClass = transparentBg ? 'bg-transparent' : 'bg-[var(--sx-surface-high)]';
  const sizeClass = shrinkToImage ? 'h-full w-auto max-w-full' : 'w-full h-full';
  const layoutClass = shrinkToImage ? 'flex items-center justify-end' : '';
  const maskStyle = imgMask
    ? ({ maskImage: imgMask, WebkitMaskImage: imgMask } as React.CSSProperties)
    : undefined;

  return (
    <div className={`relative z-0 overflow-hidden ${containerBgClass} ${layoutClass} ${className}`}>
      {!loaded && !transparentBg && (
        <div aria-hidden="true" className="absolute inset-0 sx-skeleton-surface" />
      )}
      {backdropFill && fit === 'contain' && !batterySaver && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          draggable={false}
          referrerPolicy="no-referrer"
          loading="lazy"
          className={`pointer-events-none absolute inset-0 w-full h-full object-cover scale-115 blur-md saturate-125 transition-opacity duration-400 ${
            loaded ? 'opacity-55' : 'opacity-0'
          }`}
        />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        referrerPolicy="no-referrer"
        loading="lazy"
        style={maskStyle}
        onLoad={() => {
          if (src) loadedImageUrls.add(src);
          setLoaded(true);
        }}
        onError={() => setErrored(true)}
        className={`relative z-[1] ${sizeClass} ${fitClass} ${posClass} ${
          batterySaver
            ? loaded
              ? 'opacity-100'
              : 'opacity-0'
            : `transition-[opacity,transform] duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform ${
                loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.035]'
              }`
        }`}
      />
    </div>
  );
};
