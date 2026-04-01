export const APP_CONFIG = {
  /** Primary product name shown in dashboard chrome */
  appName: "AASTHIX TALENT",
  tagline: "Workspace Tracking System",
  /** Short initials when no image mark is set */
  brandInitials: "AT",
  /**
   * Navbar mark: file in `public/` (e.g. `/brand-logo.png`).
   * Use a PNG/SVG with transparency for best results on light & dark headers.
   */
  brandLogoSrc: "/brand-logo.png",
  /**
   * Shown on Access Gate / error surfaces. Set via env at build time.
   * Example: NEXT_PUBLIC_SUPPORT_EMAIL=help@company.com
   */
  supportEmail: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "" : "",
  /** Optional URL for access requests (e.g. ITSM form). */
  supportRequestUrl: typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPPORT_REQUEST_URL?.trim() || "" : "",
};

