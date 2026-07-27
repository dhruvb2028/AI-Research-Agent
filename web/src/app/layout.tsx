import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ResearchPilot",
  description:
    "An agentic research assistant with citation-level evidence inspection and a measured evaluation harness.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The theme lives in a cookie rather than localStorage so the server can set
  // the class in the initial HTML. No inline script, and no flash of the wrong
  // theme before hydration. Light is the default; dark is opt-in.
  //
  // Tradeoff: reading a cookie opts every route out of static prerendering.
  // That is the right call here — this is a live dashboard whose pages fetch
  // run data on load, so there was no useful static output to give up.
  const dark = (await cookies()).get("theme")?.value === "dark";

  return (
    <html
      lang="en"
      className={`${inter.variable} ${mono.variable} h-full antialiased ${dark ? "dark" : ""}`}
    >
      <body className="flex min-h-full flex-col">
        <AppShell>{children}</AppShell>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
