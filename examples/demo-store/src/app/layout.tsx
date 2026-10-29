import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Alder Trail Co.",
  description: "Trail gear for long days outside.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
