import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nosterys Vault",
    short_name: "Vault",
    description: "A private workspace for client relationships, work, billing, and spending.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F6F3EE",
    theme_color: "#1A1714",
    icons: [
      {
        src: "/nosterys-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
