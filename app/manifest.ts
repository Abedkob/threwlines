import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ThrewLines",
    short_name: "ThrewLines",
    description: "A private workspace for client relationships, work, billing, and spending.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#171a23",
    icons: [
      {
        src: "/threwlines-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
