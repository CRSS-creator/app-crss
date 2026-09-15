import type { NextConfig } from "next";

const instructions = [
  { path: "CRSS-Instrukcja-wysłania-UPL-1.pdf", fileName: "CRSS-Instrukcja-UPL-1.pdf" },
  { path: "CRSS-Instrukcja-wysłania-ZUS-PEL.pdf", fileName: "CRSS-Instrukcja-ZUS-PEL.pdf" },
];

const nextConfig: NextConfig = {
  async headers() {
    return instructions.flatMap(({ path, fileName }) =>
      [path, encodeURI(path)].map((source) => ({
        source: "/" + source,
        headers: [{ key: "Content-Disposition", value: `attachment; filename="${fileName}"` }],
      }))
    );
  },
  async redirects() {
    // Preserve UPL-1 links already sent with an accidental space.
    return [
      {
        source: "/CRSS-Instrukcja-wys%C5%82ania%20-UPL-1.pdf",
        destination: "/CRSS-Instrukcja-wys%C5%82ania-UPL-1.pdf",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
