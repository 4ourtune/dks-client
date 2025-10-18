import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from "axios";
import { API_BASE_URL, API_TIMEOUTS } from "@/utils/constants";
import { StorageService } from "@/services/storage/StorageService";
import { useAuthStore } from "@/stores/AuthStore";

type RefreshResult = { accessToken: string; refreshToken: string };

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

const AUTH_RETRY_SKIP_PATHS = ["/auth/login", "/auth/register", "/auth/refresh"];

let refreshPromise: Promise<RefreshResult> | null = null;

const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: API_TIMEOUTS.DEFAULT,
});

const requestTokenRefresh = async (refreshToken: string): Promise<RefreshResult> => {
  const response = await refreshClient.post("/auth/refresh", { refreshToken });

  if (response.data?.error) {
    throw new Error(response.data.error);
  }

  return {
    accessToken: response.data.accessToken,
    refreshToken: response.data.refreshToken,
  };
};

const updateAuthorizationHeader = (
  headers: RetriableRequestConfig["headers"],
  token: string,
): RetriableRequestConfig["headers"] => {
  const normalizedHeaders = headers ?? {};

  if (typeof (normalizedHeaders as any).set === "function") {
    (normalizedHeaders as any).set("Authorization", `Bearer ${token}`);
    return normalizedHeaders;
  }

  (normalizedHeaders as Record<string, string>).Authorization = `Bearer ${token}`;
  return normalizedHeaders;
};

const shouldSkipAuthRetry = (url?: string): boolean => {
  if (!url) {
    return false;
  }

  return AUTH_RETRY_SKIP_PATHS.some((path) => url.includes(path));
};

export const attachAuthInterceptors = (instance: AxiosInstance): void => {
  instance.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      const tokens = await StorageService.getTokens();
      if (tokens.token) {
        config.headers = updateAuthorizationHeader(config.headers, tokens.token);
      }
      return config;
    },
    (error) => Promise.reject(error),
  );

  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = (error.config ?? {}) as RetriableRequestConfig;

      if (error.response?.status === 401 && !originalRequest._retry) {
        if (shouldSkipAuthRetry(originalRequest.url)) {
          return Promise.reject(error);
        }

        const tokens = await StorageService.getTokens();
        if (!tokens.refreshToken) {
          await StorageService.clearTokens();
          return Promise.reject(error);
        }

        try {
          if (!refreshPromise) {
            refreshPromise = requestTokenRefresh(tokens.refreshToken).finally(() => {
              refreshPromise = null;
            });
          }

          const newTokens = await refreshPromise;
          await StorageService.setTokens(newTokens.accessToken, newTokens.refreshToken);
          useAuthStore.setState({
            token: newTokens.accessToken,
            refreshToken: newTokens.refreshToken,
            isAuthenticated: true,
          });

          originalRequest._retry = true;
          originalRequest.headers = updateAuthorizationHeader(
            originalRequest.headers,
            newTokens.accessToken,
          );
          return instance(originalRequest);
        } catch (refreshError) {
          const { isAuthenticated } = useAuthStore.getState();
          if (isAuthenticated) {
            console.warn("[httpClient] Token refresh failed, clearing session.");
          }
          await StorageService.clearTokens();
          useAuthStore.setState({
            user: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
          });
          return Promise.reject(refreshError);
        }
      }

      return Promise.reject(error);
    },
  );
};

export const createHttpClient = (
  config?: AxiosRequestConfig,
  options: { skipAuth?: boolean } = {},
): AxiosInstance => {
  const instance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      "Content-Type": "application/json",
    },
    timeout: API_TIMEOUTS.DEFAULT,
    ...config,
  });

  instance.interceptors.request.use(
    (requestConfig) => {
      if (typeof requestConfig.url === "string" && requestConfig.url.startsWith("/")) {
        requestConfig.url = requestConfig.url.slice(1);
      }
      return requestConfig;
    },
    (requestError) => Promise.reject(requestError),
  );

  if (!options.skipAuth) {
    attachAuthInterceptors(instance);
  }

  return instance;
};

export const httpClient = createHttpClient();
