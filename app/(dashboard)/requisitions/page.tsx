import { redirect } from "next/navigation";

export default function RequisitionsRedirectPage() {
  redirect("/jobs?view=requisition");
}
