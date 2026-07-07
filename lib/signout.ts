export function getCognitoLogoutUrl(): string {
    const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
    const logoutUri = process.env.COGNITO_LOGOUT_URI ?? 
      (typeof window !== "undefined"
        ? `${window.location.origin}/login`
        : "https://savenet.am1.tech/login")
    return (
        `${domain}/logout` + 
        `?client_id=${clientId}` + 
        `&logout_uri=${encodeURIComponent(logoutUri)}`
    )
}