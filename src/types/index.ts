import type { ParamListBase } from "@react-navigation/native";

export * from "./auth";
export * from "./vehicle";
export * from "./key";
export * from "./ble";
export * from "./pki";
export * from "./pairing";

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: any;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface LoadingState {
  [key: string]: boolean;
}

export interface NavigationParams extends ParamListBase {
  Home: undefined;
  Login: undefined;
  Register: undefined;
  Profile: undefined;
  VehicleList: undefined;
  VehicleRegister: undefined;
  AddVehicle: undefined;
  VehicleControl: { vehicleId: string };
  VehicleDetail: { vehicleId: string };
  KeyList: { vehicleId: string };
  KeyRegister: { vehicleId: string };
  KeyDetail: { keyId: string };
  Settings: undefined;
  Logs: { vehicleId?: string };
}
