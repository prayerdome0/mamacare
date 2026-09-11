/** @type {import('next').NextConfig} */
const nextConfig = {
  // The dashboard talks to Supabase directly from the browser (anon key +
  // RLS). No server-side secrets are required for the MVP.
  reactStrictMode: true,
};

export default nextConfig;
