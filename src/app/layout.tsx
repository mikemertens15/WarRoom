import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Draft War Room", description: "Your local-first, six-team fantasy football draft command center." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
