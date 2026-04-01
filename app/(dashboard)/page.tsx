import { redirect } from "next/navigation";

/** App root: single hub entry — jobs list lives at `/jobs`. */
export default function DashboardRootRedirect() {
  redirect("/dashboard");
}
