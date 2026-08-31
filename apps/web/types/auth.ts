/**
 * Authentication-related shared types.
 *
 * Mirrors the backend DTOs at apps/api/src/auth.
 */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  email: string;
}
