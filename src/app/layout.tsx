import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { inter } from '@/app/components/ui/fonts';
import HeaderWrapper from '@/app/components/ui/header-wrapper';
import SubHeader from '@/app/components/ui/SubHeader';
import "bootstrap/dist/css/bootstrap.min.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import BootstrapClient from "@/app/components/BootstrapClient";
import { Roboto_Flex } from "next/font/google";

import Providers from "@/app/providers";
import ErrorBoundary from "@/app/components/layout/ErrorBoundary";

const roboto = Roboto_Flex({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "gLearn - Games & Learning",
  description: "created by Joemon Jose",
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
        <BootstrapClient />
        <Providers>
          <HeaderWrapper />
          <SubHeader />
          <ErrorBoundary>
            <div className="flex min-h-screen flex-col md:flex-row">
              <main className="flex-1 p-4 sm:p-6">{children}</main>
            </div>
          </ErrorBoundary>
        </Providers>
      </body>
    </html>
  );
}

// <aside className="hidden md:block md:w-64 bg-gray-100 p-4">
//   <SideNav />
// </aside>
