import "@testing-library/jest-dom/vitest"

process.env.NEXTAUTH_SECRET ??= "test-secret-test-secret-test-secret-00"
// Tests assert against a fixed gateway, whatever the CI or shell environment says.
process.env.API_GATEWAY_URL = "http://gateway.test"
