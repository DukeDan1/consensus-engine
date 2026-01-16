import type { Metadata } from "next";
import "bootswatch/dist/litera/bootstrap.min.css";
import "@fortawesome/fontawesome-free/css/fontawesome.min.css";
import "@fortawesome/fontawesome-free/css/solid.min.css";
import "@fortawesome/fontawesome-free/css/regular.min.css";
import "./globals.css";
import Header from "@/app/components/ui/header";
import { Roboto_Flex } from "next/font/google";
import Providers from "@/app/providers";
import ErrorBoundary from "@/app/components/layout/ErrorBoundary";
import { ToastContainer } from "react-toastify";
import { Suspense } from "react";
import Loading from "./loading";
import "@/app/lib/initServerLifecycle";

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
      </head>
      <body className={roboto.className}>
        {/* Ensure Providers includes SessionProvider for Header/useSession */}
        <Providers>
          <Header title="Consensus Engine" />
          <ErrorBoundary>
            <div className="d-flex min-vh-100 flex-column flex-md-row">
              <main className="flex-fill p-3 p-sm-4">
                <Suspense fallback={<Loading />}>
                  {children}
                </Suspense>
              </main>
            </div>
          </ErrorBoundary>
        </Providers>
        <ToastContainer />
      </body>
    </html>
  );
}
