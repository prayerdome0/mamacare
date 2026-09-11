/** @type {import('next').NextConfig} */
const nextConfig = {
  // The dashboard is 100% client-side: every page is a client component and
  // Supabase is queried from the browser with the anon key (+ RLS). There is
  // no server rendering, no route handler and no middleware, so the whole app
  // is exported as static HTML/CSS/JS into ./out.
  //
  // Why this matters for deployment: a static export can be built and served
  // from a subdirectory while the Vercel project's Root Directory is the
  // repository root (see the root vercel.json). That removes the hard
  // requirement to change Vercel project settings by hand — the cause of the
  // raw "404: NOT_FOUND / Code: NOT_FOUND" page.
  output: "export",
  // next/image optimisation needs a server; the dashboard uses plain <img>.
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
