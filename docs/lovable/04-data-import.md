Now load Shan Village's REAL roster data and remove the sample data completely. This is the actual operating history: 18 people, 22 weeks, 30 Mar 2026 - 30 Aug 2026, 1,358 shift assignments. Import it as a database seed/migration.

Delete every demo employee, demo period and demo assignment you created earlier. Do not keep sample rows alongside real data.

## 1. Positions (12, in this order)
Team Leader, Commis, Commis I, Commis II, Commis III, Kitchen Helper, Cashier, Cashier / Portion, Stewarding, Admin / Purchasing, Helper, Cleaner

## 2. Employees (18) - code, name, position
ACTIVE (7):
s00, Hla Kyawt Khing, Admin / Purchasing
s01, Phyu Sin Maung, Commis I
s02, Win Paing, Commis II
s03, Thiha Naing Soe, Commis II
s04, Kaung Htet Zaw, Commis II
s05, Nay Lin Htet, Commis II
s06, Mariam, Stewarding

FORMER - import as inactive. They must still appear on their historical weeks but must NOT appear in the builder for new weeks (11):
s07, Htet Thu Yein Aung, Team Leader
s08, Ye Thway, Commis
s09, Htoo Aung Hlaing, Kitchen Helper
s10, Min Thiha Aung, Kitchen Helper
s11, Aung Ye Min, Cashier / Portion
s12, Chan Pyae Pyae Thaw, Cashier
s13, Hawa, Stewarding
s14, Pyae Pyae Phyo, Cashier
s15, Aung Pyae Sone, (no position)
s16, Kyaw Thet Paing, Cashier / Portion
s17, SAW, (no position)

None of these people have logins yet. Create them as employees with `profile_id` null.

## 3. Shift templates - REUSABLE, these 14 only
These are the shifts the kitchen actually reuses, and the only ones that appear in the roster builder's shift picker.
Format: code, start, end, crosses_midnight, is_split, segment2_start, segment2_end, hours
h00,08:00,18:00,N,N,,,10
h01,08:00,20:00,N,N,,,12
h02,09:00,19:00,N,N,,,10
h03,10:00,20:00,N,N,,,10
h04,10:00,22:00,N,N,,,12
h05,12:00,23:30,N,N,,,11.5
h06,13:00,23:00,N,N,,,10
h07,13:00,00:00,Y,N,,,11
h08,14:00,00:00,Y,N,,,10
h09,15:00,02:00,Y,N,,,11
h10,16:00,02:00,Y,N,,,10
h11,09:00,14:00,Y,Y,19:00,00:00,10
h12,08:00,13:00,N,Y,18:00,22:00,9
h13,12:00,00:30,Y,N,,,12.5

## 4. Historical one-off shifts - NOT templates
These 44 shapes were each used only in specific past weeks. Import them as RESOLVED start/end times directly on the assignment with NO shift_template link. Do NOT add them to the shift template master and do NOT show them in the picker - that would clutter it with 44 one-offs.
Same format as above:
x00,09:00,14:00,Y,Y,20:00,00:00,9
x01,06:00,00:30,Y,N,,,18.5
x02,08:00,22:00,N,N,,,14
x03,09:00,14:00,Y,Y,19:00,01:30,11.5
x04,07:30,19:30,N,N,,,12
x05,08:00,13:00,Y,Y,18:00,00:00,11
x06,08:00,19:00,N,N,,,11
x07,09:00,23:00,N,N,,,14
x08,12:30,22:30,N,N,,,10
x09,10:00,14:00,Y,Y,19:00,00:00,9
x10,12:00,23:00,N,N,,,11
x11,08:00,17:00,N,N,,,9
x12,10:00,14:00,Y,Y,18:00,00:00,10
x13,10:00,15:00,N,N,,,5
x14,13:30,22:30,N,N,,,9
x15,09:30,22:30,N,N,,,13
x16,09:00,18:00,N,N,,,9
x17,13:30,23:30,N,N,,,10
x18,11:00,21:00,N,N,,,10
x19,15:30,22:30,N,N,,,7
x20,15:00,23:00,N,N,,,8
x21,09:00,16:00,N,N,,,7
x22,10:00,12:00,N,Y,18:00,23:00,7
x23,08:00,13:00,N,Y,19:00,23:00,9
x24,10:00,17:00,N,N,,,7
x25,12:00,00:00,Y,N,,,12
x26,16:00,23:00,N,N,,,7
x27,08:00,13:00,N,Y,19:00,21:00,7
x28,08:00,23:00,N,N,,,15
x29,14:00,20:00,N,N,,,6
x30,11:00,23:00,N,N,,,12
x31,09:00,20:00,N,N,,,11
x32,08:00,14:00,N,Y,19:00,23:00,10
x33,09:00,21:00,N,N,,,12
x34,08:00,14:00,Y,Y,19:00,00:00,11
x35,09:00,14:00,N,Y,19:00,23:00,9
x36,14:30,22:30,N,N,,,8
x37,15:00,00:00,Y,N,,,9
x38,10:00,19:00,N,N,,,9
x39,11:00,22:00,N,N,,,11
x40,10:00,00:00,Y,N,,,14
x41,09:00,13:00,Y,Y,19:00,00:00,9
x42,14:30,23:30,N,N,,,9
x43,06:00,00:00,Y,N,,,18

## 5. Non-working and unspecified codes
- `OFF` - weekly off day (189 occurrences)
- `PH` - public holiday (8)
- `LEAVE` - leave, type not recorded in the source; import with leave_type null and flag for review (52)
- `ON` - the person worked but the hours were never written down (62). Import as status WORK with start_time and end_time NULL, and flag the row for review. Do NOT guess times, and do NOT count these toward scheduled hours - show them as "hours not recorded".
- `.` - no cell in the source; create no assignment row at all.

## 6. The roster
Each line is: week_start_date, employee_code, then Mon,Tue,Wed,Thu,Fri,Sat,Sun. Weeks start Monday. All 22 weeks are in the past, so import every period with status PUBLISHED (not draft).

This history has no outlet split - do NOT invent outlet allocations. Create one roster period per week against the default outlet and leave the per-assignment outlet override empty.

2026-03-30,s00,ON,ON,ON,ON,ON,OFF,ON
2026-03-30,s01,OFF,h00,h00,h00,x05,h08,h08
2026-03-30,s02,h00,h12,h12,h06,OFF,PH,x06
2026-03-30,s03,h09,OFF,h06,h09,h09,h09,h09
2026-03-30,s07,h06,h06,h06,OFF,h00,h00,PH
2026-03-30,s08,h12,h06,OFF,h12,h07,x05,h00
2026-03-30,s09,h06,PH,OFF,h06,x05,h03,h03
2026-03-30,s10,h06,h09,h09,OFF,h07,h08,h08
2026-03-30,s11,x07,x07,h10,x08,h02,h02,OFF
2026-03-30,s12,PH,OFF,x07,h02,h08,h08,x09
2026-03-30,s13,OFF,h06,h06,h06,h08,h08,h08
2026-03-30,s14,h10,h10,OFF,h10,h10,h10,h10
2026-04-06,s00,ON,ON,ON,ON,ON,OFF,ON
2026-04-06,s01,x10,x11,OFF,h00,x12,h08,h08
2026-04-06,s02,h00,x10,h12,h06,OFF,h00,h00
2026-04-06,s03,h09,h09,OFF,h09,h09,h09,h09
2026-04-06,s07,h00,h00,h00,OFF,h00,h00,h00
2026-04-06,s08,OFF,x10,h06,h12,h08,h08,h08
2026-04-06,s09,h06,x13,h06,h06,x05,OFF,PH
2026-04-06,s10,h06,h06,h09,OFF,PH,x12,h00
2026-04-06,s11,h02,x07,h10,x08,h02,h02,OFF
2026-04-06,s12,x14,OFF,x15,x16,x17,x17,x12
2026-04-06,s13,OFF,h06,h06,h06,h08,h08,h08
2026-04-06,s14,h10,h10,OFF,h10,h10,h10,h10
2026-04-13,s00,ON,ON,ON,ON,ON,OFF,ON
2026-04-13,s01,h06,h06,OFF,h12,h00,h00,h00
2026-04-13,s02,h00,h00,h00,h00,OFF,h00,h00
2026-04-13,s03,h06,h10,h06,OFF,h00,h00,h08
2026-04-13,s07,h12,h12,h00,OFF,h08,h08,h08
2026-04-13,s08,OFF,h06,h06,h06,h08,h08,h08
2026-04-13,s09,h06,x18,h12,h06,h12,OFF,h00
2026-04-13,s10,h09,OFF,h09,h09,h09,h09,h09
2026-04-13,s11,h10,OFF,h10,h10,h10,h10,OFF
2026-04-13,s12,x21,h10,x15,h03,h03,h03,x12
2026-04-13,s13,OFF,h06,h06,h06,h08,h08,h08
2026-04-13,s14,x19,x15,OFF,x20,h08,h08,h10
2026-04-20,s00,ON,ON,ON,ON,ON,ON,ON
2026-04-20,s01,OFF,h00,h06,h06,h00,h00,h00
2026-04-20,s02,h00,h02,h00,h02,h00,h00,h00
2026-04-20,s03,h06,h10,h06,h06,h08,h00,h08
2026-04-20,s07,x22,h06,h00,OFF,h08,h08,h08
2026-04-20,s08,h00,h06,h06,h06,h08,h08,h08
2026-04-20,s09,h06,x23,x18,h00,h00,OFF,x23
2026-04-20,s10,OFF,OFF,x18,h09,h09,h09,h09
2026-04-20,s11,h10,h10,x18,h10,h10,h10,h10
2026-04-20,s12,x24,OFF,h02,h02,h02,h02,h02
2026-04-20,s13,OFF,h06,h06,h06,h08,h08,h08
2026-04-20,s14,x19,x15,h06,h06,h08,h08,h08
2026-04-27,s00,ON,ON,ON,ON,ON,OFF,ON
2026-04-27,s01,OFF,x23,h06,h06,h00,h00,h00
2026-04-27,s02,h00,h00,h00,h00,h00,OFF,h11
2026-04-27,s03,h06,h06,h06,OFF,h10,h10,h10
2026-04-27,s07,h06,OFF,h00,h00,h11,h08,h08
2026-04-27,s08,h00,h06,OFF,h06,h08,h11,h08
2026-04-27,s09,h06,x23,h06,h00,LEAVE,LEAVE,LEAVE
2026-04-27,s10,h09,h09,h09,h09,LEAVE,LEAVE,LEAVE
2026-04-27,s11,h10,h10,h10,h10,LEAVE,LEAVE,LEAVE
2026-04-27,s12,x24,OFF,h02,x15,h02,h02,h02
2026-04-27,s13,OFF,h06,h06,h06,h08,h08,h08
2026-04-27,s14,x19,x15,OFF,h06,h08,h08,h08
2026-04-27,s15,h02,h02,LEAVE,LEAVE,LEAVE,h02,h02
2026-05-04,s00,ON,ON,ON,ON,ON,OFF,ON
2026-05-04,s01,OFF,h00,x23,x10,h11,h08,x25
2026-05-04,s02,h00,x23,x06,h00,OFF,h00,h11
2026-05-04,s03,x26,OFF,h10,h10,h10,h10,h10
2026-05-04,s07,h06,h06,h06,OFF,h01,h11,h00
2026-05-04,s12,x24,LEAVE,LEAVE,LEAVE,LEAVE,LEAVE,LEAVE
2026-05-04,s13,OFF,h06,h06,h06,h08,h08,h08
2026-05-04,s14,h06,OFF,OFF,h06,h08,x25,h08
2026-05-04,s16,x23,h06,h06,x23,h08,h08,OFF
2026-05-11,s00,ON,ON,ON,ON,ON,OFF,ON
2026-05-11,s01,OFF,h06,h06,x23,h00,h02,h00
2026-05-11,s02,h00,x23,h00,h00,OFF,h00,x09
2026-05-11,s03,h06,h06,OFF,h06,x09,h08,h08
2026-05-11,s07,h06,h00,x23,OFF,h08,h08,h08
2026-05-11,s12,LEAVE,LEAVE,LEAVE,LEAVE,LEAVE,LEAVE,LEAVE
2026-05-11,s13,OFF,h06,h06,h06,h08,h08,h08
2026-05-11,s14,x14,x14,OFF,x08,h08,x25,h08
2026-05-11,s16,x23,OFF,h06,h06,h00,x09,h02
2026-05-18,s00,ON,ON,ON,ON,ON,OFF,ON
2026-05-18,s01,ON,ON,ON,ON,ON,ON,ON
2026-05-18,s02,h06,x27,h06,x06,OFF,h11,h11
2026-05-18,s03,x27,OFF,x06,h06,h08,h08,h08
2026-05-18,s07,x06,x06,x27,OFF,x06,x06,x06
2026-05-18,s12,LEAVE,LEAVE,LEAVE,LEAVE,LEAVE,LEAVE,LEAVE
2026-05-18,s13,OFF,h06,h06,h06,h08,h08,h08
2026-05-18,s14,h06,h06,OFF,h06,h08,x25,h08
2026-05-18,s16,OFF,h06,h06,h06,h11,x06,x06
2026-05-18,s17,h06,h06,OFF,x27,x25,h08,h08
2026-05-25,s00,ON,ON,ON,ON,ON,OFF,ON
2026-05-25,s01,ON,ON,ON,ON,ON,ON,ON
2026-05-25,s02,h06,h06,h06,OFF,h11,h08,h00
2026-05-25,s03,OFF,h06,x23,h06,h00,h00,h11
2026-05-25,s04,x06,OFF,h02,h06,h08,h11,h08
2026-05-25,s07,x06,x27,OFF,h02,h00,h02,h02
2026-05-25,s12,LEAVE,LEAVE,LEAVE,LEAVE,LEAVE,LEAVE,LEAVE
2026-05-25,s13,OFF,h06,h06,h06,h08,h08,h08
2026-05-25,s14,h06,h06,OFF,h06,x25,x25,h08
2026-05-25,s16,x23,x06,ON,ON,ON,ON,ON
2026-05-25,s17,h06,OFF,h04,x27,h08,h08,h08
2026-06-01,s00,ON,ON,ON,ON,ON,OFF,ON
2026-06-01,s01,ON,ON,ON,h06,h11,h08,h08
2026-06-01,s02,h06,h06,x30,x28,OFF,x31,x31
2026-06-01,s03,ON,ON,OFF,ON,ON,ON,ON
2026-06-01,s04,x06,x06,h07,OFF,h07,h11,h08
2026-06-01,s07,x06,OFF,OFF,h02,x06,x06,h00
2026-06-01,s12,OFF,OFF,h04,h06,h08,x25,x12
2026-06-01,s13,h06,h06,OFF,h06,h08,h08,h08
2026-06-01,s17,h06,OFF,x28,x29,h07,h08,h11
2026-06-08,s00,h02,h04,ON,x24,h03,OFF,h03
2026-06-08,s01,OFF,x32,x10,x33,x34,x25,x25
2026-06-08,s02,x33,x10,x33,OFF,x33,h11,h07
2026-06-08,s03,ON,ON,OFF,ON,ON,ON,ON
2026-06-08,s04,x35,x33,OFF,x32,h04,h00,h00
2026-06-08,s12,x36,OFF,h04,x36,h08,x25,x37
2026-06-08,s13,OFF,OFF,OFF,OFF,OFF,OFF,OFF
2026-06-08,s17,h04,OFF,x32,x10,x25,h08,h11
2026-06-15,s00,x38,h04,h03,x24,h03,OFF,h03
2026-06-15,s01,h06,OFF,x32,x31,x06,h07,h07
2026-06-15,s02,x32,x32,OFF,h06,h11,x06,x06
2026-06-15,s03,ON,ON,OFF,h06,h06,h06,h06
2026-06-15,s04,x31,x31,h02,OFF,x39,h11,h07
2026-06-15,s12,x36,OFF,h04,x36,h07,x25,h08
2026-06-15,s13,OFF,OFF,OFF,OFF,OFF,OFF,OFF
2026-06-15,s17,OFF,h06,h06,x32,h07,h08,h11
2026-06-22,s00,h03,h04,h03,h03,h03,OFF,h03
2026-06-22,s01,h06,OFF,h06,h06,h07,h07,h11
2026-06-22,s02,x32,x32,h06,h00,OFF,x06,x06
2026-06-22,s03,h06,h06,x32,OFF,h11,h07,h07
2026-06-22,s04,x31,h06,OFF,h06,h07,h11,h07
2026-06-22,s06,OFF,h06,h06,h06,h08,h08,h08
2026-06-22,s12,x36,OFF,x14,x36,h08,x25,h08
2026-06-22,s17,OFF,h00,h00,x32,x06,x06,h00
2026-06-29,s00,h03,h04,x40,h03,h03,OFF,h03
2026-06-29,s01,h06,OFF,x10,h01,x41,h07,h01
2026-06-29,s02,x32,x32,x06,h06,OFF,h11,h07
2026-06-29,s03,h06,h06,OFF,x41,h07,h01,x30
2026-06-29,s04,x31,h06,x32,OFF,x06,h07,h07
2026-06-29,s06,OFF,h06,h06,h08,h07,h07,h07
2026-06-29,s12,x36,OFF,LEAVE,x42,h08,h07,h08
2026-06-29,s17,OFF,h00,LEAVE,LEAVE,LEAVE,LEAVE,LEAVE
2026-07-06,s00,h03,x25,x40,h03,h03,OFF,h03
2026-07-06,s01,OFF,h11,h07,h06,h01,h07,h11
2026-07-06,s02,h11,h06,h01,OFF,h07,h11,h07
2026-07-06,s03,h01,h06,h11,h01,h11,h01,h07
2026-07-06,s04,h06,h01,OFF,h11,h07,h07,h01
2026-07-06,s06,OFF,h06,h08,h08,h08,h08,h08
2026-07-06,s12,h08,OFF,LEAVE,h08,h08,x25,h08
2026-07-13,s00,h03,x25,h03,x40,h03,OFF,h03
2026-07-13,s01,OFF,h11,h01,h11,h01,h07,h07
2026-07-13,s02,h11,h07,h07,OFF,PH,h11,x06
2026-07-13,s03,h07,OFF,h11,h07,h07,h07,h07
2026-07-13,s04,h01,h01,OFF,h01,h04,h01,LEAVE
2026-07-13,s06,OFF,h08,h07,h07,h07,h07,h07
2026-07-13,s12,h08,OFF,h08,LEAVE,h08,x25,h08
2026-07-20,s00,h03,x25,h03,h03,h03,x43,x25
2026-07-20,s01,OFF,h01,h07,h11,h01,h11,h07
2026-07-20,s02,h11,h07,h01,OFF,h07,h07,h01
2026-07-20,s03,h07,OFF,h11,h01,h04,h01,h07
2026-07-20,s04,h01,h11,OFF,h07,h07,h07,h11
2026-07-20,s06,OFF,h08,h08,h08,h08,h08,h08
2026-07-20,s12,h08,OFF,h08,h08,h08,LEAVE,LEAVE
2026-07-27,s00,h05,h05,h05,h05,x01,h13,h13
2026-07-27,s01,OFF,h07,h11,h07,h01,h07,PH
2026-07-27,s02,h01,OFF,h07,h11,h07,h01,x02
2026-07-27,s03,h11,h01,OFF,h01,h04,h07,h04
2026-07-27,s04,h07,h11,h01,OFF,h07,h04,h07
2026-07-27,s06,OFF,h08,h08,h08,h08,h08,h08
2026-08-03,s00,h05,h05,h05,OFF,h13,h13,h13
2026-08-03,s01,x03,OFF,h07,x02,h01,h07,h04
2026-08-03,s02,h07,h11,OFF,h04,h11,h04,h07
2026-08-03,s03,h01,h11,h01,h07,OFF,h07,h01
2026-08-03,s04,OFF,h07,h11,LEAVE,h04,h01,h07
2026-08-03,s06,OFF,h08,h08,h08,h08,h08,h08
2026-08-10,s00,h05,h05,OFF,h05,h13,h13,h13
2026-08-10,s01,OFF,h07,h11,h01,h07,h07,h04
2026-08-10,s02,h11,h01,h07,OFF,h07,h07,h07
2026-08-10,s03,h01,OFF,h07,h11,h01,h01,h01
2026-08-10,s04,h07,h11,OFF,h07,h04,h04,h08
2026-08-10,s06,OFF,h08,h08,h08,h08,h08,h08
2026-08-17,s00,h05,h05,h05,h05,h13,OFF,h13
2026-08-17,s01,OFF,h11,h01,h01,h04,h04,h03
2026-08-17,s02,h07,h01,h11,h07,OFF,h01,h00
2026-08-17,s03,x04,OFF,h07,h11,h07,h07,h07
2026-08-17,s04,h11,h07,OFF,h07,h01,h07,h08
2026-08-17,s05,ON,ON,OFF,LEAVE,h11,h08,h08
2026-08-17,s06,OFF,h08,h08,h08,h08,h08,h08
2026-08-24,s00,h05,h05,h05,h05,h13,OFF,h13
2026-08-24,s01,OFF,h08,h00,h00,h08,h08,h08
2026-08-24,s02,h08,h00,OFF,h08,h08,h01,h08
2026-08-24,s03,h00,OFF,h08,h08,h00,h08,h00
2026-08-24,s04,h08,h08,h08,h02,OFF,h08,h08
2026-08-24,s05,x00,h02,h02,OFF,h02,h02,h02
2026-08-24,s06,OFF,h08,h08,h08,h08,h08,h08

## 7. Import faithfully - do not "clean up" the data
Four shifts in this history are unusually long. Import them EXACTLY as given and flag them for review; do not shorten them, do not assume a typo, do not silently drop them:
- 2026-06-03 SAW 08:00-23:00 (15h)
- 2026-06-04 Win Paing 08:00-23:00 (15h)
- 2026-07-25 Hla Kyawt Khing 06:00-00:00 (18h)
- 2026-07-31 Hla Kyawt Khing 06:00-00:30 (18.5h)

Add a "Needs review" filter on the roster so a manager can find every flagged row: the 62 `ON` rows with no recorded hours, the 52 `LEAVE` rows with no leave type, and these 4 long shifts.

## 8. After importing
Verify by showing me the totals: number of employees, periods, assignments, and total scheduled hours per month. The assignment count should be 1,358. Then make sure the roster builder opens on the most recent week (2026-08-24) and that a manager can create the NEXT week (2026-08-31) from scratch or by copying the last one - that is the first thing this system will actually be used for.
