import { Alert, Linking } from "react-native";
import { RETRY_CONFIG } from "./constants";

export const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  } catch {
    return "Invalid date";
  }
};

export const formatDateTime = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleString();
  } catch {
    return "Invalid date";
  }
};

export const formatTimeAgo = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return "Just now";
    }

    if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    }

    if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }

    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  } catch {
    return "Unknown time";
  }
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
};

export const capitalizeFirst = (text: string): string => {
  if (!text) {
    return text;
  }
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

export const formatCurrency = (amount: number, currency = "USD"): string => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const retry = async <T>(
  fn: () => Promise<T>,
  maxAttempts: number = RETRY_CONFIG.MAX_ATTEMPTS,
  delay: number = RETRY_CONFIG.DELAY,
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        break;
      }

      const backoff = delay * Math.pow(RETRY_CONFIG.BACKOFF_FACTOR, attempt - 1);
      await sleep(backoff);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Operation failed");
};

export const debounce = <T extends (...args: any[]) => void>(
  func: T,
  delay: number,
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout | undefined;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

export const throttle = <T extends (...args: any[]) => void>(
  func: T,
  delay: number,
): ((...args: Parameters<T>) => void) => {
  let lastExecution = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastExecution >= delay) {
      lastExecution = now;
      func(...args);
    }
  };
};

export const showAlert = (
  title: string,
  message: string,
  buttons?: Array<{
    text: string;
    onPress?: () => void;
    style?: "default" | "cancel" | "destructive";
  }>,
): void => {
  Alert.alert(title, message, buttons ?? [{ text: "OK" }]);
};

export const showConfirm = (
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void,
): void => {
  Alert.alert(title, message, [
    {
      text: "Cancel",
      onPress: onCancel,
      style: "cancel",
    },
    {
      text: "OK",
      onPress: onConfirm,
    },
  ]);
};

export const openUrl = async (url: string): Promise<void> => {
  try {
    const supported = await Linking.canOpenURL(url);

    if (supported) {
      await Linking.openURL(url);
    } else {
      showAlert("Error", `Cannot open URL: ${url}`);
    }
  } catch (error) {
    console.error("Failed to open URL:", error);
    showAlert("Error", "Failed to open URL");
  }
};

export const generateId = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export const isNetworkError = (error: any): boolean => {
  const message = error?.message as string | undefined;
  const code = error?.code as string | undefined;
  const globalNavigator = (globalThis as { navigator?: { onLine?: boolean } }).navigator;
  const offline = globalNavigator?.onLine === false;

  return (
    code === "NETWORK_ERROR" ||
    message?.includes("Network Error") ||
    message?.toLowerCase().includes("network") ||
    offline
  );
};

export const getErrorMessage = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const dataMessage = (error as any)?.data?.message;
    if (typeof dataMessage === "string") {
      return dataMessage;
    }
  }

  return "An unknown error occurred";
};
