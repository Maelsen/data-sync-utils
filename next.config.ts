import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Das verhindert, dass Next.js versucht, pdfkit zu "bundlen"
  // Dadurch bleiben die Schriftarten-Dateien lesbar.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;