export { default } from "next-auth/middleware"

export const config = {
  matcher: ["/library/:path*", "/categories/:path*", "/chat/:path*"],
}