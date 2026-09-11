export interface Facility {
  id: string;
  name: string;
  district: string;
  type: string;
}

export type MotherStatus =
  | "active"
  | "delivered"
  | "postnatal"
  | "closed"
  | "lost_to_followup";

export type RiskLevel = "red" | "amber" | "green";

export interface MotherRow {
  id: string;
  code: string;
  name: string;
  age: number;
  phone: string; // masked in aggregate views
  facilityId: string;
  status: MotherStatus;
  gaWeeks: number;
  gaDays: number;
  edd: string; // ISO date
  risk: RiskLevel;
  lastVisit: string | null;
  nextAppt: string | null;
  activeReferral: boolean;
  missed: number;
}

export interface Counts {
  registered: number;
  visitsThisMonth: number;
  missed: number;
  highRisk: number;
  activeReferrals: number;
  deliveries: number;
}

export interface AlertBreakdown {
  red: number;
  amber: number;
  green: number;
}

export interface DashboardData {
  source: "demo" | "supabase";
  fallbackNote: string | null;
  facilities: Facility[];
  mothers: MotherRow[];
  counts: Counts;
  alerts: AlertBreakdown;
  attendance: number; // 0..100
  today: { urgent: number; overdue: number; routine: number };
  generatedAt: string;
}
