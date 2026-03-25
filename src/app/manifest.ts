import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GraveLens",
    short_name: "GraveLens",
    description:
      "Photograph a grave marker and uncover the story of the person buried there.",
    start_url: "/",
    display: "standalone",
    background_color: "#1a1917",
    theme_color: "#1a1917",
    orientation: "portrait",
    categories: ["lifestyle", "utilities"],
    icons: [
      {
        // Next.js serves app/icon.tsx at /icon — stable path, any size
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        // Apple touch icon served by app/apple-icon.tsx
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
