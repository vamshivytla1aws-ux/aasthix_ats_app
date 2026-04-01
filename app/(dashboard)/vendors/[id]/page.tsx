import { redirect } from "next/navigation";

type Vendor = {
  id: number;
  name: string;
  website_url?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  created_at?: string;
};

type Job = {
  id: number;
  title: string;
  company: string;
  location: string;
  status: string;
  description?: string | null;
  created_at?: string;
};

type CandidateApplied = {
  application_id: number;
  stage: string;
  updated_at: string;
  candidate_id: number;
  candidate_full_name: string;
  candidate_email?: string | null;
  job_id: number;
  job_title: string;
};

export default function VendorDetailPage({ params }: { params: { id: string } }) {
  redirect(`/clients/${params.id}`);
}

