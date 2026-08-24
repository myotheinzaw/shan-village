/**
 * Row shapes for the Phase 1 schema. Hand-written rather than generated so the
 * repository stays buildable without a live Supabase project; keep in step with
 * supabase/migrations when the schema changes.
 */

export type RosterStatus = 'DRAFT' | 'PUBLISHED' | 'LOCKED'
export type AssignmentStatus = 'WORK' | 'OFF' | 'PH' | 'LEAVE' | 'TRIAL' | 'OTHER'
export type RequestStatus =
  | 'DRAFT' | 'SUBMITTED' | 'MANAGER_REVIEWED' | 'APPROVED'
  | 'REJECTED' | 'RETURNED' | 'CANCELLED' | 'PAID' | 'CLOSED'
export type EmploymentStatus = 'FULL_TIME' | 'PART_TIME' | 'CASUAL' | 'TRIAL' | 'CONTRACT'
export type RequestType =
  | 'LEAVE' | 'SHIFT_CHANGE' | 'SHIFT_SWAP' | 'LEAVE_ENCASHMENT' | 'CASH_ADVANCE'

export interface Module {
  key: string
  name: string
  description: string | null
  icon: string | null
  is_enabled: boolean
  is_core: boolean
  sort_order: number
}

export interface Profile {
  id: string
  email: string
  full_name: string
  is_active: boolean
  employee_id: string | null
  last_seen_at: string | null
  created_at: string
}

export interface Role {
  id: string
  key: string
  name: string
  description: string | null
  is_system: boolean
  sort_order: number
}

export interface Permission {
  id: string
  key: string
  name: string
  description: string | null
  module_key: string
  category: string
  is_active: boolean
  is_sensitive: boolean
  sort_order: number
}

export interface Outlet {
  id: string
  code: string
  name: string
  short_name: string | null
  timezone: string
  is_active: boolean
  sort_order: number
}

export interface Department {
  id: string
  code: string
  name: string
  is_active: boolean
  sort_order: number
}

export interface Position {
  id: string
  code: string
  name: string
  short_name: string | null
  department_id: string | null
  description: string | null
  is_active: boolean
  sort_order: number
}

export interface Employee {
  id: string
  employee_code: string
  full_name: string
  preferred_name: string | null
  position_id: string | null
  department_id: string | null
  outlet_id: string | null
  employment_status: EmploymentStatus
  join_date: string | null
  end_date: string | null
  mobile: string | null
  email: string | null
  profile_id: string | null
  default_shift_id: string | null
  preferred_off_day: number | null
  weekly_hours_target: number | null
  photo_url: string | null
  notes: string | null
  is_active: boolean
}

export interface EmployeeDirectoryEntry {
  id: string
  employee_code: string
  full_name: string
  preferred_name: string | null
  position_id: string | null
  department_id: string | null
  outlet_id: string | null
  is_active: boolean
}

export interface ShiftTemplate {
  id: string
  code: string
  name: string
  kind: AssignmentStatus
  outlet_id: string | null
  colour: string | null
  start_time: string | null
  end_time: string | null
  break_minutes: number
  crosses_midnight: boolean
  is_split: boolean
  segment2_start: string | null
  segment2_end: string | null
  notes: string | null
  is_active: boolean
  sort_order: number
}

export interface RosterPeriod {
  id: string
  outlet_id: string | null
  period_type: 'WEEK' | 'MONTH'
  start_date: string
  end_date: string
  name: string | null
  status: RosterStatus
  notes: string | null
  published_at: string | null
  published_by: string | null
  locked_at: string | null
  locked_by: string | null
}

export interface RosterAssignment {
  id: string
  period_id: string
  employee_id: string
  work_date: string
  status: AssignmentStatus
  shift_template_id: string | null
  start_time: string | null
  end_time: string | null
  break_minutes: number
  crosses_midnight: boolean
  is_split: boolean
  segment2_start: string | null
  segment2_end: string | null
  outlet_id: string | null
  position_id: string | null
  leave_type_id: string | null
  leave_request_id: string | null
  note: string | null
  source_value: string | null
  scheduled_hours: number
}

export interface StaffingRequirement {
  id: string
  outlet_id: string | null
  position_id: string | null
  department_id: string | null
  day_of_week: number | null
  min_staff: number
  label: string | null
  is_active: boolean
}

export interface LeaveType {
  id: string
  code: string
  name: string
  is_paid: boolean
  affects_entitlement: boolean
  requires_attachment: boolean
  colour: string | null
  is_active: boolean
  sort_order: number
}

interface RequestBase {
  id: string
  reference: string
  employee_id: string
  status: RequestStatus
  reason: string | null
  employee_comment: string | null
  manager_comment: string | null
  admin_comment: string | null
  submitted_at: string | null
  reviewed_at: string | null
  decided_at: string | null
  created_at: string
}

export interface LeaveRequest extends RequestBase {
  leave_type_id: string
  from_date: string
  to_date: string
  total_days: number
  attachment_url: string | null
  notice_days: number | null
  short_notice: boolean
}

export interface ShiftChangeRequest extends RequestBase {
  work_date: string
  current_assignment_id: string | null
  current_summary: string | null
  requested_shift_id: string | null
  requested_status: AssignmentStatus
  requested_start: string | null
  requested_end: string | null
  requested_crosses: boolean
  applied_at: string | null
}

export interface ShiftSwapRequest {
  id: string
  reference: string
  requester_employee_id: string
  requester_assignment_id: string | null
  requester_date: string
  requester_summary: string | null
  counterparty_employee_id: string
  counterparty_assignment_id: string | null
  counterparty_date: string
  counterparty_summary: string | null
  reason: string | null
  counterparty_response: 'PENDING' | 'ACCEPTED' | 'DECLINED'
  counterparty_responded_at: string | null
  counterparty_comment: string | null
  manager_comment: string | null
  admin_comment: string | null
  status: RequestStatus
  submitted_at: string | null
  applied_at: string | null
  created_at: string
}

export interface LeaveEncashmentRequest extends RequestBase {
  leave_year: number
  requested_days: number
  approved_days: number | null
  requested_date: string | null
  policy_acknowledged: boolean
  policy_text: string | null
}

export interface CashAdvanceRequest extends RequestBase {
  amount: number
  currency: string
  approved_amount: number | null
  request_date: string
  requested_payment_date: string | null
  repayment_arrangement: string | null
  attachment_url: string | null
  employee_acknowledged: boolean
  acknowledgement_text: string | null
  paid_at: string | null
  closed_at: string | null
}

export interface ApprovalAction {
  id: string
  request_type: RequestType
  request_id: string
  employee_id: string | null
  action: string
  from_status: RequestStatus | null
  to_status: RequestStatus | null
  comment: string | null
  actor_id: string | null
  actor_name: string | null
  created_at: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  audience: 'ALL' | 'MANAGEMENT' | 'OUTLET' | 'POSITION'
  outlet_id: string | null
  position_id: string | null
  publish_at: string
  expires_at: string | null
  is_published: boolean
  created_at: string
}

export interface Notification {
  id: string
  profile_id: string
  type: string
  title: string
  body: string | null
  link: string | null
  priority: 'LOW' | 'NORMAL' | 'HIGH'
  read_at: string | null
  created_at: string
}

export interface AuditLog {
  id: number
  actor_id: string | null
  actor_email: string | null
  action: string
  entity_type: string
  entity_id: string | null
  employee_id: string | null
  module_key: string | null
  summary: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  reason: string | null
  created_at: string
}

export interface AppSetting {
  key: string
  value: unknown
  data_type: 'string' | 'number' | 'boolean' | 'json'
  label: string
  description: string | null
  category: string
  is_public: boolean
}

export interface ImportBatch {
  id: string
  file_name: string
  status: 'PARSED' | 'REVIEWING' | 'COMMITTED' | 'CANCELLED' | 'FAILED'
  sheet_count: number
  total_rows: number
  recognized_rows: number
  review_rows: number
  error_rows: number
  summary: Record<string, unknown>
  notes: string | null
  committed_at: string | null
  created_at: string
}

export interface ImportRecord {
  id: string
  batch_id: string
  sheet_name: string
  row_number: number | null
  column_label: string | null
  source_value: string | null
  source_name: string | null
  source_position: string | null
  work_date: string | null
  parse_status: 'OK' | 'REVIEW' | 'ERROR' | 'SKIPPED'
  parse_message: string | null
  parsed: Record<string, unknown>
  matched_employee_id: string | null
  matched_position_id: string | null
  matched_outlet_id: string | null
  is_included: boolean
}

/* -------------------------------------------------------------------------- */
/* Wastage module                                                             */
/* -------------------------------------------------------------------------- */

export type WastageStatus = 'SUBMITTED' | 'CONFIRMED' | 'REJECTED'
export type WastageSource = 'PUBLIC_LINK' | 'STAFF_APP' | 'MANAGEMENT'
export type WastageExportStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED'
export type WastageExportTrigger = 'MANUAL' | 'AUTO' | 'CRON'

export interface WastageReason {
  id: string
  code: string
  name: string
  description: string | null
  is_active: boolean
  sort_order: number
}

export interface WastageLink {
  id: string
  token: string
  label: string
  outlet_id: string | null
  is_active: boolean
  expires_at: string | null
  require_name: boolean
  hourly_limit: number
  submission_count: number
  last_used_at: string | null
  created_at: string
  created_by: string | null
}

export interface WastageEntry {
  id: string
  reference: string | null
  entry_date: string
  entry_time: string
  outlet_id: string | null
  reported_by_name: string
  employee_id: string | null
  item_name: string
  quantity: number | null
  unit: string | null
  reason_id: string | null
  /** Null for a reader without wastage.cost_view — the value is masked on load. */
  estimated_value: number | null
  currency: string
  note: string
  photo_path: string | null
  photo_mime: string | null
  photo_size: number | null
  drive_photo_id: string | null
  drive_photo_url: string | null
  status: WastageStatus
  source: WastageSource
  link_id: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string
  exported_at: string | null
  created_at: string
}

export interface WastageExport {
  id: string
  report_date: string
  status: WastageExportStatus
  trigger: WastageExportTrigger
  entry_count: number
  total_value: number
  file_name: string | null
  drive_file_id: string | null
  drive_url: string | null
  error: string | null
  created_at: string
  created_by: string | null
}
