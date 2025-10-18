export interface Vehicle {
  id: string;
  userId: string;
  vin: string;
  model: string;
  device_id: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleStatus {
  doorsLocked: boolean;
  engineRunning: boolean;
  lastUpdated?: string;
  connected?: boolean;
}

export interface VehicleCreateRequest {
  vin: string;
  model: string;
  device_id: string;
  name?: string;
}

export interface VehicleUpdateRequest {
  model?: string;
  name?: string;
}

export interface VehicleControlRequest {
  command: "UNLOCK" | "LOCK" | "START";
  keyId: string;
}

export interface VehicleControlResponse {
  success: boolean;
  message: string;
  timestamp: string;
  status?: Partial<VehicleStatus>;
}

export interface VehicleLog {
  id: string;
  vehicleId: string;
  userId: string;
  command: string;
  success: boolean;
  timestamp: string;
  keyId?: string;
}

export interface VehicleState {
  vehicles: Vehicle[];
  selectedVehicle: Vehicle | null;
  vehicleStatuses: Record<string, VehicleStatus>;
  isLoading: boolean;
  error: string | null;
}
