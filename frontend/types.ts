
export const UserRole = {
  CUSTOMER: 'CUSTOMER',
  PROVIDER: 'PROVIDER',
  ADMIN: 'ADMIN'
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const AdminRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  CUSTOMER_SUPPORT: 'CUSTOMER_SUPPORT',
  PROVIDER_SUPPORT: 'PROVIDER_SUPPORT',
  VERIFICATION: 'VERIFICATION',
  CATEGORY_MANAGER: 'CATEGORY_MANAGER',
  CUSTOMER_REVIEWER: 'CUSTOMER_REVIEWER'
} as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

export const ServiceCategory = {
  CLEANING: 'Cleaning',
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical',
  INTERIOR_DESIGN: 'Interior Design'
} as const;
export type ServiceCategory = (typeof ServiceCategory)[keyof typeof ServiceCategory];

export const BookingStatus = {
  REQUESTED: 'REQUESTED',
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  address?: string;
  adminRole?: AdminRole;
  avatar?: string;
  rating?: number;
  isBanned?: boolean;
}

export interface ServiceOffering {
  category: ServiceCategory;
  price: number;
  description: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  status: 'ACTIVE' | 'PENDING';
}

export interface VerificationDocument {
  id: string;
  name: string;
  type: 'ID' | 'LICENSE' | 'INSURANCE' | 'OTHER';
  url: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  uploadedAt: string;
}

export interface Provider extends User {
  role: typeof UserRole.PROVIDER;
  serviceCategory: ServiceCategory; 
  hourlyRate: number; 
  services: ServiceOffering[];
  teamMembers: TeamMember[];
  verificationDocuments: VerificationDocument[];
  rating: number;
  reviewCount: number;
  distanceKm: number;
  verified: boolean;
  bio: string;
  availabilityStatus: 'AVAILABLE' | 'BUSY' | 'OFF_DUTY';
  isBanned: boolean;
}

export interface Booking {
  id: string;
  customerId: string;
  providerId: string;
  providerName: string;
  serviceCategory: ServiceCategory;
  bookingType: 'STANDARD' | 'CONSULTATION';
  date: string;
  time: string;
  durationHours: number;
  totalPrice: number;
  status: BookingStatus;
  createdAt: string;
}

export interface SupportTicket {
    id: string;
    requesterId: string;
    requesterRole: UserRole;
    type: 'INCIDENT' | 'APPEAL' | 'REPORT';
    subject: string;
    description: string;
    status: 'OPEN' | 'RESOLVED';
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    createdAt: string;
}

export interface AuthState {
  user: User | Provider | null;
  isAuthenticated: boolean;
  login: (email: string, role: UserRole) => void;
  logout: () => void;
}
