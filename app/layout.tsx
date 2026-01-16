import type { Metadata } from "next";
import { Inter, Source_Code_Pro } from "next/font/google";
import { SafeArea } from "@coinbase/onchainkit/minikit";
import { minikitConfig } from "@/minikit.config";
import { RootProvider } from "./rootProvider";
import BottomNav from "./_components/BottomNav";
import MiniKitReady from "./_components/MiniKitReady";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: minikitConfig.miniapp.name,
    description: minikitConfig.miniapp.description,
    other: {
      "fc:miniapp": JSON.stringify({
        version: minikitConfig.miniapp.version,
        imageUrl: minikitConfig.miniapp.heroImageUrl,
        button: {
          title: `Launch ${minikitConfig.miniapp.name}`,
          action: { name: `Launch ${minikitConfig.miniapp.name}`, type: "launch_miniapp" },
        },
      }),
    },
  };
}

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const sourceCodePro = Source_Code_Pro({
  variable: "--font-source-code-pro",
  subsets: ["latin"],
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${sourceCodePro.variable}`}>
        <RootProvider>
          <MiniKitReady />
          {/* IMPORTANT: padding bottom so content never hides behind BottomNav */}
          <SafeArea>
            <div className="mx-auto w-full max-w-md pb-28">{children}</div>
          </SafeArea>
          <BottomNav />
        </RootProvider>
      </body>
    </html>
  );
}
