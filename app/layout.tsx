import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./completion.css";
import "./emergency-break.css";
import ActivityMetadataPolish from "./components/ActivityMetadataPolish";
import RideCompletionTracker from "./components/RideCompletionTracker";
import PlanModeGuard from "./components/PlanModeGuard";
import LightningLaneTracker from "./components/LightningLaneTracker";

export const metadata: Metadata = {
  title: "CastleWatch",
  description: "Disney park demand dashboard for current and future ride pressure.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
