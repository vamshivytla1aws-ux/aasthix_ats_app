"use client";

import Image from "next/image";
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

  if (!brandLogo) {
    if (!showFallback) return null;
    return (
      <div
        className={`grid place-items-center overflow-hidden rounded-xl bg-white/10 text-[10px] font-extrabold tracking-wide text-white ring-1 ring-white/20 ${className}`.trim()}
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
      <Image
        src={brandLogo}
        alt={alt || `${APP_CONFIG.appName} logo`}
        fill
        sizes={`${size}px`}
        className={`object-contain object-center ${imageClassName}`.trim()}
        priority
      />
    </div>
  );
}
