import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // gera um servidor mínimo em .next/standalone para a imagem Docker
  output: 'standalone',
};

export default nextConfig;
