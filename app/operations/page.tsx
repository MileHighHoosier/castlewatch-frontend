import type { Metadata } from "next";
import OperationsDashboard from "./OperationsDashboard";

export const metadata: Metadata = {
  title: "Operations | CastleWatch",
  description: "Read-only CastleWatch storage, usage, and estimated cost report.",
};

export default function OperationsPage() {
  return <OperationsDashboard />;
}
