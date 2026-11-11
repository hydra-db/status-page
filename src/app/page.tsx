import { readStatusData } from "@/lib/s3";
import type { StatusSnapshot } from "@/types/status";
import StatusPage from "@/components/StatusPage";

// Revalidate every 60 seconds
export const revalidate = 60;

export default async function Page() {
  let data: StatusSnapshot | null = null;

  try {
    data = await readStatusData();
  } catch {
    // S3 read failed -- render with null data (unconfigured state)
  }

  return <StatusPage data={data} />;
}
