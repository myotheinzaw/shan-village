Two things: create the Owner accounts, then build the access control panel.

## 1. Owner accounts

Create these two accounts server-side, both with the Owner role and full access:

- myotheinzaw@googlemail.com
- shanvillagedubai@googlemail.com

I will give you each password when you ask for it — do NOT invent passwords, do NOT write any password into source code, migrations, seeds or comments, and do not print them back. Create them through a server-side admin routine using the service role, never from client code.

Both accounts must be able to sign in immediately and land on the management navigation. Once these exist, the one-time owner-setup screen must be permanently disabled.

## 2. Access control panel — Admin → Users & roles

This is the control panel for granting and withdrawing access. It must be genuinely usable by a non-technical owner.

**Roles tab.** A grid: every permission down the side, one column per role, a tick per cell. Roles are Owner, Roster Manager, Chef, Staff. Changing a tick changes what everyone in that role can do, immediately. Group the permission rows by area (Roster, Staff, Requests, Finance, Reports, Admin) so the grid is readable.

Add **Chef** as a real role. Default it to roster view-only: `roster.view`, `roster.view_all`, `requests.create`, `requests.view_own`, `announcements.view`. Nothing else — the owner raises it from this panel if they want to.

**People tab.** A list of everyone with a login, showing name, linked employee, role, last sign-in, and active state. From here the Owner can:
- create a login and link it to an existing employee record
- change someone's role
- grant or revoke a single permission for one person as an override on top of their role, so one chef can be given roster editing while the other chefs stay view-only
- deactivate a login

Show clearly, per person, which permissions come from their role and which are personal overrides — an override must be visibly different from an inherited permission, and removable in one click.

**View versus edit must stay separate**, because that is the whole point of this panel: `roster.view` / `roster.view_all` versus `roster.edit` / `roster.publish`; `staff.view` versus `staff.edit`. Someone can be given "look but do not touch" on any area.

**Money stays separately gated.** `finance.view` and `finance.approve` are not bundled with request approval, so a manager can approve leave without seeing salary or cash-advance amounts.

**Guard rails — keep these enforced in the database, not just the UI:**
- nobody can grant themselves a permission they do not already hold
- a non-admin cannot assign the Owner/admin role
- the last active Owner cannot be deactivated or demoted
- the admin role cannot be deleted or stripped of permissions
- every grant and revoke writes a row to the audit log with who, what and when

Every change must take effect without a redeploy, and the person affected should see their navigation change on their next page load.
