import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Careers | AASTHIX Open Opportunities",
  description: "Explore open roles at AASTHIX. Apply securely — your profile goes straight to our recruiting team.",
  openGraph: {
    title: "AASTHIX — Careers",
    description: "Open job opportunities and direct applications.",
  },
};

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
