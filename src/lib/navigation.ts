import type { CurrentUser } from '@/lib/auth/session'

export interface NavItem {
  label: string
  href: string
  /** Any one of these permissions is enough to see the item. */
  permissions?: string[]
  /** The item only appears when this module is enabled. */
  module?: string
  exact?: boolean
}

export interface NavSection {
  label: string
  icon: string
  items: NavItem[]
}

/**
 * The management navigation.
 *
 * A section disappears entirely when the user can reach none of its items, and
 * a future module's section appears only once that module is enabled — which is
 * why every future module has no entry here at all rather than a disabled one.
 * Hiding is only cosmetic; the page guards and RLS do the actual work.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    icon: 'layout-dashboard',
    items: [{ label: 'Dashboard', href: '/dashboard', exact: true }],
  },
  {
    label: 'Staff & Roster',
    icon: 'calendar-days',
    items: [
      { label: 'Weekly Roster', href: '/roster', permissions: ['roster.view_all'], exact: true },
      { label: 'Monthly Roster', href: '/roster/monthly', permissions: ['roster.view_all'] },
      { label: 'Shift Templates', href: '/roster/shifts', permissions: ['shifts.view', 'shifts.manage'] },
      { label: 'Employees', href: '/employees', permissions: ['staff.view'] },
      { label: 'Positions', href: '/positions', permissions: ['positions.manage'] },
      { label: 'Outlets', href: '/outlets', permissions: ['outlets.manage'] },
      { label: 'Roster Links', href: '/roster/links', permissions: ['roster.share'] },
    ],
  },
  {
    label: 'Requests',
    icon: 'inbox',
    items: [
      { label: 'My Requests', href: '/my-requests', permissions: ['requests.create', 'requests.view_own'] },
      {
        label: 'Approval Centre',
        href: '/approvals',
        permissions: ['requests.review', 'requests.approve', 'leave.approve', 'finance.approve'],
      },
      { label: 'Leave Calendar', href: '/leave', permissions: ['requests.view_all', 'leave.approve'] },
    ],
  },
  {
    label: 'Wastage',
    icon: 'trash-2',
    items: [
      { label: 'Daily Wastage', href: '/wastage', permissions: ['wastage.view'], module: 'wastage', exact: true },
      { label: 'Submission Links', href: '/wastage/links', permissions: ['wastage.manage'], module: 'wastage' },
      { label: 'Wastage Reasons', href: '/wastage/reasons', permissions: ['wastage.manage'], module: 'wastage' },
    ],
  },
  {
    label: 'Communication',
    icon: 'megaphone',
    items: [{ label: 'Announcements', href: '/announcements', permissions: ['announcements.view'] }],
  },
  {
    label: 'Reports',
    icon: 'bar-chart-3',
    items: [
      { label: 'Roster Report', href: '/reports/roster', permissions: ['reports.view'] },
      { label: 'Employee Hours', href: '/reports/hours', permissions: ['reports.view'] },
      { label: 'Leave Report', href: '/reports/leave', permissions: ['reports.view'] },
      { label: 'Request Report', href: '/reports/requests', permissions: ['reports.view'] },
    ],
  },
  {
    label: 'Administration',
    icon: 'shield',
    items: [
      { label: 'Users', href: '/admin/users', permissions: ['admin.users'] },
      { label: 'Roles & Permissions', href: '/admin/roles', permissions: ['admin.roles', 'admin.permissions'] },
      { label: 'Modules', href: '/admin/modules', permissions: ['admin.modules'] },
      { label: 'Settings', href: '/admin/settings', permissions: ['admin.settings'] },
      { label: 'Staffing Rules', href: '/admin/staffing', permissions: ['admin.settings'] },
      { label: 'Excel Import', href: '/admin/import', permissions: ['import.run'] },
      { label: 'Audit Log', href: '/admin/audit', permissions: ['audit.view'] },
    ],
  },
]

function itemVisible(user: CurrentUser, item: NavItem): boolean {
  if (item.module && !user.enabledModules.has(item.module)) return false
  if (!item.permissions || item.permissions.length === 0) return true
  return item.permissions.some((p) => user.permissions.has(p))
}

export function visibleNavigation(user: CurrentUser): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => itemVisible(user, item)),
  })).filter((section) => section.items.length > 0)
}

export const STAFF_NAV: NavItem[] = [
  { label: 'Home', href: '/staff', exact: true },
  { label: 'Roster', href: '/staff/roster' },
  { label: 'Requests', href: '/staff/requests' },
  { label: 'Profile', href: '/staff/profile' },
]
