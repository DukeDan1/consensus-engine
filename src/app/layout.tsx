import type { Metadata } from "next";
import "bootswatch/dist/litera/bootstrap.min.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./globals.css";
import Header from "@/app/components/ui/header";
import BootstrapClient from "@/app/components/BootstrapClient";
import { Roboto_Flex } from "next/font/google";
import Providers from "@/app/providers";
import ErrorBoundary from "@/app/components/layout/ErrorBoundary";
import { ToastContainer } from "react-toastify";

const roboto = Roboto_Flex({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Consensus Engine",
  // description: "Optional: add a short description for SEO"
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="stylesheet" href="/overrides.css" />
      </head>
      <body className={roboto.className}>
        {/* If BootstrapClient imports bootstrap.bundle JS, keep it. */}
        <BootstrapClient />
        {/* Ensure Providers includes SessionProvider for Header/useSession */}
        <Providers>
          <Header title="Consensus Engine" />
          <ErrorBoundary>
            <div className="d-flex min-vh-100 flex-column flex-md-row">
              <main className="flex-fill p-3 p-sm-4">{children}</main>
            </div>
          </ErrorBoundary>
        </Providers>
        <ToastContainer />
      </body>
    </html>
  );
}
