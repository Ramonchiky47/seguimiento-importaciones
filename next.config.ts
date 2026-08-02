import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    if (process.env.NODE_ENV === "production") {
      return [];
    }

    // En desarrollo, evita que el navegador (sobre todo Safari) guarde en
    // caché HTML/JS/CSS entre reinicios del servidor — sin esto, un simple
    // refresh a veces no basta para ver los últimos cambios.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
