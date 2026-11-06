import LoginForm from "@/components/auth/LoginForm";
import BrandLogo from "@/components/BrandLogo";

export const metadata = { robots: { index: false, follow: false } };

export default function EmployeeLoginPage() {
  return <main className="min-h-screen bg-[var(--ats-bg-page-accent)] px-4 py-10 sm:py-16">
    <div className="mx-auto max-w-md rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-6 shadow-lg sm:p-8">
      <div className="mb-8 flex items-center gap-3"><BrandLogo size={42} /><span className="font-semibold">AASTHIX TALENT · HRMS</span></div>
      <LoginForm employeePortal />
    </div>
  </main>;
}
