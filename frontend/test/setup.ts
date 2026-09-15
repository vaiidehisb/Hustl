import "@testing-library/jest-dom/vitest"

process.env.NEXTAUTH_SECRET ??= "test-secret-test-secret-test-secret-00"
process.env.API_GATEWAY_URL ??= "http://gateway.test"
