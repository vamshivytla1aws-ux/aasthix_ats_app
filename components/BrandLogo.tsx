"use client";

import Image from "next/image";
import brandMark from "../public/aasthix-brand.png";
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
  const brandInitials = APP_CONFIG.brandInitials || "AT";

  if (!showFallback && !brandMark) return null;

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-transparent ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <Image
        src={brandMark}
        alt={alt || `${APP_CONFIG.appName} logo`}
        fill
        sizes={`${size}px`}
        priority={size >= 44}
        className={`object-contain object-center ${imageClassName}`.trim()}
      />
      {!brandMark && showFallback ? (
        <div className="grid h-full w-full place-items-center bg-[var(--ats-bg-panel-strong)] text-[10px] font-extrabold tracking-wide text-[var(--ats-text)] ring-1 ring-[var(--ats-border)]">
          {brandInitials}
        </div>
      ) : null}
    </div>
  );
}
