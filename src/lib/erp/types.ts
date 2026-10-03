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
  /**
   * On: the role's changes to dealers, suppliers, credit sheet entries and expenses wait as
   * change requests until an admin approves them (the Accountant works this way).
   */
  requiresApproval?: boolean
}

export type RoleDataScope = 'all' | 'assigned'

export type RoleInput = {
  name: string
  description?: string
  permissions: string[]
  zoneIds?: string[]
  dataScope?: RoleDataScope
  requiresApproval?: boolean
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
  /** System-generated supplier code (`PIL-SUP-0001`), given when the supplier is opened. */
  code?: string
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
  /** What we already owed this supplier before their purchases were recorded here. */
  openingDue: number
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

export type DocumentPhoto = {
  url: string
  publicId: string
}

export type CustomerRecord = {
  id: string
  /** System-generated client code (`PIL-CUS-0001`), given when the client form is opened. */
  code?: string
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
  /** Photos after the first for each document (keyed like `nidCopy`); the first stays in the `…Url` field. */
  extraPhotos?: Record<string, DocumentPhoto[]>
  /** Explicit zone. When empty the zone is resolved from the customer's district. */
  zoneId?: string
  /** Most this dealer may owe; 0 or unset means no limit. Order form blocks or marks orders above it. */
  creditLimit?: number
  /** Prices only this dealer gets (product id → price). They win over depot, zone and general prices. */
  prices?: Record<string, number>
  /** Depot the dealer belongs to. Their orders use the depot's prices and are delivered from the depot. */
  depotId?: string
  commitments?: Record<string, CustomerCommitment>
  createdAt: string
  updatedAt: string
}

export type CustomerCommitmentStatus = 'pending' | 'fulfilled'

/**
 * Where a commitment stands in its approval: a zone in charge's commitment waits for the
 * Authorizer, then for the Chairman. Unset means approved (everyone else's, and older records).
 */
export type CustomerCommitmentApproval = 'authorizer' | 'chairman' | 'approved' | 'rejected'

export type CustomerCommitment = {
  id: string
  note: string
  dueDate: string
  status: CustomerCommitmentStatus
  approvalStage?: CustomerCommitmentApproval
  /** False keeps the note off the printed ledger and its PDF/JPG. Unset means it is shown. */
  showOnPdf?: boolean
  authorizedBy?: string
  authorizedAt?: string
  approvedBy?: string
  approvedAt?: string
  rejectedBy?: string
  rejectedAt?: string
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
  showOnPdf?: boolean
  imageUrl?: string
  imagePublicId?: string
}

/** A sub-zone inside a zone, named by an admin. `district` is only set on sub-zones from before zones were admin-defined. */
/**
 * A depot run by a depot owner. Dealers are put under it only after it is saved; they then get
 * the depot's own prices and their deliveries leave from the depot's warehouse.
 */
export type DepotRecord = {
  id: string
  name: string
  ownerName: string
  phone: string
  address: string
  zoneId: string
  /** The owner's login. That user only sees this depot's dealers. */
  ownerUserId: string
  /** Warehouse created with the depot; its dealers' deliveries leave from here. */
  warehouseId: string
  /** Depot price by product id. Products without one fall back to the zone or wholesale price. */
  prices?: Record<string, number>
  notes: string
  createdAt: string
  updatedAt: string
}

export type DepotInput = {
  name: string
  ownerName: string
  phone: string
  address?: string
  zoneId?: string
  ownerUserId?: string
  notes?: string
}

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
  /** Dealers of this zone who do not follow its zone prices and keep the general price. */
  priceExcludedCustomerIds?: string[]
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
  /** Zone-specific selling price by zone id; the order form falls back to the wholesale price. */
  zonePrices?: Record<string, number>
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
  /** The employee credited with the sale (commission etc.), chosen on the order form. */
  employeeId?: string
  employeeName?: string
  courierName?: string
  /** Submitted although it took the dealer over their credit limit. */
  overCreditLimit?: boolean
  /** Set once an approved order is posted for delivery. */
  delivery?: OrderDelivery
  createdAt: string
  items: OrderItem[]
}

/** `posted`: sent out, waiting for the delivery document. `submitted`: document received and sent to the audit. */
export type DeliveryStatus = 'posted' | 'submitted'

/** The delivery of an approved order: where it left from, who took it, and the signed delivery document. */
export type OrderDelivery = {
  status: DeliveryStatus
  warehouseId: string
  warehouseName: string
  /** Employee who takes the goods. */
  deliveryManId: string
  deliveryManName: string
  courierName: string
  trackingNumber: string
  vehicle: string
  deliveryCharge: number
  note: string
  documentUrl: string
  documentPublicId: string
  postedById: string
  postedByName: string
  postedAt: string
  submittedById: string
  submittedByName: string
  submittedAt: string
  updatedAt: string
}

export type DeliveryPostInput = {
  warehouseId: string
  deliveryManId: string
  courierName: string
}

/** Details that can be filled in after posting, until the delivery is submitted. */
export type DeliveryDetailsInput = DeliveryPostInput & {
  trackingNumber: string
  vehicle: string
  deliveryCharge: number
  note: string
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
  /** On: orders over a dealer's credit limit are refused. Off: they go through, marked over-limit. */
  blockOverLimitOrders?: boolean
  /** Payment methods offered on the deposit form (UCB, IBBL, DBBL, Cash...), managed by admins. */
  depositMethods?: string[]
  /** Extra expense categories added by admins, on top of DEFAULT_EXPENSE_CATEGORIES. */
  expenseCategories?: string[]
  /** Users an admin allowed to take attendance, on top of roles that have `attendance.edit`. */
  attendanceHandlerIds?: string[]
  /** Users an admin put in charge of inventory, stock and warehouses, on top of roles that have `inventory.edit`. */
  inventoryManagerIds?: string[]
}

export type AttendanceStatus = 'present' | 'absent'

/** One employee's attendance for one day. */
export type AttendanceMark = {
  status: AttendanceStatus
  markedById: string
  markedByName: string
  markedAt: string
}

/** Fixed TA is a flat amount; actual TA is the sum of the daily travel entries. */
export type TaType = 'fixed' | 'actual'

export type TaDailyEntry = {
  date: string
  from: string
  to: string
  reason: string
  /** Who travelled. */
  person: string
  /** Bus, CNG, Own Bike... For an own bike/car the amount is the petrol bill. */
  vehicle: string
  amount: number
}

/** Expenses entered on the finance page have no status and count as approved. */
export type ExpenseRecord = {
  id: string
  category: string
  amount: number
  note: string
  date: string
  createdBy: string
  createdByName: string
  createdAt: string
  /** Who spent the money (may differ from who entered it). */
  expenseBy?: string
  documentUrl?: string
  documentPublicId?: string
  taType?: TaType
  taEntries?: TaDailyEntry[]
  /** DA claims from the attendance sheet: the employee and month (`YYYY-MM`) it pays for. */
  employeeId?: string
  daMonth?: string
  status?: DepositStatus
  reviewedById?: string
  reviewedByName?: string
  reviewedAt?: string
  edits?: SubmissionEdit[]
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

export type DepositStatus = 'pending' | 'approved' | 'rejected'

/**
 * A ledger entry a zone in charge made for a client of their zone. It goes to the zone's
 * Authorizer, then the Chairman, and only lands on the client's sheet once approved.
 */
export type LedgerEntryRequestRecord = {
  id: string
  customerId: string
  customerName: string
  date: string
  particulars: string
  qty: number
  unitPrice: number
  debit: number
  credit: number
  status: DepositStatus
  submittedById: string
  submittedByName: string
  /** Set once the Authorizer accepts it; the Chairman gives the final approval after that. */
  authorizedById?: string
  authorizedByName?: string
  authorizedAt?: string
  /** The dealer's zone when it was submitted, so it goes to that zone's Authorizer. */
  zoneId?: string
  reviewedById?: string
  reviewedByName?: string
  reviewedAt?: string
  /** The ledger entry written on approval. */
  entryId?: string
  createdAt: string
  updatedAt: string
}

/** One admin edit of a submission before approval: who changed it and what each field was. */
export type SubmissionEdit = {
  byId: string
  byName: string
  byRole: string
  at: string
  changes: Array<{ field: string; from: string; to: string }>
}

/** An order from the order form. Nothing touches stock or the dealer's due until an admin approves it and the order is created. */
export type OrderRequestRecord = {
  id: string
  customerId: string
  customerName: string
  employeeId: string
  employeeName: string
  items: OrderItem[]
  total: number
  paid: number
  due: number
  orderDate: string
  deliveryDate: string
  courierName: string
  overCreditLimit: boolean
  status: DepositStatus
  submittedById: string
  submittedByName: string
  submittedByRole: string
  /** Set once the Authorizer accepts it; the Chairman gives the final approval after that. */
  authorizedById?: string
  authorizedByName?: string
  authorizedAt?: string
  /** The dealer's zone when it was submitted, so it goes to that zone's Authorizer. */
  zoneId?: string
  reviewedById?: string
  reviewedByName?: string
  reviewedAt?: string
  /** The order created on approval. */
  orderId?: string
  edits?: SubmissionEdit[]
  createdAt: string
  updatedAt: string
}

export type OrderRequestEdit = {
  items: Array<{ productId: string; quantity: number; unitPrice: number }>
  paid: number
  deliveryDate: string
  courierName: string
}

export type EditableSubmissionKind = 'deposits' | 'supplierPayments' | 'expenses'

/** Fields an admin may correct on a pending deposit, supplier payment or expense. */
export type SubmissionPatch = {
  amount?: number
  date?: string
  note?: string
  method?: string
  purpose?: string
  category?: string
}

export type AuditKind = 'order' | 'deposit' | 'supplier_payment' | 'expense' | 'delivery' | 'change' | 'employee' | 'advance' | 'business'

export type ChangeRequestKind = 'customer' | 'supplier' | 'credit_entry' | 'expense'
export type ChangeRequestAction = 'create' | 'update' | 'delete'

/**
 * A change by a user whose role needs approval (such as the Accountant). Nothing changes until an
 * admin approves it; approving applies the change as it was requested.
 */
export type ChangeRequestRecord = {
  id: string
  kind: ChangeRequestKind
  action: ChangeRequestAction
  /** The record being updated or deleted; empty for a create. */
  targetId: string
  /** Name of the dealer, supplier or expense category, for the approval list. */
  targetName: string
  /** The input the change is applied with; absent for a delete. */
  input?: CustomerInput | SupplierInput | CreditLedgerEntryInput | ExpenseInput
  status: DepositStatus
  submittedById: string
  submittedByName: string
  reviewedById?: string
  reviewedByName?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

/** A reviewed submission, listed by day on the Daily Audit page. */
export type AuditEntryRecord = {
  id: string
  /** `YYYY-MM-DD` of the review. */
  day: string
  kind: AuditKind
  refId: string
  decision: 'approved' | 'rejected'
  party: string
  summary: string
  amount: number
  submittedByName: string
  submittedByRole: string
  submittedAt: string
  reviewedByName: string
  reviewedByRole: string
  reviewedAt: string
  /** "Edited by Name (Role): field, field" lines, empty when nobody edited it. */
  edits: string[]
}

/** A dealer payment entered by staff; it only lowers the dealer's due once an admin approves it. */
export type DepositRecord = {
  id: string
  customerId: string
  customerName: string
  date: string
  amount: number
  method: string
  note: string
  status: DepositStatus
  submittedById: string
  submittedByName: string
  /** Set once the Authorizer accepts it; the Chairman gives the final approval after that. */
  authorizedById?: string
  authorizedByName?: string
  authorizedAt?: string
  /** The dealer's zone when it was submitted, so it goes to that zone's Authorizer. */
  zoneId?: string
  reviewedById?: string
  reviewedByName?: string
  reviewedAt?: string
  edits?: SubmissionEdit[]
  createdAt: string
  updatedAt: string
}

export type DepositInput = {
  customerId: string
  date?: string
  amount: number
  method: string
  note?: string
}

/** A product complaint raised by an SR or customer; an admin approves it before service work starts. */
export type ComplaintRecord = {
  id: string
  customerId: string
  customerName: string
  productId: string
  productName: string
  guaranteeDate: string
  serialNumber: string
  problem: string
  endCustomerName: string
  endCustomerPhone: string
  endCustomerAddress: string
  status: DepositStatus
  submittedById: string
  submittedByName: string
  reviewedById?: string
  reviewedByName?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

export type ComplaintInput = {
  customerId: string
  productId: string
  guaranteeDate: string
  serialNumber: string
  problem: string
  endCustomerName: string
  endCustomerPhone: string
  endCustomerAddress: string
}

/** A replacement request raised by an SR for a dealer's faulty product; an admin approves it before the swap. */
export type ReplacementRecord = {
  id: string
  customerId: string
  customerName: string
  productId: string
  productName: string
  guaranteeDate: string
  serialNumber: string
  problem: string
  note: string
  /** How many pieces were replaced; older records are one piece. */
  quantity?: number
  /** Courier the replacement went out with. */
  courierName?: string
  status: DepositStatus
  submittedById: string
  submittedByName: string
  reviewedById?: string
  reviewedByName?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

export type ReplacementInput = {
  customerId: string
  productId: string
  guaranteeDate: string
  serialNumber?: string
  problem: string
  note?: string
  quantity?: number
  courierName?: string
}

/** A replaced product the dealer sends back; an admin approves the return. */
export type ReplacementReturnRecord = {
  id: string
  customerId: string
  customerName: string
  productId: string
  productName: string
  date: string
  note: string
  /** How many faulty pieces came back; older records are one piece. */
  quantity?: number
  /** Courier the faulty pieces came back with. */
  courierName?: string
  status: DepositStatus
  submittedById: string
  submittedByName: string
  reviewedById?: string
  reviewedByName?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

export type ReplacementReturnInput = {
  customerId: string
  productId: string
  date: string
  note?: string
  quantity?: number
  courierName?: string
}

/** `sender`: a company account payments go out from. `receiver`: an account payments go to (often a supplier's). */
export type BankAccountSide = 'sender' | 'receiver'

/** A bank account an admin keeps on file for the supplier payment form. */
export type BankAccountRecord = {
  id: string
  side: BankAccountSide
  bankName: string
  accountName: string
  accountNumber: string
  branch: string
  routingNumber: string
  /** Receiver accounts may belong to one supplier; the payment form offers them first for that supplier. */
  supplierId?: string
  createdAt: string
  updatedAt: string
}

export type BankAccountInput = {
  side: BankAccountSide
  bankName: string
  accountName: string
  accountNumber: string
  branch?: string
  routingNumber?: string
  supplierId?: string
}

export type SupplierPaymentMethod = 'bank' | 'cash'

/** A payment to a supplier entered by staff; it counts as paid only once an admin approves it. */
export type SupplierPaymentRecord = {
  id: string
  supplierId: string
  supplierName: string
  date: string
  method: SupplierPaymentMethod
  /** Bank only: a sender account id, or `cash` when cash was deposited straight into the receiving bank. */
  fromAccountId: string
  /** Bank only: readable source, kept so the record survives the account being edited or removed. */
  fromLabel: string
  toAccountId: string
  toLabel: string
  sendingType: string
  /** Cash only: who took the cash. */
  cashReceiver: string
  /** Deposit proof (company voucher, bank slip). Required for cash and for cash deposited to a bank. */
  proofUrl: string
  proofPublicId: string
  amount: number
  purpose: string
  note: string
  status: DepositStatus
  submittedById: string
  submittedByName: string
  reviewedById?: string
  reviewedByName?: string
  reviewedAt?: string
  edits?: SubmissionEdit[]
  createdAt: string
  updatedAt: string
}

export type SupplierPaymentInput = {
  supplierId: string
  date?: string
  method: SupplierPaymentMethod
  fromAccountId?: string
  toAccountId?: string
  sendingType?: string
  cashReceiver?: string
  proofUrl?: string
  proofPublicId?: string
  amount: number
  purpose: string
  note?: string
}

export type DamageProductStatus ='pending' | 'sent-to-office' | 'received' | 'resolved'

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
  depots: Record<string, DepotRecord>
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
  ledgerEntryRequests: Record<string, LedgerEntryRequestRecord>
  deposits: Record<string, DepositRecord>
  complaints: Record<string, ComplaintRecord>
  replacements: Record<string, ReplacementRecord>
  replacementReturns: Record<string, ReplacementReturnRecord>
  bankAccounts: Record<string, BankAccountRecord>
  supplierPayments: Record<string, SupplierPaymentRecord>
  orderRequests: Record<string, OrderRequestRecord>
  changeRequests: Record<string, ChangeRequestRecord>
  auditLog: Record<string, AuditEntryRecord>
  /** Attendance by day (`YYYY-MM-DD`), then by employee id. */
  attendance: Record<string, Record<string, AttendanceMark>>
  couriers: Record<string, CourierRecord>
  damageProducts: Record<string, DamageProductRecord>
  leads: Record<string, LeadRecord>
  investors: Record<string, InvestorRecord>
  employees: Record<string, EmployeeRecord>
  salesTargets: Record<string, SalesTargetRecord>
  salaries: Record<string, SalaryRecord>
  employeeAdvances: Record<string, EmployeeAdvanceRecord>
  commissionAuthorizations: Record<string, CommissionAuthorizationRecord>
  advanceRequests: Record<string, AdvanceRequestRecord>
  batteryReports: Record<string, BatteryReportRecord>
  businesses: Record<string, BusinessRecord>
  businessEntries: Record<string, BusinessEntryRecord>
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
  extraPhotos?: Record<string, DocumentPhoto[]>
  zoneId?: string
  creditLimit?: number
  depotId?: string
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
  openingDue?: number
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
  employeeId?: string
  courierName?: string
}

export type ExpenseInput = {
  category: string
  amount: number
  note?: string
  date?: string
  expenseBy?: string
  documentUrl?: string
  documentPublicId?: string
  taType?: TaType
  taEntries?: TaDailyEntry[]
  employeeId?: string
  daMonth?: string
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
  /** System-generated staff id (e.g. `PIL-EMP-0001`), given when the joining form is approved. */
  employeeCode?: string
  /** When the joining letter was first issued. */
  joiningLetterIssuedAt?: string
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
  /** Daily allowance paid for each day the employee is marked present. */
  daPerDay: number
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
  daPerDay?: number
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
  daPerDay?: number
  houseRent?: number
  mobileBill?: number
  commissionPerUnit?: number
  /** The employee's own monthly target: pieces, or the sales amount, whichever is reached first. */
  monthlyUnitTarget?: number
  monthlyAmountTarget?: number
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
  /** Due money the employee collected back from their credit sales; commission is paid in proportion to it. */
  amountCollected?: number
  createdAt: string
  updatedAt: string
}

export type RecordSaleInput = {
  employeeId: string
  month?: string
  units: number
  amount: number
  /** Due money collected from credit sales. */
  collected?: number
  note?: string
}

// ---- Salary & Commission ----

export type SalaryHoldStatus = 'hold' | 'released'
export type SalaryPaymentStatus = 'unpaid' | 'partial' | 'paid'

/** Salary is paid at the start of the next month; commission and the like on the 16th–20th. */
export type SalaryPaymentKind = 'salary' | 'commission'

export type SalaryPaymentEntry = {
  id: string
  /** What the payment was for; payments recorded before the split count as salary. */
  kind?: SalaryPaymentKind
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
  /** Commission payable: earned commission scaled by the share of sales collected, 0 when not eligible. */
  commissionAmount: number
  /** Units × commission per unit, before the collection and target rules. */
  commissionEarned?: number
  amountCollected?: number
  achievementPercent: number
  /** `hold`: commission withheld because the target was below 80% and the owner did not authorize it. */
  holdStatus: SalaryHoldStatus
  /** The owner authorized commission although the target was not reached. */
  ownerAuthorized?: boolean
  /** Advances taken during the month, deducted from the pay. */
  advanceAmount?: number
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
  kind?: SalaryPaymentKind
  amount: number
  method?: string
  note?: string
}

/** Money an employee takes before the month is over; it is deducted from that month's pay. */
export type EmployeeAdvanceRecord = {
  id: string
  employeeId: string
  employeeName: string
  /** Payroll month (`YYYY-MM`) the advance is deducted from. */
  month: string
  date: string
  amount: number
  method: string
  note: string
  givenById: string
  givenByName: string
  createdAt: string
}

/**
 * An employee's request for money ahead of payday in an emergency. The office approves an
 * amount (it may be less than asked); the approved amount is then given as an advance and
 * comes off that month's pay.
 */
export type AdvanceRequestRecord = {
  id: string
  employeeId: string
  employeeName: string
  amount: number
  reason: string
  status: DepositStatus
  approvedAmount?: number
  /** The advance the approval created. */
  advanceId?: string
  method?: string
  reviewNote?: string
  submittedById: string
  submittedByName: string
  reviewedById?: string
  reviewedByName?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

export type AdvanceRequestInput = {
  employeeId: string
  amount: number
  reason: string
}

export type EmployeeAdvanceInput = {
  employeeId: string
  date: string
  amount: number
  method?: string
  note?: string
}

export type CommissionAuthorizationStatus = 'pending' | 'approved' | 'rejected'

/**
 * A request for the owner to allow commission for a month in which the employee missed the
 * 80% target. Once the owner approves it the month's commission is paid, marked "Authorized by owner".
 */
export type CommissionAuthorizationRecord = {
  id: string
  employeeId: string
  employeeName: string
  month: string
  reason: string
  /** Target achievement when the request was made. */
  achievementPercent: number
  status: CommissionAuthorizationStatus
  requestedById: string
  requestedByName: string
  requestedAt: string
  reviewedById?: string
  reviewedByName?: string
  reviewedAt?: string
  reviewNote?: string
}

export type CommissionAuthorizationInput = {
  employeeId: string
  month: string
  reason: string
}

/** Who a portal login belongs to: a dealer (customer) or a supplier. */
export type PortalPartyKind = 'customer' | 'supplier'

/**
 * A dealer's or supplier's own login to the portal. Kept outside `erp` (which every staff
 * account can read) and only read or written by the server, so a dealer can never reach
 * anyone else's records.
 */
export type PortalAccountRecord = {
  id: string
  partyKind: PortalPartyKind
  partyId: string
  /** Name of the dealer or supplier when the login was made, for lists. */
  name: string
  email: string
  phone: string
  status: 'active' | 'inactive'
  createdAt: string
  createdById: string
  createdByName: string
  lastLoginAt?: string
  loginCount?: number
  passwordChangedAt?: string
  /** The account's own id when they changed it themselves, otherwise the staff member who set it. */
  passwordChangedBy?: string
}

/** `transaction` is the automatic bank-style alert sent when a new row lands on the sheet. */
export type PortalMessageKind = 'transaction' | 'payment_reminder' | 'statement' | 'notice'

/** What happened when the message was also sent on WhatsApp. */
export type PortalDeliveryStatus = 'sent' | 'failed' | 'not_configured' | 'no_phone'

/** A message to a dealer or supplier, shown in their portal inbox and sent on WhatsApp. */
export type PortalMessageRecord = {
  id: string
  kind: PortalMessageKind
  title: string
  body: string
  /** Statement image (JPG) sent with the message. */
  imageUrl?: string
  read: boolean
  whatsapp: PortalDeliveryStatus
  whatsappError?: string
  createdAt: string
  createdByName: string
}

/** The office sends a dealer or supplier a payment reminder, a statement image, or a notice. */
export type PortalNoticeInput = {
  partyKind: PortalPartyKind
  partyId: string
  kind: Exclude<PortalMessageKind, 'transaction'>
  message?: string
  imageUrl?: string
}

/** A newly added sheet row the party gets an alert about. */
export type PortalTransactionKind = 'order' | 'ledger_entry' | 'purchase' | 'supplier_payment'

/** Physical state of a checked battery. */
export type BatteryCondition = 'good' | 'bulged' | 'cracked' | 'leaking' | 'terminal_damaged' | 'burnt'

/** What the check found wrong, if anything. */
export type BatteryFault =
  | 'none'
  | 'discharged'
  | 'weak_cell'
  | 'dead_cell'
  | 'short_circuit'
  | 'sulphation'
  | 'overcharged'
  | 'physical_damage'
  | 'manufacturing_defect'

/** What the company does with the battery after the check. */
export type BatteryVerdict = 'recharge_return' | 'repair' | 'replace' | 'not_covered'

/**
 * The bench report filled after a returned or complained battery is tested: who it came from,
 * its warranty standing, the readings, what is wrong, and the decision.
 */
export type BatteryReportRecord = {
  id: string
  /** System-generated report number (`BCR-0001`). */
  reportNo: string
  checkDate: string
  customerId: string
  customerName: string
  endCustomerName: string
  endCustomerPhone: string
  productId: string
  productName: string
  serialNumber: string
  /** Sale / guarantee start date, to work out the warranty. */
  saleDate: string
  warrantyMonths: number
  /** Complaint or replacement this check belongs to. */
  complaintId?: string
  replacementId?: string
  ratedVoltage: number
  ratedCapacityAh: number
  openCircuitVoltage: number
  loadVoltage: number
  /** Cold-cranking amps measured by the tester, when one is used. */
  measuredCca: number
  ratedCca: number
  internalResistance: number
  specificGravity: string
  /** Voltage after a full charge, when it was recharged on the bench. */
  afterChargeVoltage: number
  condition: BatteryCondition[]
  fault: BatteryFault
  verdict: BatteryVerdict
  remarks: string
  checkedById: string
  checkedByName: string
  createdAt: string
  updatedAt: string
}

export type BatteryReportInput = Omit<
  BatteryReportRecord,
  'id' | 'reportNo' | 'customerName' | 'productName' | 'warrantyMonths' | 'checkedById' | 'checkedByName' | 'createdAt' | 'updatedAt'
>

/** A sub business the company runs, with its own books apart from the main trade. */
export type BusinessRecord = {
  id: string
  name: string
  description: string
  /** Cash and stock the business started with. */
  openingCash: number
  openingStockValue: number
  createdAt: string
  updatedAt: string
}

export type BusinessInput = {
  name: string
  description?: string
  openingCash?: number
  openingStockValue?: number
}

/**
 * One line of a sub business's books. Each kind moves the balance sheet its own way:
 * - capital: owner puts cash in (cash +)
 * - stock_purchase: goods bought (stock +, cash − what was paid)
 * - sale: goods sold (cash + amount received, stock − their cost)
 * - deposit: money received from clients (cash +)
 * - payment: money paid to suppliers or others (cash −)
 * - expense: running costs (cash −)
 * - withdrawal: owner takes cash out (cash −)
 * - stock_adjustment: stock value corrected, e.g. damage (stock ±)
 */
export type BusinessEntryKind = 'capital' | 'stock_purchase' | 'sale' | 'deposit' | 'payment' | 'expense' | 'withdrawal' | 'stock_adjustment'

export type BusinessEntryRecord = {
  id: string
  businessId: string
  businessName: string
  kind: BusinessEntryKind
  date: string
  /** Cash in or out (for stock_adjustment: the stock value change, negative to reduce). */
  amount: number
  /** Stock value moved: goods bought (stock_purchase) or the cost of goods sold (sale). */
  stockValue: number
  party: string
  particulars: string
  status: DepositStatus
  submittedById: string
  submittedByName: string
  reviewedById?: string
  reviewedByName?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

export type BusinessEntryInput = {
  businessId: string
  kind: BusinessEntryKind
  date: string
  amount: number
  stockValue?: number
  party?: string
  particulars: string
}
