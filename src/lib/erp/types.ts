export type PermissionDefinition = {
  id: string
  label: string
  description: string
  category: string
  action: 'view' | 'edit' | 'delete'
}

export type RoleRecord = {
  id: string
  name: string
  description: string
  permissions: string[]
  /** Zones this role is limited to. Users with the role only see those zones' customers. Empty means no limit. */
  zoneIds?: string[]
  /**
   * `assigned` limits each user of the role to the zones and areas assigned to them (and to
   * their subordinates), so a user with nothing assigned sees no customers. `all` (the default)
   * only limits a user who has zones or areas assigned.
   */
  dataScope?: RoleDataScope
}

export type RoleDataScope = 'all' | 'assigned'

export type RoleInput = {
  name: string
  description?: string
  permissions: string[]
  zoneIds?: string[]
  dataScope?: RoleDataScope
}

/**
 * Credentials live in Firebase Authentication, never in the database, so this
 * record deliberately has no password field.
 */
export type UserRecord = {
  id: string
  name: string
  loginId: string
  email: string
  phone: string
  roleId: string
  title: string
  status: 'active' | 'inactive'
  /** Zones the user works in, e.g. a Zonal Manager's zone. */
  zoneIds?: string[]
  /** Areas (sub-zones) the user works in, as `subZoneKeyFor(zoneId, subZone)` keys, e.g. an Area Sales Manager's area. */
  areaKeys?: string[]
  /** The user's supervisor. Supervisors also see their subordinates' territories and officer records. */
  reportsTo?: string
  /** Additional roles an admin approved. The user gets the access of `roleId` and all of these. */
  extraRoleIds?: string[]
  /** Additional roles requested by a non-admin, which grant nothing until an admin approves them. */
  pendingRoleIds?: string[]
  /** Who last requested a pending role. */
  roleRequestedBy?: string
  /** Login info kept by the server. The password itself only lives in Firebase Authentication. */
  lastLoginAt?: string
  loginCount?: number
  passwordChangedAt?: string
  /** The user's own id when they changed it themselves, otherwise the admin who set it. */
  passwordChangedBy?: string
}

/** One sign-in, as the server recorded it. */
export type LoginHistoryEntry = {
  at: string
  method: 'email' | 'phone' | 'loginId'
  ip: string
  userAgent: string
}

export type WarehouseRecord = {
  id: string
  name: string
  location: string
}

export type SupplierRecord = {
  id: string
  name: string
  company: string
  phone: string
  email: string
  location: string
  supplierType: 'local' | 'foreign' | 'importer'
  country: string
  lcNumber: string
  lcStatus: 'not-required' | 'pending' | 'opened' | 'released' | 'closed'
  productCost: number
  shippingCost: number
  customsDuty: number
  otherCost: number
  currency: string
  notes: string
  /** Products this supplier deals in, by name, as entered on the supplier form. */
  suppliedProducts: string[]
  bankAccountName: string
  bankAccountNumber: string
  bankName: string
  bankBranch: string
  bankRoutingNumber: string
  bankSwiftCode: string
  /** bKash / Nagad / Rocket number, when the supplier takes mobile payments. */
  mobileBankingNumber: string
  nid: string
  tradeLicenseNo: string
  nomineeName: string
  nomineeNid: string
  chequeNumber: string
  supplierPhotoUrl: string
  supplierPhotoPublicId: string
  bankDocumentUrl: string
  bankDocumentPublicId: string
  nidCopyUrl: string
  nidCopyPublicId: string
  tradeLicenseCopyUrl: string
  tradeLicenseCopyPublicId: string
  passportPhotoUrl: string
  passportPhotoPublicId: string
  signatureUrl: string
  signaturePublicId: string
  createdAt: string
  updatedAt: string
}

export type CustomerRecord = {
  id: string
  name: string
  company: string
  phone: string
  email: string
  location: string
  due: number
  leadSource?: 'facebook' | 'local-marketing'
  reminderCustomer?: boolean
  nid: string
  tradeLicenseNo: string
  nomineeName: string
  nomineeNid: string
  thana: string
  district: string
  chequeNumber: string
  bankName: string
  branchName: string
  nidCopyUrl: string
  nidCopyPublicId: string
  tradeLicenseCopyUrl: string
  tradeLicenseCopyPublicId: string
  passportPhotoUrl: string
  passportPhotoPublicId: string
  bankDocumentUrl: string
  bankDocumentPublicId: string
  dealerPhotoUrl: string
  dealerPhotoPublicId: string
  signatureUrl: string
  signaturePublicId: string
  /** Explicit zone. When empty the zone is resolved from the customer's district. */
  zoneId?: string
  commitments?: Record<string, CustomerCommitment>
  createdAt: string
  updatedAt: string
}

export type CustomerCommitmentStatus = 'pending' | 'fulfilled'

export type CustomerCommitment = {
  id: string
  note: string
  dueDate: string
  status: CustomerCommitmentStatus
  imageUrl?: string
  imagePublicId?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type CustomerCommitmentInput = {
  note: string
  dueDate?: string
  status?: CustomerCommitmentStatus
  imageUrl?: string
  imagePublicId?: string
}

/** A sub-zone inside a zone, named by an admin. `district` is only set on sub-zones from before zones were admin-defined. */
export type ZoneArea = {
  district: string
  thana: string
}

export type ZoneRecord = {
  id: string
  name: string
  /** Sub-zones, created by an admin. Dealers pick one of them; older dealers whose thana matches one fall into the zone. */
  thanas: ZoneArea[]
  /** Legacy whole-district coverage from before zones were split into thanas. */
  districts: string[]
  /** Users responsible for the zone. They only see this zone's customers on the credit sheet. */
  managerIds: string[]
  createdAt: string
  updatedAt: string
}

export type ZoneInput = {
  name: string
  thanas?: ZoneArea[]
  districts?: string[]
  managerIds?: string[]
}

export type ProductStatus = 'active' | 'low-stock' | 'out-of-stock'

export type ProductRecord = {
  id: string
  name: string
  category: string
  brand: string
  sku: string
  serialNumber?: string
  warrantyMonths?: number
  warehouseId: string
  supplierId: string
  purchasePrice: number
  sellingPrice: number
  wholesalePrice: number
  stockQty: number
  minStock: number
  maxStock: number
  status: ProductStatus
  description: string
  imageUrl?: string
  imagePublicId?: string
  createdAt: string
  updatedAt: string
}

export type OrderStatus = 'pending' | 'ready' | 'shipped' | 'completed' | 'hold'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'

export type OrderItem = {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  purchasePrice: number
}

export type OrderRecord = {
  id: string
  billNumber: string
  customerId: string
  customerName: string
  salesPersonId: string
  salesPersonName: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  total: number
  subtotal?: number
  discount?: number
  paid: number
  due: number
  deliveryDate: string
  paymentDueDate: string
  dueReference: 'owner' | 'courier' | 'bank' | 'bkash' | 'nagad' | 'dbbl' | ''
  overdueNotified?: boolean
  createdAt: string
  items: OrderItem[]
}

export type PurchaseRecord = {
  id: string
  productId: string
  productName: string
  supplierId: string
  supplierName: string
  quantity: number
  unitCost: number
  currency: string
  total: number
  status: 'pending' | 'received'
  createdAt: string
}

export type TaskStatus = 'pending' | 'in-progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export type TaskRecord = {
  id: string
  title: string
  description: string
  module: 'inventory' | 'sales' | 'support' | 'warehouse'
  status: TaskStatus
  priority: TaskPriority
  assigneeId: string
  assigneeName: string
  dueDate: string
  createdBy: string
  createdAt: string
}

export type NotificationRecord = {
  id: string
  title: string
  body: string
  level: 'info' | 'warning' | 'critical'
  read: boolean
  createdAt: string
  roles?: string[]
}

export type ActivityRecord = {
  id: string
  action: string
  module: string
  message: string
  userId: string
  userName: string
  createdAt: string
}

export type SettingsRecord = {
  companyName: string
  currency: string
  timezone: string
}

export type ExpenseRecord = {
  id: string
  category: string
  amount: number
  note: string
  date: string
  createdBy: string
  createdByName: string
  createdAt: string
}

export type SellerRecord = {
  id: string
  name: string
  phone: string
  location: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type SellerTransactionRecord = {
  id: string
  sellerId: string
  sellerName: string
  date: string
  itemsTaken: string
  takenValue: number
  cashGiven: number
  goodsBroughtDescription: string
  iReceiveAmount: number
  theyReceiveAmount: number
  createdAt: string
}

export type CreditLedgerEntryRecord = {
  id: string
  customerId: string
  customerName: string
  date: string
  particulars: string
  qty: number
  unitPrice: number
  debit: number
  credit: number
  createdAt: string
}

export type DamageProductStatus = 'pending' | 'sent-to-office' | 'received' | 'resolved'

export type DamageProductRecord = {
  id: string
  productName: string
  quantity: number
  zone: string
  reportedDate: string
  sentDate?: string
  receivedDate?: string
  reason: string
  notes: string
  status: DamageProductStatus
  createdAt: string
  updatedAt: string
}

export type LeadBusinessType = 'retailer' | 'wholesaler' | 'distributor' | 'other'

export type LeadPotential = 'high' | 'medium' | 'low'

/** A shop or area an officer visited: a possible future customer (the sales pipeline). */
export type LeadRecord = {
  id: string
  shopName: string
  ownerName: string
  businessType: LeadBusinessType
  address: string
  phone: string
  whatsapp: string
  bannerPhotoUrl: string
  bannerPhotoPublicId: string
  visitingCardUrl: string
  visitingCardPublicId: string
  /** The shop's reputation in the market. */
  reputation: string
  potential: LeadPotential
  notes: string
  zoneId?: string
  createdById: string
  createdByName: string
  createdAt: string
  updatedAt: string
}

export type CourierStatus = 'in-transit' | 'delivered' | 'returned' | 'cod-collected'

export type CourierRecord = {
  id: string
  customerId?: string
  customerName: string
  billNumber: string
  courierName: string
  productDescription: string
  quantity: number
  codAmount: number
  sentDate: string
  status: CourierStatus
  createdAt: string
  updatedAt: string
}

export type ERPData = {
  permissions: Record<string, PermissionDefinition>
  roles: Record<string, RoleRecord>
  users: Record<string, UserRecord>
  warehouses: Record<string, WarehouseRecord>
  suppliers: Record<string, SupplierRecord>
  customers: Record<string, CustomerRecord>
  zones: Record<string, ZoneRecord>
  products: Record<string, ProductRecord>
  orders: Record<string, OrderRecord>
  purchases: Record<string, PurchaseRecord>
  tasks: Record<string, TaskRecord>
  notifications: Record<string, NotificationRecord>
  activities: Record<string, ActivityRecord>
  expenses: Record<string, ExpenseRecord>
  sellers: Record<string, SellerRecord>
  sellerTransactions: Record<string, SellerTransactionRecord>
  creditLedgerEntries: Record<string, CreditLedgerEntryRecord>
  couriers: Record<string, CourierRecord>
  damageProducts: Record<string, DamageProductRecord>
  leads: Record<string, LeadRecord>
  investors: Record<string, InvestorRecord>
  employees: Record<string, EmployeeRecord>
  salesTargets: Record<string, SalesTargetRecord>
  salaries: Record<string, SalaryRecord>
  settings: SettingsRecord
  meta: {
    seededAt: string
    version: string
  }
}

export type InvestorRecord = {
  id: string
  name: string
  location: string
  mobile: string
  products: string
  amount: number
  note: string
  createdAt: string
  updatedAt: string
}

export type ProductInput = {
  name: string
  category?: string
  brand?: string
  sku: string
  serialNumber?: string
  warrantyMonths?: number
  warehouseId: string
  supplierId?: string
  purchasePrice: number
  sellingPrice: number
  wholesalePrice?: number
  stockQty: number
  minStock: number
  maxStock?: number
  description?: string
  imageUrl?: string
  imagePublicId?: string
}

export type WarehouseInput = {
  name: string
  location: string
}

export type CustomerInput = {
  name: string
  company?: string
  phone: string
  email?: string
  location?: string
  due?: number
  leadSource?: CustomerRecord['leadSource']
  reminderCustomer?: boolean
  nid?: string
  tradeLicenseNo?: string
  nomineeName?: string
  nomineeNid?: string
  thana?: string
  district?: string
  chequeNumber?: string
  bankName?: string
  branchName?: string
  nidCopyUrl?: string
  nidCopyPublicId?: string
  tradeLicenseCopyUrl?: string
  tradeLicenseCopyPublicId?: string
  passportPhotoUrl?: string
  passportPhotoPublicId?: string
  bankDocumentUrl?: string
  bankDocumentPublicId?: string
  dealerPhotoUrl?: string
  dealerPhotoPublicId?: string
  signatureUrl?: string
  signaturePublicId?: string
  zoneId?: string
}

export type SupplierInput = {
  name: string
  company?: string
  phone: string
  email?: string
  location?: string
  supplierType?: SupplierRecord['supplierType']
  country?: string
  lcNumber?: string
  lcStatus?: SupplierRecord['lcStatus']
  productCost?: number
  shippingCost?: number
  customsDuty?: number
  otherCost?: number
  currency?: string
  notes?: string
  suppliedProducts?: string[]
  bankAccountName?: string
  bankAccountNumber?: string
  bankName?: string
  bankBranch?: string
  bankRoutingNumber?: string
  bankSwiftCode?: string
  mobileBankingNumber?: string
  nid?: string
  tradeLicenseNo?: string
  nomineeName?: string
  nomineeNid?: string
  chequeNumber?: string
  supplierPhotoUrl?: string
  supplierPhotoPublicId?: string
  bankDocumentUrl?: string
  bankDocumentPublicId?: string
  nidCopyUrl?: string
  nidCopyPublicId?: string
  tradeLicenseCopyUrl?: string
  tradeLicenseCopyPublicId?: string
  passportPhotoUrl?: string
  passportPhotoPublicId?: string
  signatureUrl?: string
  signaturePublicId?: string
}

export type PurchaseInput = {
  productId: string
  quantity: number
  unitCost: number
  supplierId: string
  currency: string
}

export type OrderInput = {
  customerId: string
  items: Array<{
    productId: string
    quantity: number
    unitPrice: number
  }>
  discount?: number
  paid: number
  deliveryDate: string
  billNumber?: string
  orderDate?: string
  paymentDueDate?: string
  dueReference?: OrderRecord['dueReference']
}

export type ExpenseInput = {
  category: string
  amount: number
  note?: string
  date?: string
}

export type InvestorInput = {
  name: string
  location?: string
  mobile: string
  products?: string
  amount: number
  note?: string
}

export type SellerInput = {
  name: string
  phone: string
  location?: string
  notes?: string
}

export type SellerTransactionInput = {
  sellerId: string
  date?: string
  itemsTaken?: string
  takenValue?: number
  cashGiven?: number
  goodsBroughtDescription?: string
  iReceiveAmount?: number
  theyReceiveAmount?: number
}

export type CreditLedgerEntryInput = {
  customerId: string
  date?: string
  particulars: string
  qty?: number
  unitPrice?: number
  debit?: number
  credit?: number
}

export type CourierInput = {
  customerId?: string
  customerName: string
  billNumber?: string
  courierName: string
  productDescription: string
  quantity: number
  codAmount: number
  sentDate?: string
}

export type DamageProductInput = {
  productName: string
  quantity: number
  zone: string
  reportedDate?: string
  reason?: string
  notes?: string
}

export type LeadInput = {
  shopName: string
  ownerName: string
  businessType: LeadBusinessType
  address: string
  phone: string
  whatsapp?: string
  bannerPhotoUrl?: string
  bannerPhotoPublicId?: string
  visitingCardUrl?: string
  visitingCardPublicId?: string
  reputation?: string
  potential: LeadPotential
  notes?: string
  zoneId?: string
}

export type TaskInput = {
  title: string
  description: string
  module: TaskRecord['module']
  priority: TaskPriority
  assigneeId: string
  dueDate: string
}

export type UserInput = {
  name: string
  loginId: string
  email: string
  phone: string
  password: string
  roleId: string
  title: string
  zoneIds?: string[]
  areaKeys?: string[]
  reportsTo?: string
  /** Additional roles: an admin's choice applies at once, anyone else's waits for an admin's approval. */
  extraRoleIds?: string[]
}

// ---- Employee Management ----

export type EmploymentStatus = 'active' | 'resigned' | 'terminated'

/** Salary-based staff get a salary plus allowances; commission-based staff are paid commission only. */
export type EmployeeCompensationType = 'salary' | 'commission'

/** A joining form waits as `pending` until an admin sets the pay and approves it. */
export type EmployeeApprovalStatus = 'pending' | 'approved' | 'rejected'

export type EmployeeRecord = {
  id: string
  name: string
  address: string
  phone: string
  designation: string
  joiningDate: string
  zoneId: string
  area: string
  fatherName: string
  motherName: string
  dateOfBirth: string
  nid: string
  experience: string
  compensationType: EmployeeCompensationType
  approvalStatus: EmployeeApprovalStatus
  submittedBy: string
  approvedBy: string
  approvedAt: string
  probationMonths: number
  employmentStatus: EmploymentStatus
  baseSalary: number
  taDa: number
  houseRent: number
  mobileBill: number
  monthlyUnitTarget: number
  monthlyAmountTarget: number
  commissionPerUnit: number
  userId?: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type EmployeeInput = {
  name: string
  address?: string
  phone: string
  designation: string
  joiningDate: string
  zoneId?: string
  area?: string
  fatherName?: string
  motherName?: string
  dateOfBirth?: string
  nid?: string
  experience?: string
  compensationType?: EmployeeCompensationType
  probationMonths?: number
  employmentStatus?: EmploymentStatus
  baseSalary?: number
  taDa?: number
  houseRent?: number
  mobileBill?: number
  monthlyUnitTarget?: number
  monthlyAmountTarget?: number
  commissionPerUnit?: number
  userId?: string
  notes?: string
}

/** The pay an admin sets on a joining form before approving it. */
export type EmployeeApprovalInput = {
  compensationType: EmployeeCompensationType
  baseSalary?: number
  taDa?: number
  houseRent?: number
  mobileBill?: number
  commissionPerUnit?: number
  notes?: string
}

// ---- Sales & Target Management ----

export type SalesTargetRecord = {
  id: string
  employeeId: string
  employeeName: string
  month: string
  unitTarget: number
  amountTarget: number
  commissionPerUnit: number
  unitsSold: number
  amountSold: number
  createdAt: string
  updatedAt: string
}

export type RecordSaleInput = {
  employeeId: string
  month?: string
  units: number
  amount: number
  note?: string
}

// ---- Salary & Commission ----

export type SalaryHoldStatus = 'hold' | 'released'
export type SalaryPaymentStatus = 'unpaid' | 'partial' | 'paid'

export type SalaryPaymentEntry = {
  id: string
  amount: number
  method: string
  note: string
  paidBy: string
  paidAt: string
}

export type SalaryRecord = {
  id: string
  employeeId: string
  employeeName: string
  month: string
  baseSalary: number
  commissionPerUnit: number
  unitsSold: number
  commissionAmount: number
  achievementPercent: number
  holdStatus: SalaryHoldStatus
  grossPayable: number
  paidAmount: number
  dueAmount: number
  paymentStatus: SalaryPaymentStatus
  payments: SalaryPaymentEntry[]
  createdAt: string
  updatedAt: string
}

export type SalaryPaymentInput = {
  employeeId: string
  month: string
  amount: number
  method?: string
  note?: string
}
