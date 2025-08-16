# Authentication Setup Guide

## Google OAuth Configuration

To enable Google authentication, follow these steps:

### 1. Create Google OAuth Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Go to "Credentials" in the left sidebar
5. Click "Create Credentials" → "OAuth 2.0 Client IDs"
6. Choose "Web application" as the application type
7. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (for development)
   - `https://yourdomain.com/api/auth/callback/google` (for production)
8. Copy the Client ID and Client Secret

### 2. Environment Variables

Create a `.env.local` file in your project root with the following variables:

```env
# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret-key-here

# Google OAuth Credentials
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
```

### 3. Generate NextAuth Secret

You can generate a secure secret using:

```bash
openssl rand -base64 32
```

Or use any secure random string generator.

### 4. Features Included

- ✅ Google OAuth authentication
- ✅ Email/password authentication (frontend only)
- ✅ Protected dashboard route
- ✅ Session management
- ✅ Sign out functionality
- ✅ Responsive design
- ✅ Dark/light mode support
- ✅ Framer Motion animations

### 5. Routes

- `/auth/signin` - Sign in page
- `/auth/signup` - Sign up page
- `/dashboard` - Protected dashboard (requires authentication)

### 6. Usage

1. Users can sign in with Google or email/password
2. After successful authentication, users are redirected to `/dashboard`
3. The dashboard shows user information and provides a sign-out option
4. Unauthenticated users are redirected to the sign-in page

### 7. Customization

You can customize the authentication flow by:
- Adding more OAuth providers (GitHub, Facebook, etc.)
- Implementing email verification
- Adding password reset functionality
- Customizing the dashboard layout
- Adding user profile management

### 8. Security Notes

- Never commit your `.env.local` file to version control
- Use strong, unique secrets for production
- Implement proper error handling
- Add rate limiting for authentication endpoints
- Consider adding 2FA for additional security 