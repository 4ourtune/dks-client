import { AuthResponse, AuthTokens, LoginRequest, RegisterRequest, User } from "@/types";
import { createHttpClient, httpClient } from "./httpClient";

class AuthServiceClass {
  private authApi = createHttpClient(undefined, { skipAuth: true });

  async login(credentials: LoginRequest): Promise<AuthResponse> {
    try {
      const response = await this.authApi.post("/auth/login", credentials);

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      return {
        user: response.data.user,
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
      };
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error("Network error: Please check your connection");
    }
  }

  async register(userData: RegisterRequest): Promise<AuthResponse> {
    try {
      const response = await this.authApi.post("/auth/register", userData);

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      return {
        user: response.data.user,
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
      };
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error("Network error: Please check your connection");
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const response = await this.authApi.post("/auth/refresh", { refreshToken });

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      return {
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
      };
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error("Network error: Please check your connection");
    }
  }

  async getProfile(token: string): Promise<User> {
    try {
      const requestConfig = token
        ? {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        : undefined;

      const response = await httpClient.get("/auth/profile", requestConfig);

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      return response.data.user;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error("Token expired");
      }
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error("Network error: Please check your connection");
    }
  }

  setAuthToken(token: string) {
    httpClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  }

  clearAuthToken() {
    delete httpClient.defaults.headers.common.Authorization;
  }
}

export const AuthService = new AuthServiceClass();
