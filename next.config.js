/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ['@langchain/core', '@langchain/openai'],
};
module.exports = nextConfig;
