import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle under `.next/standalone/`. The Dockerfile
  // copies just that + `.next/static` + `public/` into the final image.
  output: "standalone",
  // Pin the tracing root to THIS project. Without it, Next walks up the tree
  // looking for the nearest lockfile and (in a monorepo or worktree) may pick
  // a parent directory, which then buries the standalone output under that
  // parent's path structure.
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
