/**
 * Imports the Barishal zone dealer ledgers (from "Borishal Zone_Power Int..pdf") into the ERP.
 *
 * Creates the "Barishal" zone if missing, one customer per dealer (with `due` set to the closing
 * balance), and one credit sheet entry per ledger line. Credit is goods given, debit is money
 * received, same as the paper sheet. No WhatsApp notifications are sent.
 *
 * Dealers whose phone number already exists in the ERP are skipped, so running it twice does not
 * duplicate anything.
 *
 * Usage:
 *   node scripts/import-barishal-ledger.mjs           # dry run, checks totals, changes nothing
 *   node scripts/import-barishal-ledger.mjs --apply
 */
import { readFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')
const ZONE_NAME = 'Barishal'
const CUSTOMER_CODE_PREFIX = 'PIL-CUS-'

// [date (d-m-yy), particulars, qty, unitPrice, debit, credit]
const DEALERS = [
  {
    name: 'Al-Barakah Battery House',
    company: 'Md. Kawser',
    phone: '01762-219244',
    location: 'Kashipur Bazar, Borishal',
    district: 'Barishal',
    expected: { debit: 2383450, credit: 2728450, balance: 345000 },
    rows: [
      ['29-1-26', 'Ak Power', 10, 13200, 0, 132000],
      ['3-2-26', 'Diposit (DBBL)', 0, 0, 125000, 0],
      ['3-2-26', 'Ak Power', 20, 13200, 0, 264000],
      ['15-2-26', 'Diposit (DBBL)', 0, 0, 200000, 0],
      ['15-2-26', 'Ak Power', 20, 13200, 0, 264000],
      ['19-2-26', 'Diposit (rezwan)', 0, 0, 10000, 0],
      ['1-3-26', 'Diposit (DBBL) {Khan}', 0, 0, 55000, 0],
      ['2-3-26', 'Diposit (DBBL) {Khan}', 0, 0, 79000, 0],
      ['2-3-26', 'Diposit (UCBL)', 0, 0, 50000, 0],
      ['4-3-26', 'Diposit (DBBL)', 0, 0, 20000, 0],
      ['5-3-26', 'Diposit (টিউবওয়েল)', 0, 0, 7000, 0],
      ['8-3-26', 'Ak Power', 10, 13200, 0, 132000],
      ['25-3-26', 'Diposit (DBBL)', 0, 0, 100000, 0],
      ['1-4-26', 'Ak Power', 10, 13800, 0, 138000],
      ['1-4-26', 'Delivery Fee', 0, 0, 500, 0],
      ['13-4-26', 'Diposit (DBBL)', 0, 0, 138000, 0],
      ['7-5-26', 'Diposit (DBBL)', 0, 0, 100000, 0],
      ['7-5-26', 'Ak Power 5 Mileage King 5', 10, 13800, 0, 138000],
      ['19-5-26', 'Diposit (Ak 1 pic to iliyas)', 0, 0, 13800, 0],
      ['23-5-26', 'Diposit (DBBL)', 0, 0, 55200, 0],
      ['9-6-26', 'Diposit (DBBL)', 0, 0, 70000, 0],
      ['9-6-26', 'Ak 5 M 5', 10, 13800, 0, 138000],
      ['9-6-26', 'Delivery Fee', 0, 0, 200, 0],
      ['10-6-26', 'Mileage King', 5, 13800, 0, 69000],
      ['10-6-26', 'Delivery fee', 0, 0, 0, 750],
      ['13-6-26', 'Mileage King', 5, 13800, 0, 69000],
      ['13-6-26', 'Delivery fee', 0, 0, 250, 0],
      ['14-6-26', 'Diposit (DBBL)', 0, 0, 100000, 0],
      ['16-6-26', 'Diposit (DBBL)', 0, 0, 100000, 0],
      ['28-6-26', 'Ak Power', 15, 13600, 0, 204000],
      ['30-6-26', 'Diposit (DBBL)', 0, 0, 69000, 0],
      ['11-7-26', 'Diposit (DBBL)', 0, 0, 100000, 0],
      ['14-7-26', 'Ak Power', 7, 13600, 0, 95200],
      ['15-7-26', 'Diposit (DBBL)', 0, 0, 100000, 0],
      ['15-7-26', 'Ak Power', 5, 13600, 0, 68000],
      ['21-7-26', 'Diposit (DBBL)', 0, 0, 68000, 0],
      ['27-7-26', 'Y LongXing Asid Battery', 5, 13600, 0, 68000],
      ['1-8-26', 'Diposit (DBBL)', 0, 0, 68000, 0],
      ['12-8-26', 'Ak power plus', 5, 13600, 0, 68000],
      ['16-8-26', 'Deposit (DBBL)', 0, 0, 68000, 0],
      ['18-8-26', 'Y Long Xing Battery Return', 0, 0, 68000, 0],
      ['20-8-26', 'Ak power plus', 5, 13500, 0, 67500],
      ['25-8-26', 'Deposit (DBBL)', 0, 0, 67500, 0],
      ['25-8-26', 'Ak power plus', 10, 13500, 0, 135000],
      ['31-8-26', 'Deposit (DBBL)', 0, 0, 80000, 0],
      ['1-9-26', 'Mileage king', 20, 13600, 0, 272000],
      ['13-9-26', 'Deposit DBBL', 0, 0, 135000, 0],
      ['15-9-26', 'Deposit DBBL', 0, 0, 50000, 0],
      ['16-9-26', 'Mileage king', 10, 13600, 0, 136000],
      ['21-9-26', 'Deposit DBBL', 0, 0, 50000, 0],
      ['23-9-26', 'Deposit DBBL', 0, 0, 100000, 0],
      ['24-9-26', 'Mileage King', 20, 13500, 0, 270000],
      ['30-9-26', 'Deposit DBBL', 0, 0, 136000, 0],
    ],
  },
  {
    name: 'Bismillah Battery House',
    company: 'Najim Uddin & iliyas Hossain',
    phone: '01716-471942',
    location: 'Potuakhali (Najim Uddin: 01712-558961)',
    district: 'Patuakhali',
    expected: { debit: 843300, credit: 919800, balance: 76500 },
    rows: [
      ['22-2-26', 'Ak Power', 5, 13200, 0, 66000],
      ['25-2-26', 'Diposit (IBBL)', 0, 0, 60000, 0],
      ['27-2-26', 'Ak Power', 14, 13200, 0, 184800],
      ['12-3-26', 'Diposit (IBBL)', 0, 0, 50000, 0],
      ['16-3-26', 'Diposit (IBBL)', 0, 0, 25800, 0],
      ['2-4-26', 'Diposit (IBBL)', 0, 0, 50000, 0],
      ['30-4-26', 'Diposit (DBBL)', 0, 0, 40500, 0],
      ['5-5-26', 'Diposit (IBBL)', 0, 0, 15000, 0],
      ['5-5-26', 'Ak Power', 4, 13800, 0, 55200],
      ['13-5-26', 'Diposit (IBBL)', 0, 0, 35000, 0],
      ['17-5-26', 'Ak power 4 Mileage king 5', 9, 13800, 0, 124200],
      ['19-5-26', 'Ak Power (from kawser 1 pic)', 1, 13800, 0, 13800],
      ['23-5-26', 'Diposit (IBBL)', 0, 0, 80000, 0],
      ['2-6-26', 'Diposit (IBBL)', 0, 0, 40000, 0],
      ['13-6-26', 'Diposit (DBBL)', 0, 0, 27000, 0],
      ['18-6-26', 'Ak power', 4, 13800, 0, 55200],
      ['22-6-26', 'Diposit (DBBL)', 0, 0, 20000, 0],
      ['29-6-26', 'Diposit (UCBL)', 0, 0, 40000, 0],
      ['27-7-26', 'Y LongXing Asid Battery', 10, 13600, 0, 136000],
      ['10-8-26', 'Diposit (IBBL)', 0, 0, 30000, 0],
      ['12-8-26', 'Diposit (IBBL)', 0, 0, 50000, 0],
      ['13-8-26', 'Y LongXing Asid Battery', 2, 13600, 0, 27200],
      ['20-8-26', 'Ak power plus', 5, 13500, 0, 67500],
      ['27-8-26', 'Deposit (IBBL)', 0, 0, 15000, 0],
      ['31-8-26', 'Deposit (IBBL)', 0, 0, 75000, 0],
      ['1-9-26', 'Ak power plus', 5, 13500, 0, 67500],
      ['1-9-26', 'Mileage king', 5, 13600, 0, 68000],
      ['20-9-26', 'Deposit IBBL', 0, 0, 40000, 0],
      ['21-9-26', 'Deposit IBBL', 0, 0, 50000, 0],
      ['21-9-26', 'Mileage king', 4, 13600, 0, 54400],
      ['29-9-26', 'Deposit IBBL', 0, 0, 100000, 0],
    ],
  },
  {
    name: 'Joshim Store',
    company: 'Joshim Uddin',
    phone: '01718-948592',
    location: 'Ukil para, Vola Sadar, Vola.',
    district: 'Bhola',
    expected: { debit: 1347800, credit: 1593600, balance: 245800 },
    rows: [
      ['23-2-26', 'Ak Power', 10, 13200, 0, 132000],
      ['1-3-26', 'Diposit (DBBL)', 0, 0, 100000, 0],
      ['2-3-26', 'Diposit (DBBL)', 0, 0, 31500, 0],
      ['2-3-26', 'Delivery Fee Discount', 0, 0, 500, 0],
      ['2-3-26', 'Ak Power', 19, 13200, 0, 250800],
      ['18-3-26', 'Diposit (IBBL)', 0, 0, 80000, 0],
      ['5-4-26', 'Diposit (DBBL)', 0, 0, 60000, 0],
      ['7-4-26', 'Diposit (DBBL)', 0, 0, 50000, 0],
      ['9-4-26', 'Mileage King', 10, 13800, 0, 138000],
      ['14-4-26', 'Diposit (DBBL)', 0, 0, 90000, 0],
      ['23-4-26', 'Mileage King', 10, 13800, 0, 138000],
      ['25-4-26', 'Diposit (DBBL)', 0, 0, 50000, 0],
      ['26-4-26', 'Diposit (DBBL)', 0, 0, 80000, 0],
      ['2-5-26', 'Diposit (DBBL)', 0, 0, 60000, 0],
      ['3-5-26', 'Mileage King', 15, 13800, 0, 207000],
      ['5-5-26', 'Diposit (DBBL)', 0, 0, 38000, 0],
      ['5-5-26', 'Diposit (DBBL)', 0, 0, 110000, 0],
      ['5-5-26', 'Mileage King', 20, 13800, 0, 276000],
      ['16-5-26', 'Diposit (DBBL)', 0, 0, 87000, 0],
      ['17-5-26', 'Diposit (DBBL)', 0, 0, 70000, 0],
      ['25-5-26', 'Diposit (DBBL)', 0, 0, 50000, 0],
      ['1-6-26', 'Diposit (DBBL)', 0, 0, 67000, 0],
      ['3-6-26', 'Diposit (DBBL)', 0, 0, 76000, 0],
      ['10-6-26', 'Diposit (DBBL)', 0, 0, 41800, 0],
      ['10-6-26', 'Ak Power', 5, 13800, 0, 69000],
      ['13-6-26', 'Mileage King', 10, 13800, 0, 138000],
      ['15-7-26', 'Diposit (DBBL)', 0, 0, 50000, 0],
      ['30-7-26', 'Y LongXing Asid Battery', 8, 13600, 0, 108800],
      ['6-8-26', 'Diposit (IBBL)', 0, 0, 26000, 0],
      ['11-8-26', 'Diposit (IBBL)', 0, 0, 50000, 0],
      ['13-8-26', 'Y LongXing Asid Battery', 10, 13600, 0, 136000],
      ['23-8-26', 'Deposit (DBBL)', 0, 0, 30000, 0],
      ['10-9-26', 'Deposit (DBBL)', 0, 0, 30000, 0],
      ['29-9-26', 'Deposit UCB', 0, 0, 20000, 0],
    ],
  },
  {
    name: 'Khan Battery House',
    company: 'Md. Akash',
    phone: '01821-669593',
    location: 'Guachitra Bazar, Jhalokathy Road, Jhalokathy.',
    district: 'Jhalokati',
    expected: { debit: 3029200, credit: 3086000, balance: 56800 },
    rows: [
      ['6-3-26', 'Ak power', 8, 13200, 0, 105600],
      ['6-3-26', 'AK power (Recieve from Kawser)', 5, 13200, 0, 66000],
      ['8-3-26', 'Diposit (DBBL)', 0, 0, 80000, 0],
      ['8-3-26', 'Ak Power', 13, 13200, 0, 171600],
      ['12-3-26', 'Dposit (IBBL)', 0, 0, 200000, 0],
      ['17-3-26', 'Diposit (DBBL)', 0, 0, 63200, 0],
      ['1-4-26', 'Ak Power', 10, 13800, 0, 138000],
      ['1-4-26', 'Delivery Fee', 0, 0, 500, 0],
      ['12-4-26', 'Diposit (DBBL)', 0, 0, 137500, 0],
      ['12-4-26', 'Mileage King', 20, 13800, 0, 276000],
      ['19-4-26', 'Diposit (IBBL)', 0, 0, 276000, 0],
      ['19-4-26', 'Ak Power', 5, 13800, 0, 69000],
      ['19-4-26', 'Mileage King', 5, 13800, 0, 69000],
      ['26-4-26', 'Diposit (DBBL)', 0, 0, 138000, 0],
      ['26-4-26', 'Ak Power', 8, 13800, 0, 110400],
      ['26-4-26', 'Mileage King', 12, 13800, 0, 165600],
      ['26-4-26', 'Delivery Fee', 0, 0, 1000, 0],
      ['3-5-26', 'Diposit (DBBL)', 0, 0, 150000, 0],
      ['3-5-26', 'Mileage King', 10, 13800, 0, 138000],
      ['3-5-26', 'Delivery Fee', 0, 0, 500, 0],
      ['10-5-26', 'Diposit (DBBL)', 0, 0, 120000, 0],
      ['14-5-26', 'Ak 5 M 5', 10, 13800, 0, 138000],
      ['19-5-26', 'Diposit (DBBL)', 0, 0, 70000, 0],
      ['21-5-26', 'Diposit (DBBL)', 0, 0, 100000, 0],
      ['21-5-26', 'Ak power 10 Mileage king 10', 20, 13800, 0, 276000],
      ['21-5-26', 'Delivery Fee (old+new)', 0, 0, 1200, 0],
      ['24-5-26', 'Diposit (IBBL)', 0, 0, 100000, 0],
      ['2-6-26', 'Diposit (DBBL)', 0, 0, 130000, 0],
      ['10-6-26', 'Ak 5 M 5', 10, 13800, 0, 138000],
      // The sheet says 10-5-26, but the line sits between 10-6 and 14-6.
      ['10-6-26', 'Delivery fee', 0, 0, 400, 0],
      ['14-6-26', 'Diposit (DBBL)', 0, 0, 160000, 0],
      ['14-6-26', 'Mileage King', 10, 13800, 0, 138000],
      ['14-6-26', 'Delivery Fee', 0, 0, 300, 0],
      ['22-6-26', 'Diposit (DBBL)', 0, 0, 130000, 0],
      ['27-6-26', 'Ak power', 15, 13600, 0, 204000],
      ['28-6-26', 'Diposit (DBBL)', 0, 0, 120000, 0],
      ['4-7-26', 'Ak Power', 10, 13600, 0, 136000],
      ['8-7-26', 'Diposit (DBBL)', 0, 0, 65000, 0],
      ['12-7-26', 'Diposit (DBBL)', 0, 0, 110000, 0],
      ['12-7-26', 'Diposit (DBBL)', 0, 0, 70000, 0],
      ['21-7-26', 'Diposit (DBBL)', 0, 0, 115600, 0],
      ['21-7-26', 'Ak Power', 10, 13600, 0, 136000],
      ['27-7-26', 'Y LongXing Asid Battery', 10, 13600, 0, 136000],
      ['30-7-26', 'Diposit (DBBL)', 0, 0, 100000, 0],
      ['6-8-26', 'Diposit (DBBL)', 0, 0, 100000, 0],
      ['9-8-26', 'Ak Power', 8, 13600, 0, 108800],
      ['16-8-26', 'Deposit (DBBL)', 0, 0, 70000, 0],
      ['18-8-26', 'Y Long Xing Battery', 5, 13600, 0, 68000],
      ['18-8-26', 'Deposit (DBBL)', 0, 0, 100000, 0],
      ['25-8-26', 'Ak power plus', 7, 13500, 0, 94500],
      ['8-9-26', 'Deposit (DBBL)', 0, 0, 120000, 0],
      ['13-9-26', 'Ak power plus', 5, 13500, 0, 67500],
      ['13-9-26', 'Mileage king', 10, 13600, 0, 136000],
      ['20-9-26', 'Deposit IBBL', 0, 0, 200000, 0],
    ],
  },
  {
    name: 'M/S Alamin Autos',
    company: 'Md. Alamin',
    phone: '01763-315359',
    location: 'Dorgah Road, westurn para, Vola sadar, Vola.',
    district: 'Bhola',
    expected: { debit: 1238400, credit: 1388200, balance: 149800 },
    rows: [
      ['2-3-26', 'Ak Power', 12, 13200, 0, 158400],
      ['11-3-26', 'Diposit (DBBL)', 0, 0, 70000, 0],
      ['30-3-26', 'Diposit (DBBL)', 0, 0, 88400, 0],
      ['31-3-26', 'Ak Power', 20, 13800, 0, 276000],
      ['30-4-26', 'Diposit (DBBL)', 0, 0, 100000, 0],
      // The sheet says 11-1-26, but the line sits between 30-4 and 12-5.
      ['11-5-26', 'Diposit (DBBL)', 0, 0, 100000, 0],
      ['12-5-26', 'Ak Power', 20, 13800, 0, 276000],
      ['19-5-26', 'Diposit (DBBL)', 0, 0, 100000, 0],
      ['8-6-26', 'Diposit (DBBL)', 0, 0, 100000, 0],
      ['22-6-26', 'Diposit (DBBL)', 0, 0, 50000, 0],
      ['6-7-26', 'Diposit (DBBL)', 0, 0, 50000, 0],
      ['9-7-26', 'Ak Power', 8, 13600, 0, 108800],
      ['20-7-26', 'Diposit (DBBL)', 0, 0, 50000, 0],
      ['29-7-26', 'Diposit (DBBL)', 0, 0, 50000, 0],
      ['9-8-26', 'Ak Power', 20, 13600, 0, 272000],
      ['16-8-26', 'Diposit (DBBL)', 0, 0, 60000, 0],
      ['24-8-26', 'Deposit (DBBL)', 0, 0, 100000, 0],
      ['25-8-26', 'Ak power plus', 2, 13500, 0, 27000],
      ['31-8-26', 'Deposit (DBBL)', 0, 0, 100000, 0],
      ['31-8-26', 'Ak power plus', 20, 13500, 0, 270000],
      ['27-9-26', 'Deposit DBBL', 0, 0, 220000, 0],
    ],
  },
  {
    name: 'Sara Battery & Auto Parts',
    company: 'Md. Giyassuddin',
    phone: '01913-391989',
    location: 'Side of Model madrasa, Lalmohon, Vola. (Alt: 01911-957671)',
    district: 'Bhola',
    expected: { debit: 312000, credit: 479000, balance: 167000 },
    rows: [
      ['6-3-26', 'Ak Power', 10, 13200, 0, 132000],
      ['2-4-26', 'Diposit (IBBL)', 0, 0, 50000, 0],
      ['4-4-26', 'Diposit (DBBL)', 0, 0, 50000, 0],
      ['6-4-26', 'Ak Power', 10, 14000, 0, 140000],
      ['8-4-26', 'Diposit (DBBL)', 0, 0, 50000, 0],
      ['22-4-26', 'Diposit (DBBL)', 0, 0, 50000, 0],
      ['3-5-26', 'Diposit (DBBL)', 0, 0, 32000, 0],
      ['3-5-26', 'Ak Power 10 Mileage King 5', 15, 13800, 0, 207000],
      ['4-7-26', 'Diposit (DBBL)', 0, 0, 30000, 0],
      ['12-8-26', 'Deposit (DBBL)', 0, 0, 30000, 0],
      ['14-9-26', 'Deposit IBBL', 0, 0, 20000, 0],
    ],
  },
  {
    name: 'Ma Babar Dua sanitary',
    company: 'Md Abu Bakar Siddik',
    phone: '01967-535420',
    location: 'Babuganj, Barishal',
    district: 'Barishal',
    expected: { debit: 67000, credit: 134000, balance: 67000 },
    rows: [
      ['29-9-26', 'Deposit IBBL', 0, 0, 67000, 0],
      ['30-9-26', 'Ak Power Plus', 10, 13400, 0, 134000],
    ],
  },
]

function loadEnvFile(path) {
  try {
    for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const separator = line.indexOf('=')
      if (separator === -1) continue
      const key = line.slice(0, separator).trim()
      const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, '')
      if (!(key in process.env)) process.env[key] = value
    }
  } catch {
    // Missing env files are fine; the variables may already be set.
  }
}

// 'd-m-yy' → ISO, with the row's position as minutes so lines on the same day keep the sheet's order.
function toIsoDate(text, position) {
  const [day, month, year] = text.split('-').map(Number)
  return new Date(Date.UTC(2000 + year, month - 1, day, 6, position)).toISOString()
}

const digits = (phone) => String(phone ?? '').replace(/\D/g, '').slice(-10)
let idCounter = 0
const createId = (prefix) => `${prefix}_${Date.now() + idCounter++}_${Math.random().toString(36).slice(2, 8)}`

// Check the transcription against the sheet's own totals before touching anything.
let mismatches = 0
for (const dealer of DEALERS) {
  const debit = dealer.rows.reduce((sum, row) => sum + row[4], 0)
  const credit = dealer.rows.reduce((sum, row) => sum + row[5], 0)
  const qty = dealer.rows.reduce((sum, row) => sum + row[2], 0)
  const balance = credit - debit
  const ok = debit === dealer.expected.debit && credit === dealer.expected.credit && balance === dealer.expected.balance
  if (!ok) mismatches++
  console.log(
    `${ok ? 'OK ' : 'BAD'} ${dealer.name.padEnd(28)} rows ${String(dealer.rows.length).padStart(3)}  qty ${String(qty).padStart(4)}  debit ${debit.toLocaleString('en-US').padStart(10)}  credit ${credit.toLocaleString('en-US').padStart(10)}  due ${balance.toLocaleString('en-US').padStart(9)}`
  )
}
const grandDue = DEALERS.reduce((sum, dealer) => sum + dealer.rows.reduce((total, row) => total + row[5] - row[4], 0), 0)
console.log(`Total due: ${grandDue.toLocaleString('en-US')}`)
if (mismatches) {
  console.error('Totals do not match the sheet; fix the rows above before importing.')
  process.exit(1)
}
if (!APPLY) {
  console.log('\nDry run. Pass --apply to write to the database.')
  process.exit(0)
}

loadEnvFile('.env')
loadEnvFile('.env.local')
const { cert, initializeApp } = await import('firebase-admin/app')
const { getDatabase } = await import('firebase-admin/database')
initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
})
const db = getDatabase()

const [zonesSnap, customersSnap] = await Promise.all([db.ref('erp/zones').get(), db.ref('erp/customers').get()])
const zones = Object.values(zonesSnap.val() ?? {})
const customers = Object.values(customersSnap.val() ?? {})
const now = new Date().toISOString()
const updates = {}

let zone = zones.find((entry) => entry.name?.trim().toLowerCase() === ZONE_NAME.toLowerCase())
if (!zone) {
  const id = createId('zone')
  zone = { id, name: ZONE_NAME, thanas: [], districts: [], managerIds: [], createdAt: now, updatedAt: now }
  updates[`zones/${id}`] = zone
  console.log(`\nCreating zone ${ZONE_NAME}`)
}

let highestCode = customers.reduce((max, customer) => {
  const match = customer.code?.startsWith(CUSTOMER_CODE_PREFIX) ? customer.code.match(/(\d+)$/) : null
  return match ? Math.max(max, Number(match[1])) : max
}, 0)

for (const dealer of DEALERS) {
  if (customers.some((customer) => digits(customer.phone) === digits(dealer.phone))) {
    console.log(`Skipping ${dealer.name}: a customer with ${dealer.phone} already exists`)
    continue
  }
  const id = createId('customer')
  const code = `${CUSTOMER_CODE_PREFIX}${String(++highestCode).padStart(4, '0')}`
  const due = dealer.rows.reduce((sum, row) => sum + row[5] - row[4], 0)
  updates[`customers/${id}`] = {
    id, code, name: dealer.name, company: dealer.company, phone: dealer.phone, email: '',
    location: dealer.location, due, leadSource: 'local-marketing', reminderCustomer: false,
    nid: '', tradeLicenseNo: '', nomineeName: '', nomineeNid: '', thana: '', district: dealer.district,
    chequeNumber: '', bankName: '', branchName: '',
    nidCopyUrl: '', nidCopyPublicId: '', tradeLicenseCopyUrl: '', tradeLicenseCopyPublicId: '',
    passportPhotoUrl: '', passportPhotoPublicId: '', bankDocumentUrl: '', bankDocumentPublicId: '',
    dealerPhotoUrl: '', dealerPhotoPublicId: '', signatureUrl: '', signaturePublicId: '',
    zoneId: zone.id, createdAt: now, updatedAt: now,
  }
  dealer.rows.forEach(([date, particulars, qty, unitPrice, debit, credit], position) => {
    const entryId = createId('credit_entry')
    updates[`creditLedgerEntries/${entryId}`] = {
      id: entryId, customerId: id, customerName: dealer.name, date: toIsoDate(date, position),
      particulars, qty, unitPrice, debit, credit, createdAt: now,
    }
  })
  console.log(`Adding ${dealer.name} (${code}) with ${dealer.rows.length} entries, due ${due.toLocaleString('en-US')}`)
}

const activityId = createId('activity')
updates[`activities/${activityId}`] = {
  id: activityId, action: 'credit_entry_recorded', module: 'customers',
  message: `Imported the ${ZONE_NAME} zone dealer ledgers.`, userId: 'system', userName: 'Import script', createdAt: now,
}

await db.ref('erp').update(updates)
console.log(`\nDone: wrote ${Object.keys(updates).length} records.`)
process.exit(0)
