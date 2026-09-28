import { type NextRequest, NextResponse } from "next/server";
import { isLocale, LOCALE_COOKIE, negotiateLocale } from "./i18n/config";

/**
 * Every page lives under `/en` or `/es`, so each language has its own
 * indexable URL. Bare paths (`/`, `/demo`, ...) redirect to the visitor's
 * last explicit choice (cookie) or, failing that, their `Accept-Language`.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isLocale(pathname.split("/")[1])) return;

  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookie)
    ? cookie
    : negotiateLocale(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  const response = NextResponse.redirect(url, 307);
  response.headers.set("Vary", "Accept-Language, Cookie");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next|api|favicon.ico|icon.svg|robots.txt|sitemap.xml|\\.well-known|.*\\.[a-z0-9]+$).*)",
  ],
};
