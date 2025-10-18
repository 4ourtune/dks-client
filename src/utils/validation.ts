import { VALIDATION_RULES } from "./constants";

export const validateEmail = (email: string): string | null => {
  if (!email.trim()) {
    return "Email is required";
  }

  if (!VALIDATION_RULES.EMAIL.test(email.trim())) {
    return "Please enter a valid email address";
  }

  return null;
};

export const validatePassword = (password: string): string | null => {
  if (!password.trim()) {
    return "Password is required";
  }

  const rules = VALIDATION_RULES.PASSWORD;

  if (password.length < rules.MIN_LENGTH) {
    return `Password must be at least ${rules.MIN_LENGTH} characters`;
  }

  if (rules.REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }

  if (rules.REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter";
  }

  if (rules.REQUIRE_NUMBERS && !/\d/.test(password)) {
    return "Password must contain at least one number";
  }

  if (rules.REQUIRE_SPECIAL && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return "Password must contain at least one special character";
  }

  return null;
};

export const validateName = (name: string): string | null => {
  if (!name.trim()) {
    return "Name is required";
  }

  if (name.trim().length < 2) {
    return "Name must be at least 2 characters";
  }

  if (name.trim().length > 50) {
    return "Name must be less than 50 characters";
  }

  return null;
};

export const validateVIN = (vin: string): string | null => {
  if (!vin.trim()) {
    return "VIN is required";
  }

  if (!VALIDATION_RULES.VIN.test(vin.trim())) {
    return "Please enter a valid 17-character VIN";
  }

  return null;
};

export const validateDeviceId = (deviceId: string): string | null => {
  if (!deviceId.trim()) {
    return "Device ID is required";
  }

  if (!VALIDATION_RULES.DEVICE_ID.test(deviceId.trim())) {
    return "Please enter a valid 12-character device ID";
  }

  return null;
};

export const validateRequired = (value: string, fieldName: string): string | null => {
  if (!value.trim()) {
    return `${fieldName} is required`;
  }

  return null;
};
