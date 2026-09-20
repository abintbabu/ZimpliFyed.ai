import { NextRequest, NextResponse } from "next/server";
import { isIndexableHost } from "@/lib/site";

// Signed-in and token-link surfaces; mirrors PRIVATE_PATHS in src/app/robots.ts.
const NOINDEX_PATTERNS = [
  /^\/dashboard(\/|$)/,
  /^\/admin(\/|$)/,
  /^\/api\//,
  /^\/join\//,
  /^\/welcome(\/|$)/,
  /^\/no-access(\/|$)/,
  /^\/doc-set\//,
  /^\/quote\//,
  /^\/track\//,
  /^\/login\/check-email(\/|$)/,
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const response = NextResponse.next();

  if (!isIndexableHost(request.headers.get("host")) || NOINDEX_PATTERNS.some((p) => p.test(pathname))) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
