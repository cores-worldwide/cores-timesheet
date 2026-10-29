// What the scan-report function asks Claude to read, per report template.
// The matching cell map (where each reading lands in the .xlsx) lives in the
// app at src/utils/reportTemplates.js. Ids and keys here must match it —
// scripts/test-xlsx-fill.mjs checks that they do.
//
// Plain JS (no Deno or Node APIs) so the Node test scripts can import it too.

const ROCKER_ROWS_A = ['A1', 'A2', 'A3', 'A4']
const ROCKER_ROWS_B = ['B1', 'B2', 'B3', 'B4']

export const READ_TEMPLATES = {
  'alco-valve-train-inspection': {
    title: 'ALCO Valve Train Inspection (rocker arm & pin)',
    // Only fields that exist on the printed template. Anything else written on
    // the paper (e.g. the technician's name) is ignored (Jim's rule).
    header: {
      customer: 'The value written in the "Customer:" field. null if blank.',
      job_no: 'The value written in the "Job No.:" field, exactly as written including any block/bank text (e.g. "4685 C-Block").',
      date: 'The value written in the "Date:" field, exactly as written (e.g. "Oct 19/26"). Do not reformat it.',
      tool: 'The text written after the printed "Tool-" label (e.g. 1-2" outside). Do not include the "Tool-" label itself.',
      serial_number: 'The value written in the "Serial Number:" field, exactly as written. Do not put a block or bank letter here unless it is written in this field.',
    },
    columns: 8,
    columnHeadingsHelp: 'The 8 measurement column headings across the top of the grid, left to right, exactly as written (e.g. L1..L8 or R1..R8). If a heading is the printed default and nothing is written over it, return the printed text.',
    sections: [
      { key: 'intake_bushing_id', label: 'Intake Rocker Bushing I.D.', rows: ROCKER_ROWS_A },
      { key: 'intake_shaft_od', label: 'Intake Rocker Shaft O.D.', rows: ROCKER_ROWS_B },
      { key: 'exhaust_bushing_id', label: 'Exhaust Rocker Bushing I.D.', rows: ROCKER_ROWS_A },
      { key: 'exhaust_shaft_od', label: 'Exhaust Rocker Shaft O.D.', rows: ROCKER_ROWS_B },
    ],
  },
}
