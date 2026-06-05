import type { Metadata } from "next";
import "./globals.css";
import "./completion.css";
import ActivityMetadataPolish from "./components/ActivityMetadataPolish";
import RideCompletionTracker from "./components/RideCompletionTracker";
import PlanModeGuard from "./components/PlanModeGuard";
import LightningLaneTracker from "./components/LightningLaneTracker";

export const metadata: Metadata = {
  title: "CastleWatch",
  description: "Disney park demand dashboard for current and future ride pressure.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ActivityMetadataPolish />
        <RideCompletionTracker />
        <PlanModeGuard />
        <LightningLaneTracker />
        {children}
      </body>
    </html>
  );
}
