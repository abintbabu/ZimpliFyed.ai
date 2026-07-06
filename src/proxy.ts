import { NextRequest, NextResponse } from "next/server";

const NOINDEX_PATTERNS = [/\/dashboard(\/|$)/];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const response = NextResponse.next();

  if (NOINDEX_PATTERNS.some((p) => p.test(pathname))) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
