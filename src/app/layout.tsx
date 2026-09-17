import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dovee — AI IDE",
  description: "A local coding IDE with a bring-your-own-model agent",
  icons: {
    icon: "/dovee-logo.svg",
    shortcut: "/dovee-logo.svg",
    apple: "/dovee-logo.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} data-theme="dark" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('dovee-theme');if(t==='light'||t==='dusk'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}try{if(window.doveeDesktop&&window.doveeDesktop.isDesktop){document.documentElement.classList.add('desktop','platform-'+window.doveeDesktop.platform)}}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
