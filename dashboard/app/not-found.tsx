import Link from "next/link";

/**
 * App-level 404. Unknown routes inside the deployment render this branded
 * page instead of Next's default error screen.
 *
 * NOTE: If you see Vercel's raw "404: NOT_FOUND / Code: NOT_FOUND" page
 * (with an error ID like `cpt1::…`), the request never reached this app —
 * that is a deployment-configuration issue, not a missing route.
 * See the "Troubleshooting" section of dashboard/README.md.
 */
export default function NotFound() {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="logo">MAMA CARE</div>
        <div className="tag">404 — page not found</div>
        <p style={{ margin: "0 0 16px" }}>
          The page you requested does not exist. It may have been moved, or the
          link may be out of date.
        </p>
        <Link className="btn" href="/dashboard">
          Go to Overview
        </Link>
      </div>
    </div>
  );
}
