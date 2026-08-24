'use server'

import { revalidatePath } from 'next/cache'
import { assertPermission } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { actionFailure, type ActionResult } from '@/lib/actions/result'
import { normaliseName, parseRosterWorkbook } from '@/lib/excel/import'
import { startOfWeekISO, weekDates } from '@/lib/roster/dates'
import { getSettings } from '@/lib/settings'
import type { ParsedShift } from '@/lib/roster/shift'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/**
 * Stage an uploaded spreadsheet.
 *
 * Nothing reaches the roster here. The parse result is written to
 * import_batches / import_records so an Admin can look at what was understood,
 * what needs a decision, and what would be created, before committing.
 */
export async function stageImport(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    await assertPermission('import.run')

    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'Choose a spreadsheet to import.' }
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return { ok: false, error: 'That file is larger than 10 MB.' }
    }
    if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
      return { ok: false, error: 'Upload an Excel file (.xlsx).' }
    }

    const parsed = parseRosterWorkbook(await file.arrayBuffer())
    if (parsed.cells.length === 0) {
      return {
        ok: false,
        error:
          'No roster rows were found. The importer expects the Shan Village layout: Name in column B, Position in C, and Monday–Sunday in D–J.',
      }
    }

    const supabase = await createSupabaseServerClient()

    const { data: batch, error: batchError } = await supabase
      .from('import_batches')
      .insert({
        file_name: file.name,
        source: 'EXCEL_ROSTER',
        status: 'REVIEWING',
        sheet_count: parsed.summary.sheets.length,
        total_rows: parsed.summary.totalCells,
        recognized_rows: parsed.summary.okCells,
        review_rows: parsed.summary.reviewCells,
        error_rows: parsed.summary.errorCells,
        summary: parsed.summary as unknown as Record<string, unknown>,
      })
      .select('id')
      .single()
    if (batchError) throw new Error(batchError.message)

    // Match against the existing masters so the review screen can show what
    // would happen, without writing anything yet.
    const [{ data: employees }, { data: positions }, { data: outlets }] = await Promise.all([
      supabase.from('employees').select('id, name_key'),
      supabase.from('positions').select('id, code, name'),
      supabase.from('outlets').select('id, code, name'),
    ])

    const employeeByName = new Map(
      ((employees ?? []) as { id: string; name_key: string }[]).map((e) => [e.name_key, e.id]),
    )
    const positionByLabel = new Map<string, string>()
    for (const p of (positions ?? []) as { id: string; code: string; name: string }[]) {
      positionByLabel.set(p.name.toLowerCase(), p.id)
      positionByLabel.set(p.code.toLowerCase(), p.id)
    }
    const outletByCode = new Map(
      ((outlets ?? []) as { id: string; code: string; name: string }[]).flatMap((o) => [
        [o.code.toUpperCase(), o.id] as const,
        [o.name.toUpperCase(), o.id] as const,
      ]),
    )

    const toOutletCode = (value: string | null) =>
      value ? value.trim().toUpperCase().replace(/\s+/g, '_') : null

    const records = parsed.cells.map((cell) => ({
      batch_id: batch.id,
      sheet_name: cell.sheetName,
      row_number: cell.rowNumber,
      column_label: cell.columnLabel,
      source_value: cell.sourceValue,
      source_name: cell.sourceName,
      source_position: cell.sourcePosition,
      work_date: cell.workDate,
      parse_status: cell.status,
      parse_message: cell.message,
      parsed: (cell.parsed ?? {}) as unknown as Record<string, unknown>,
      matched_employee_id: employeeByName.get(normaliseName(cell.sourceName)) ?? null,
      matched_position_id: cell.sourcePosition
        ? (positionByLabel.get(cell.sourcePosition.toLowerCase()) ?? null)
        : null,
      matched_outlet_id: outletByCode.get(toOutletCode(cell.sourceOutlet) ?? '') ?? null,
      is_included: cell.status !== 'ERROR',
    }))

    // Insert in chunks; a full year of roster is a few thousand rows.
    for (let index = 0; index < records.length; index += 500) {
      const { error } = await supabase.from('import_records').insert(records.slice(index, index + 500))
      if (error) throw new Error(error.message)
    }

    revalidatePath('/admin/import')
    return {
      ok: true,
      id: batch.id,
      message: `Parsed ${parsed.summary.totalCells} roster cells from ${parsed.summary.sheets.length} sheets. Nothing has been imported yet.`,
    }
  } catch (error) {
    return actionFailure(error)
  }
}

export async function setRecordIncluded(recordId: string, included: boolean): Promise<ActionResult> {
  try {
    await assertPermission('import.run')
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase
      .from('import_records')
      .update({ is_included: included })
      .eq('id', recordId)
    if (error) throw new Error(error.message)
    revalidatePath('/admin/import')
    return { ok: true }
  } catch (error) {
    return actionFailure(error)
  }
}

export async function cancelBatch(batchId: string): Promise<ActionResult> {
  try {
    await assertPermission('import.run')
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase
      .from('import_batches')
      .update({ status: 'CANCELLED' })
      .eq('id', batchId)
    if (error) throw new Error(error.message)
    revalidatePath('/admin/import')
    return { ok: true, message: 'Import cancelled. Nothing was written to the roster.' }
  } catch (error) {
    return actionFailure(error)
  }
}

/**
 * Commit a reviewed batch to the roster.
 *
 * Historical weeks are created, filled, then published and locked, so imported
 * history behaves exactly like history the restaurant produced in the app.
 * That is why this needs roster.publish as well as import.run.
 */
export async function commitImport(
  batchId: string,
  options: { createMissingEmployees: boolean },
): Promise<ActionResult> {
  try {
    await assertPermission('import.run')
    await assertPermission('roster.publish')

    const supabase = await createSupabaseServerClient()
    const settings = await getSettings()

    const { data: batch } = await supabase
      .from('import_batches')
      .select('id, status, file_name')
      .eq('id', batchId)
      .maybeSingle()
    if (!batch) return { ok: false, error: 'That import batch no longer exists.' }
    if (batch.status === 'COMMITTED') return { ok: false, error: 'This batch has already been imported.' }

    const { data: recordRows, error: recordError } = await supabase
      .from('import_records')
      .select('*')
      .eq('batch_id', batchId)
      .eq('is_included', true)
      .neq('parse_status', 'ERROR')
    if (recordError) throw new Error(recordError.message)

    interface StagedRecord {
      id: string
      source_name: string
      source_position: string | null
      source_value: string | null
      work_date: string | null
      parsed: ParsedShift
      matched_employee_id: string | null
      matched_position_id: string | null
      matched_outlet_id: string | null
    }
    const records = (recordRows ?? []) as unknown as StagedRecord[]
    if (records.length === 0) return { ok: false, error: 'There is nothing selected to import.' }

    // 1. Optionally create the employees the spreadsheet mentions but the
    //    master does not have yet.
    let createdEmployees = 0
    const employeeByName = new Map<string, string>()
    for (const record of records) {
      if (record.matched_employee_id) employeeByName.set(normaliseName(record.source_name), record.matched_employee_id)
    }

    if (options.createMissingEmployees) {
      await assertPermission('staff.create')
      const missing = new Map<string, { name: string; positionId: string | null }>()
      for (const record of records) {
        const key = normaliseName(record.source_name)
        if (employeeByName.has(key) || missing.has(key)) continue
        missing.set(key, { name: record.source_name.trim(), positionId: record.matched_position_id })
      }

      if (missing.size > 0) {
        const { data: lastCodes } = await supabase
          .from('employees')
          .select('employee_code')
          .like('employee_code', 'IMP%')
          .order('employee_code', { ascending: false })
          .limit(1)
        let next =
          Number(((lastCodes ?? [])[0] as { employee_code?: string } | undefined)?.employee_code?.slice(3) ?? 0) + 1

        for (const [key, info] of missing) {
          const { data: created, error } = await supabase
            .from('employees')
            .insert({
              employee_code: `IMP${String(next).padStart(3, '0')}`,
              full_name: info.name,
              position_id: info.positionId,
              is_active: false, // imported from history; the Admin activates who is still with us
              notes: `Created by the Excel import from ${batch.file_name}.`,
            })
            .select('id')
            .single()
          if (error) throw new Error(`Creating ${info.name}: ${error.message}`)
          employeeByName.set(key, created.id)
          createdEmployees += 1
          next += 1
        }
      }
    }

    // 2. Make sure a weekly period exists for every date being imported.
    const weekStarts = new Set<string>()
    for (const record of records) {
      if (!record.work_date) continue
      weekStarts.add(startOfWeekISO(record.work_date, settings.week_start_day))
    }

    const periodByWeek = new Map<string, string>()
    for (const weekStart of weekStarts) {
      const { data: existing } = await supabase
        .from('roster_periods')
        .select('id, status')
        .eq('start_date', weekStart)
        .eq('period_type', 'WEEK')
        .is('outlet_id', null)
        .maybeSingle()

      if (existing) {
        if (existing.status === 'LOCKED') {
          // Unlock it for the duration of the import; it is locked again below.
          const { error } = await supabase.rpc('set_roster_status', {
            p_period_id: existing.id,
            p_action: 'UNLOCK',
            p_reason: `Excel import from ${batch.file_name}`,
            p_note: null,
          })
          if (error) throw new Error(`Unlocking the week of ${weekStart}: ${error.message}`)
        }
        periodByWeek.set(weekStart, existing.id)
        continue
      }

      const dates = weekDates(weekStart)
      const { data: created, error } = await supabase
        .from('roster_periods')
        .insert({
          outlet_id: null,
          period_type: 'WEEK',
          start_date: weekStart,
          end_date: dates[6]!,
          status: 'DRAFT',
          name: `Imported from ${batch.file_name}`,
          notes: 'Created by the historical Excel import.',
        })
        .select('id')
        .single()
      if (error) throw new Error(`Creating the week of ${weekStart}: ${error.message}`)
      periodByWeek.set(weekStart, created.id)
    }

    // 3. Write the assignments, keeping the original cell text on every row.
    const assignments: Record<string, unknown>[] = []
    const skipped: string[] = []

    for (const record of records) {
      if (!record.work_date) continue
      const employeeId = record.matched_employee_id ?? employeeByName.get(normaliseName(record.source_name))
      if (!employeeId) {
        skipped.push(record.source_name)
        continue
      }
      const periodId = periodByWeek.get(startOfWeekISO(record.work_date, settings.week_start_day))
      if (!periodId) continue

      const parsed = record.parsed
      const isWork = parsed.status === 'WORK'

      assignments.push({
        period_id: periodId,
        employee_id: employeeId,
        work_date: record.work_date,
        status: parsed.status,
        start_time: isWork ? parsed.startTime : null,
        end_time: isWork ? parsed.endTime : null,
        crosses_midnight: isWork ? parsed.crossesMidnight : false,
        is_split: isWork ? parsed.isSplit : false,
        segment2_start: isWork && parsed.isSplit ? parsed.segment2Start : null,
        segment2_end: isWork && parsed.isSplit ? parsed.segment2End : null,
        outlet_id: record.matched_outlet_id,
        position_id: record.matched_position_id,
        note: parsed.note,
        source_value: record.source_value,
        import_batch_id: batchId,
      })
    }

    // De-duplicate: one employee can only have one entry per date, and the
    // source file occasionally lists the same person twice in a week.
    const seen = new Set<string>()
    const unique = assignments.filter((row) => {
      const key = `${row.period_id}|${row.employee_id}|${row.work_date}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    for (let index = 0; index < unique.length; index += 500) {
      const { error } = await supabase
        .from('roster_assignments')
        .upsert(unique.slice(index, index + 500), { onConflict: 'period_id,employee_id,work_date' })
      if (error) throw new Error(error.message)
    }

    // 4. Publish and lock the imported weeks — this is history, not a draft.
    for (const periodId of periodByWeek.values()) {
      const published = await supabase.rpc('set_roster_status', {
        p_period_id: periodId,
        p_action: 'PUBLISH',
        p_reason: null,
        p_note: `Imported from ${batch.file_name}`,
      })
      if (published.error) throw new Error(published.error.message)

      const locked = await supabase.rpc('set_roster_status', {
        p_period_id: periodId,
        p_action: 'LOCK',
        p_reason: null,
        p_note: 'Imported historical roster',
      })
      if (locked.error) throw new Error(locked.error.message)
    }

    const { error: finishError } = await supabase
      .from('import_batches')
      .update({
        status: 'COMMITTED',
        committed_at: new Date().toISOString(),
        notes: `Imported ${unique.length} assignments across ${periodByWeek.size} weeks. ${createdEmployees} employees created. ${skipped.length} cells skipped for unmatched names.`,
      })
      .eq('id', batchId)
    if (finishError) throw new Error(finishError.message)

    revalidatePath('/admin/import')
    revalidatePath('/roster')

    const skippedNames = [...new Set(skipped)]
    return {
      ok: true,
      message:
        `Imported ${unique.length} assignments across ${periodByWeek.size} weeks, published and locked.` +
        (createdEmployees > 0 ? ` ${createdEmployees} employees were created as inactive.` : '') +
        (skippedNames.length > 0
          ? ` ${skippedNames.length} name(s) had no employee record and were skipped: ${skippedNames.slice(0, 5).join(', ')}${skippedNames.length > 5 ? '…' : ''}`
          : ''),
    }
  } catch (error) {
    return actionFailure(error)
  }
}
