import { withAuth } from "next-auth/middleware"

export default withAuth({
  pages: {
    signIn: "/login",
  },
})

export const config = {
  matcher: ["/library/:path*", "/categories/:path*", "/chat/:path*", "/settings/:path*"],
}
