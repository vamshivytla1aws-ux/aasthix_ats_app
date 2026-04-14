"use client";

import { useState } from "react";
import { APP_CONFIG } from "@/lib/config";

type BrandLogoProps = {
  size?: number;
  alt?: string;
  className?: string;
  imageClassName?: string;
  showFallback?: boolean;
};

export default function BrandLogo({
  size = 44,
  alt,
  className = "",
  imageClassName = "",
  showFallback = true,
}: BrandLogoProps) {
  const brandLogo = APP_CONFIG.brandLogoSrc?.trim();
  const brandInitials = APP_CONFIG.brandInitials || "AT";
  const [imageFailed, setImageFailed] = useState(false);
  const shouldShowImage = Boolean(brandLogo) && !imageFailed;

  if (!shouldShowImage) {
    if (!showFallback) return null;
    return (
      <div
        className={`grid place-items-center overflow-hidden rounded-xl bg-[var(--ats-bg-panel-strong)] text-[10px] font-extrabold tracking-wide text-[var(--ats-text)] ring-1 ring-[var(--ats-border)] ${className}`.trim()}
        style={{ width: size, height: size }}
      >
        {brandInitials}
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-transparent ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <img
        src={brandLogo}
        alt={alt || `${APP_CONFIG.appName} logo`}
        width={size}
        height={size}
        loading="eager"
        decoding="async"
        onError={() => setImageFailed(true)}
        className={`block h-full w-full object-contain object-center ${imageClassName}`.trim()}
      />
    </div>
  );
}
