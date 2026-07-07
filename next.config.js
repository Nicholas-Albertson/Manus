/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ['@langchain/core', '@langchain/openai', '@e2b/code-interpreter'],
};
module.exports = nextConfig;
