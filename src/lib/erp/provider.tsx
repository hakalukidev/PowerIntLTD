'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { onValue, ref, set, update } from 'firebase/database'

import { createDefaultERPData } from '@/lib/erp/defaultData'
import type {
  AdvanceRequestInput,
  AdvanceRequestRecord,
  BatteryReportInput,
  BatteryReportRecord,
  BusinessEntryInput,
  BusinessEntryRecord,
  BusinessInput,
  BusinessRecord,
  AttendanceStatus,
  AuditEntryRecord,
  ChangeRequestAction,
  ChangeRequestKind,
  ChangeRequestRecord,
  DeliveryDetailsInput,
  DeliveryPostInput,
  OrderDelivery,
  EditableSubmissionKind,
  OrderRequestEdit,
  SubmissionEdit,
  SubmissionPatch,
  BankAccountInput,
  CourierInput,
  CourierRecord,
  CreditLedgerEntryInput,
  CustomerCommitment,
  CustomerCommitmentInput,
  CustomerInput,
  CustomerRecord,
  LedgerEntryRequestRecord,
  DocumentPhoto,
  DamageProductInput,
  DamageProductRecord,
  ComplaintInput,
  ReplacementInput,
  ReplacementReturnInput,
  DepositInput,
  LeadInput,
  EmployeeApprovalInput,
  EmployeeInput,
  EmployeeRecord,
  ERPData,
  ExpenseInput,
  InvestorInput,
  OrderInput,
  OrderRecord,
  ProductInput,
  ProductRecord,
  PurchaseInput,
  RecordSaleInput,
  RoleInput,
  RoleRecord,
  SalaryPaymentEntry,
  SalaryPaymentInput,
  SalaryRecord,
  SalesTargetRecord,
  SellerInput,
  SellerTransactionInput,
  SettingsRecord,
  SupplierInput,
  SupplierPaymentInput,
  SupplierRecord,
  TaskInput,
  TaskRecord,
  UserInput,
  LoginHistoryEntry,
  UserRecord,
  WarehouseInput,
  ZoneInput,
  ZoneRecord,
  DepotInput,
  DepotRecord,
  PortalTransactionKind,
  EmployeeAdvanceInput,
  EmployeeAdvanceRecord,
  CommissionAuthorizationInput,
  CommissionAuthorizationRecord,
} from '@/lib/erp/types'
import {
  approvalStage,
  canAuthorizeCommission,
  computeMonthlyPay,
  createId,
  CUSTOMER_CODE_PREFIX,
  currentMonthKey,
  dayKey,
  effectiveRole,
  inCommissionWindow,
  DEFAULT_COMMISSION_PER_UNIT,
  DEFAULT_MONTHLY_AMOUNT_TARGET,
  DEFAULT_MONTHLY_UNIT_TARGET,
  DEFAULT_PROBATION_MONTHS,
  EMPLOYEE_EXPENSE_CATEGORIES,
  changesNeedApproval as changesNeedApprovalFor,
  getPermissions,
  getProductStatus,
  getTargetAchievement,
  hasPermission as hasPermissionCheck,
  isZoneInCharge,
  canActAtStage,
  nextEmployeeCode,
  nextPartyCode,
  SUPPLIER_CODE_PREFIX,
  TA_CATEGORY,
  toArray,
  userRoleIds,
  userRoleNames,
} from '@/lib/erp/utils'
import {
  inMemoryPersistence,
  onAuthStateChanged,
  onIdTokenChanged,
  setPersistence,
  signInWithCustomToken,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth'

import { auth, database } from '@/lib/firebase/config'
import { BUSINESS_ENTRY_LABELS } from './business'
import { resolveRoles } from './roles'
import { accessScopeFor, customerInScope, customerZoneId, scopeDataToUserZones } from './zones'

const DEFAULT_ERP_DATA = createDefaultERPData()

const ATTENDANCE_HANDLER_PERMISSIONS = ['attendance.view', 'attendance.edit']

/** What an inventory manager picked by an admin can do: all of inventory, stock and warehouses, and damage products. */
export const INVENTORY_MANAGER_PERMISSIONS = [
  'dashboard.view',
  'inventory.view',
  'inventory.edit',
  'inventory.delete',
  'damage_products.view',
  'damage_products.edit',
  'damage_products.delete',
  'suppliers.view',
]

const CHANGE_KIND_LABELS: Record<ChangeRequestKind, string> = {
  customer: 'dealer',
  supplier: 'supplier',
  credit_entry: 'credit sheet entry',
  expense: 'expense',
}

const CHANGE_ACTION_LABELS: Record<ChangeRequestAction, string> = {
  create: 'add',
  update: 'edit',
  delete: 'delete',
}

type ERPContextValue = {
  data: ERPData | null
  loading: boolean
  error: string | null
  users: UserRecord[]
  currentUser: UserRecord | null
  currentPermissions: string[]
  /** Resolves with where the account belongs: the ERP workspace, or the dealer/supplier portal. */
  login: (identifier: string, password: string) => Promise<{ portal: boolean }>
  /** Signed in as a dealer or supplier: no ERP data is loaded, the portal APIs serve their own sheet. */
  isPortalUser: boolean
  /** Calls one of the app's API routes as the signed-in account and returns its JSON, throwing its error. */
  authorizedFetch: <T = unknown>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>
  logout: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  fetchLoginHistory: (userId: string) => Promise<LoginHistoryEntry[]>
  createUser: (input: UserInput) => Promise<void>
  updateUser: (userId: string, input: UserInput) => Promise<void>
  deleteUser: (userId: string) => Promise<void>
  createRole: (input: RoleInput) => Promise<void>
  updateRole: (roleId: string, input: RoleInput) => Promise<void>
  deleteRole: (roleId: string, reassignRoleId?: string) => Promise<void>
  reviewRoleRequest: (userId: string, roleId: string, decision: 'approve' | 'reject') => Promise<void>
  hasPermission: (permission: string) => boolean
  /**
   * The signed-in user's role needs an admin's approval for changes (the Accountant). Their saves
   * and deletes of dealers, suppliers, credit sheet entries and expenses then only file a change
   * request, and saves resolve with an empty id.
   */
  changesNeedApproval: boolean
  reviewChangeRequest: (requestId: string, decision: 'approve' | 'reject') => Promise<void>
  saveCustomer: (input: CustomerInput, customerId?: string) => Promise<string>
  deleteCustomer: (customerId: string) => Promise<void>
  saveCustomerCommitment: (customerId: string, input: CustomerCommitmentInput, commitmentId?: string) => Promise<void>
  deleteCustomerCommitment: (customerId: string, commitmentId: string) => Promise<void>
  /** The Authorizer submits a zone in charge's commitment to the Chairman, who gives the final approval; either may reject it. */
  reviewCustomerCommitment: (customerId: string, commitmentId: string, decision: 'approve' | 'reject') => Promise<void>
  saveZone: (input: ZoneInput, zoneId?: string) => Promise<string>
  deleteZone: (zoneId: string) => Promise<void>
  /** Saves a depot; a new depot also gets its own warehouse for its dealers' deliveries. */
  saveDepot: (input: DepotInput, depotId?: string) => Promise<string>
  deleteDepot: (depotId: string) => Promise<void>
  /** Puts dealers under a saved depot, or takes them out of their depot when `depotId` is empty. */
  setDealersDepot: (customerIds: string[], depotId: string) => Promise<void>
  /** Depot prices by product id; `null` drops a product back to the zone or wholesale price. */
  saveDepotPrices: (depotId: string, prices: Record<string, number | null>) => Promise<void>
  saveSupplier: (input: SupplierInput, supplierId?: string) => Promise<string>
  deleteSupplier: (supplierId: string) => Promise<void>
  saveProduct: (input: ProductInput, productId?: string) => Promise<string>
  deleteProduct: (productId: string) => Promise<void>
  saveWarehouse: (input: WarehouseInput, warehouseId?: string) => Promise<string>
  deleteWarehouse: (warehouseId: string) => Promise<void>
  recordPurchase: (input: PurchaseInput) => Promise<void>
  createOrder: (input: OrderInput) => Promise<string | undefined>
  updateOrderStatus: (orderId: string, status: OrderRecord['status']) => Promise<void>
  setCustomerCreditLimit: (customerId: string, creditLimit: number) => Promise<void>
  saveZonePrices: (zoneId: string, prices: Record<string, number | null>) => Promise<void>
  /** Prices for every dealer: each product's general (wholesale) price. */
  saveGeneralPrices: (prices: Record<string, number>) => Promise<void>
  /** Prices for one dealer only; `null` drops the dealer back to their depot, zone or general price. */
  saveDealerPrices: (customerId: string, prices: Record<string, number | null>) => Promise<void>
  /** Dealers of a zone who keep the general price instead of the zone's prices. */
  saveZonePriceExclusions: (zoneId: string, customerIds: string[]) => Promise<void>
  updateSettings: (input: Partial<SettingsRecord>) => Promise<void>
  submitDeposit: (input: DepositInput) => Promise<void>
  reviewDeposit: (depositId: string, decision: 'approve' | 'reject') => Promise<void>
  submitComplaint: (input: ComplaintInput) => Promise<void>
  reviewComplaint: (complaintId: string, decision: 'approve' | 'reject') => Promise<void>
  submitReplacement: (input: ReplacementInput) => Promise<void>
  reviewReplacement: (replacementId: string, decision: 'approve' | 'reject') => Promise<void>
  submitReplacementReturn: (input: ReplacementReturnInput) => Promise<void>
  reviewReplacementReturn: (returnId: string, decision: 'approve' | 'reject') => Promise<void>
  submitExpense: (input: ExpenseInput) => Promise<void>
  reviewExpense: (expenseId: string, decision: 'approve' | 'reject') => Promise<void>
  saveBankAccount: (input: BankAccountInput, accountId?: string) => Promise<void>
  deleteBankAccount: (accountId: string) => Promise<void>
  submitSupplierPayment: (input: SupplierPaymentInput) => Promise<void>
  reviewSupplierPayment: (paymentId: string, decision: 'approve' | 'reject') => Promise<void>
  submitOrderRequest: (input: OrderInput) => Promise<void>
  editOrderRequest: (requestId: string, edit: OrderRequestEdit) => Promise<void>
  reviewOrderRequest: (requestId: string, decision: 'approve' | 'reject') => Promise<void>
  /** Picks the warehouse, delivery man and courier for an approved order and sends it out. */
  postDelivery: (orderId: string, input: DeliveryPostInput) => Promise<void>
  /** Changes the delivery details of a posted delivery that is not submitted yet. */
  updateDeliveryDetails: (orderId: string, input: DeliveryDetailsInput) => Promise<void>
  /** Attaches the delivery document and sends the delivery to the audit. */
  submitDelivery: (orderId: string, document: { url: string; publicId: string }) => Promise<void>
  editSubmission: (kind: EditableSubmissionKind, id: string, patch: SubmissionPatch) => Promise<void>
  /** Marks employees present or absent on a day (`YYYY-MM-DD`); `null` clears a mark. */
  markAttendance: (day: string, marks: Record<string, AttendanceStatus | null>) => Promise<void>
  /** Admin, a role with `attendance.edit`, or a user an admin picked as an attendance handler. */
  canTakeAttendance: boolean
  createTask: (input: TaskInput) => Promise<void>
  updateTaskStatus: (taskId: string, status: TaskRecord['status']) => Promise<void>
  markNotificationRead: (notificationId: string) => Promise<void>
  markAllNotificationsRead: (notificationIds: string[]) => Promise<void>
  saveExpense: (input: ExpenseInput, expenseId?: string) => Promise<void>
  saveInvestor: (input: InvestorInput, investorId?: string) => Promise<void>
  deleteExpense: (expenseId: string) => Promise<void>
  saveSeller: (input: SellerInput, sellerId?: string) => Promise<void>
  deleteSeller: (sellerId: string) => Promise<void>
  recordSellerTransaction: (input: SellerTransactionInput) => Promise<void>
  deleteSellerTransaction: (transactionId: string) => Promise<void>
  recordCreditLedgerEntry: (input: CreditLedgerEntryInput) => Promise<void>
  reviewLedgerEntryRequest: (requestId: string, decision: 'approve' | 'reject') => Promise<void>
  deleteCreditLedgerEntry: (entryId: string) => Promise<void>
  saveCourier: (input: CourierInput, courierId?: string) => Promise<void>
  updateCourierStatus: (courierId: string, status: CourierRecord['status']) => Promise<void>
  deleteCourier: (courierId: string) => Promise<void>
  saveDamageProduct: (input: DamageProductInput, damageProductId?: string) => Promise<void>
  updateDamageProductStatus: (damageProductId: string, status: DamageProductRecord['status']) => Promise<void>
  deleteDamageProduct: (damageProductId: string) => Promise<void>
  saveLead: (input: LeadInput, leadId?: string) => Promise<void>
  deleteLead: (leadId: string) => Promise<void>
  /** `submitForApproval` saves a new entry as a pending joining form even when an admin fills it in. */
  saveEmployee: (input: EmployeeInput, employeeId?: string, options?: { submitForApproval?: boolean }) => Promise<string>
  /** Approving gives the employee their staff id; the approved record is returned so the joining letter can be made from it. */
  reviewEmployee: (employeeId: string, decision: 'approve' | 'reject', input?: EmployeeApprovalInput) => Promise<EmployeeRecord>
  /** Gives an approved employee a staff id if they have none and marks the joining letter issued. */
  issueJoiningLetter: (employeeId: string) => Promise<EmployeeRecord>
  deleteEmployee: (employeeId: string) => Promise<void>
  recordSale: (input: RecordSaleInput) => Promise<void>
  saveSalaryPayment: (input: SalaryPaymentInput) => Promise<void>
  saveEmployeeAdvance: (input: EmployeeAdvanceInput) => Promise<void>
  deleteEmployeeAdvance: (advanceId: string) => Promise<void>
  saveBatteryReport: (input: BatteryReportInput, reportId?: string) => Promise<string>
  deleteBatteryReport: (reportId: string) => Promise<void>
  saveBusiness: (input: BusinessInput, businessId?: string) => Promise<string>
  deleteBusiness: (businessId: string) => Promise<void>
  /** An admin's entry is booked at once; anyone else's waits for an admin. */
  submitBusinessEntry: (input: BusinessEntryInput) => Promise<void>
  reviewBusinessEntry: (entryId: string, decision: 'approve' | 'reject') => Promise<void>
  deleteBusinessEntry: (entryId: string) => Promise<void>
  requestAdvance: (input: AdvanceRequestInput) => Promise<void>
  reviewAdvanceRequest: (requestId: string, decision: 'approve' | 'reject', options?: { amount?: number; method?: string; note?: string }) => Promise<void>
  /** Asks the owner to allow commission for a month the employee missed the 80% target. */
  requestCommissionAuthorization: (input: CommissionAuthorizationInput) => Promise<void>
  /** Owner (or admin) approves or rejects a commission request. */
  reviewCommissionAuthorization: (requestId: string, decision: 'approve' | 'reject', note?: string) => Promise<void>
}

const ERPContext = createContext<ERPContextValue | undefined>(undefined)
const CURRENT_USER_STORAGE_KEY = 'ims-current-user'

// The database hands lists back as objects keyed by index, and drops empty ones.
function normalizeExtraPhotos(extraPhotos?: Record<string, DocumentPhoto[]> | null) {
  return Object.fromEntries(
    Object.entries(extraPhotos ?? {})
      .map(([key, photos]) => [key, Object.values(photos ?? {}).filter((photo) => photo?.url)] as const)
      .filter(([, photos]) => photos.length)
  )
}

function normalizeCustomerRecord(customer: CustomerRecord): CustomerRecord {
  const now = new Date().toISOString()

  return {
    ...customer,
    company: customer.company || 'Retail',
    phone: customer.phone || '',
    email: customer.email || '',
    location: customer.location || '',
    due: Number(customer.due ?? 0),
    nid: customer.nid || '',
    tradeLicenseNo: customer.tradeLicenseNo || '',
    nomineeName: customer.nomineeName || '',
    nomineeNid: customer.nomineeNid || '',
    thana: customer.thana || '',
    district: customer.district || '',
    chequeNumber: customer.chequeNumber || '',
    bankName: customer.bankName || '',
    branchName: customer.branchName || '',
    nidCopyUrl: customer.nidCopyUrl || '',
    nidCopyPublicId: customer.nidCopyPublicId || '',
    tradeLicenseCopyUrl: customer.tradeLicenseCopyUrl || '',
    tradeLicenseCopyPublicId: customer.tradeLicenseCopyPublicId || '',
    passportPhotoUrl: customer.passportPhotoUrl || '',
    passportPhotoPublicId: customer.passportPhotoPublicId || '',
    bankDocumentUrl: customer.bankDocumentUrl || '',
    bankDocumentPublicId: customer.bankDocumentPublicId || '',
    dealerPhotoUrl: customer.dealerPhotoUrl || '',
    dealerPhotoPublicId: customer.dealerPhotoPublicId || '',
    signatureUrl: customer.signatureUrl || '',
    signaturePublicId: customer.signaturePublicId || '',
    extraPhotos: normalizeExtraPhotos(customer.extraPhotos),
    createdAt: customer.createdAt || now,
    updatedAt: customer.updatedAt || customer.createdAt || now,
  }
}

function normalizeZoneMap(zones?: Record<string, ZoneRecord> | null) {
  return Object.fromEntries(
    Object.entries(zones ?? {}).map(([id, zone]) => [
      id,
      {
        ...zone,
        id,
        name: zone.name || 'Unnamed zone',
        thanas: zone.thanas ?? [],
        districts: zone.districts ?? [],
        managerIds: zone.managerIds ?? [],
      },
    ])
  )
}

function normalizeCustomerMap(customers?: Record<string, CustomerRecord> | null) {
  return Object.fromEntries(
    Object.entries(customers ?? {}).map(([id, customer]) => [id, normalizeCustomerRecord(customer)])
  )
}

function normalizeSupplierRecord(supplier: SupplierRecord): SupplierRecord {
  const now = new Date().toISOString()

  return {
    ...supplier,
    company: supplier.company || supplier.name || 'Supplier',
    phone: supplier.phone || '',
    email: supplier.email || '',
    location: supplier.location || '',
    supplierType: supplier.supplierType ?? 'local',
    country: supplier.country || 'Bangladesh',
    lcNumber: supplier.lcNumber || '',
    lcStatus: supplier.lcStatus ?? 'not-required',
    productCost: Number(supplier.productCost ?? 0),
    shippingCost: Number(supplier.shippingCost ?? 0),
    customsDuty: Number(supplier.customsDuty ?? 0),
    otherCost: Number(supplier.otherCost ?? 0),
    currency: supplier.currency || 'BDT',
    notes: supplier.notes || '',
    // Firebase drops empty arrays, so older suppliers come back without this.
    suppliedProducts: Array.isArray(supplier.suppliedProducts) ? supplier.suppliedProducts : [],
    openingDue: Number(supplier.openingDue ?? 0),
    bankAccountName: supplier.bankAccountName || '',
    bankAccountNumber: supplier.bankAccountNumber || '',
    bankName: supplier.bankName || '',
    bankBranch: supplier.bankBranch || '',
    bankRoutingNumber: supplier.bankRoutingNumber || '',
    bankSwiftCode: supplier.bankSwiftCode || '',
    mobileBankingNumber: supplier.mobileBankingNumber || '',
    nid: supplier.nid || '',
    tradeLicenseNo: supplier.tradeLicenseNo || '',
    nomineeName: supplier.nomineeName || '',
    nomineeNid: supplier.nomineeNid || '',
    chequeNumber: supplier.chequeNumber || '',
    supplierPhotoUrl: supplier.supplierPhotoUrl || '',
    supplierPhotoPublicId: supplier.supplierPhotoPublicId || '',
    bankDocumentUrl: supplier.bankDocumentUrl || '',
    bankDocumentPublicId: supplier.bankDocumentPublicId || '',
    nidCopyUrl: supplier.nidCopyUrl || '',
    nidCopyPublicId: supplier.nidCopyPublicId || '',
    tradeLicenseCopyUrl: supplier.tradeLicenseCopyUrl || '',
    tradeLicenseCopyPublicId: supplier.tradeLicenseCopyPublicId || '',
    passportPhotoUrl: supplier.passportPhotoUrl || '',
    passportPhotoPublicId: supplier.passportPhotoPublicId || '',
    signatureUrl: supplier.signatureUrl || '',
    signaturePublicId: supplier.signaturePublicId || '',
    createdAt: supplier.createdAt || now,
    updatedAt: supplier.updatedAt || supplier.createdAt || now,
  }
}

function normalizeSupplierMap(suppliers?: Record<string, SupplierRecord> | null) {
  return Object.fromEntries(
    Object.entries(suppliers ?? {}).map(([id, supplier]) => [id, normalizeSupplierRecord(supplier)])
  )
}

function normalizeEmployeeRecord(employee: EmployeeRecord): EmployeeRecord {
  return {
    ...employee,
    zoneId: employee.zoneId || '',
    area: employee.area || '',
    fatherName: employee.fatherName || '',
    motherName: employee.motherName || '',
    dateOfBirth: employee.dateOfBirth || '',
    nid: employee.nid || '',
    experience: employee.experience || '',
    compensationType: employee.compensationType ?? 'salary',
    // Employees saved before the joining-form approval step existed are already on the payroll.
    approvalStatus: employee.approvalStatus ?? 'approved',
    submittedBy: employee.submittedBy || '',
    approvedBy: employee.approvedBy || '',
    approvedAt: employee.approvedAt || '',
    baseSalary: Number(employee.baseSalary ?? 0),
    taDa: Number(employee.taDa ?? 0),
    daPerDay: Number(employee.daPerDay ?? 0),
    houseRent: Number(employee.houseRent ?? 0),
    mobileBill: Number(employee.mobileBill ?? 0),
    commissionPerUnit: Number(employee.commissionPerUnit ?? 0),
  }
}

function normalizeProductRecord(product: ProductRecord): ProductRecord {
  return {
    ...product,
    serialNumber: product.serialNumber || '',
    warrantyMonths: Number(product.warrantyMonths ?? 0),
  }
}

function normalizeProductMap(products?: Record<string, ProductRecord> | null) {
  return Object.fromEntries(
    Object.entries(products ?? {}).map(([id, product]) => [id, normalizeProductRecord(product)])
  )
}

function normalizeOrderRecord(order: OrderRecord): OrderRecord {
  const now = new Date().toISOString()

  return {
    ...order,
    billNumber: order.billNumber || `INV-${order.id.replace(/\D/g, '').slice(-6) || Date.now()}`,
    paymentDueDate: order.paymentDueDate || order.deliveryDate || now,
    dueReference: order.dueReference ?? '',
    overdueNotified: order.overdueNotified ?? false,
  }
}

const SUBMISSION_KIND_LABELS: Record<EditableSubmissionKind, string> = {
  deposits: 'deposit',
  supplierPayments: 'supplier payment',
  expenses: 'expense',
}

const SUBMISSION_FIELD_LABELS: Record<keyof SubmissionPatch, string> = {
  amount: 'Amount',
  date: 'Date',
  note: 'Note',
  method: 'Method',
  purpose: 'Purpose',
  category: 'Category',
}

function normalizeOrderMap(orders?: Record<string, OrderRecord> | null) {
  return Object.fromEntries(
    Object.entries(orders ?? {}).map(([id, order]) => [id, normalizeOrderRecord(order)])
  )
}

function normalizeERPData(data: ERPData | null): ERPData {
  const source = data ?? ({} as Partial<ERPData>)

  return {
    permissions: DEFAULT_ERP_DATA.permissions,
    roles: resolveRoles(source.roles),
    users: source.users ?? {},
    warehouses: source.warehouses ?? {},
    suppliers: normalizeSupplierMap(source.suppliers),
    customers: normalizeCustomerMap(source.customers),
    zones: normalizeZoneMap(source.zones),
    depots: source.depots ?? {},
    products: normalizeProductMap(source.products),
    orders: normalizeOrderMap(source.orders),
    purchases: source.purchases ?? {},
    tasks: source.tasks ?? {},
    notifications: source.notifications ?? {},
    activities: source.activities ?? {},
    expenses: source.expenses ?? {},
    sellers: source.sellers ?? {},
    sellerTransactions: source.sellerTransactions ?? {},
    creditLedgerEntries: source.creditLedgerEntries ?? {},
    ledgerEntryRequests: source.ledgerEntryRequests ?? {},
    deposits: source.deposits ?? {},
    complaints: source.complaints ?? {},
    replacements: source.replacements ?? {},
    replacementReturns: source.replacementReturns ?? {},
    bankAccounts: source.bankAccounts ?? {},
    supplierPayments: source.supplierPayments ?? {},
    orderRequests: source.orderRequests ?? {},
    changeRequests: source.changeRequests ?? {},
    auditLog: source.auditLog ?? {},
    attendance: source.attendance ?? {},
    couriers: source.couriers ?? {},
    damageProducts: source.damageProducts ?? {},
    leads: source.leads ?? {},
    investors: source.investors ?? {},
    employees: Object.fromEntries(
      Object.entries(source.employees ?? {}).map(([id, employee]) => [id, normalizeEmployeeRecord(employee)])
    ),
    salesTargets: source.salesTargets ?? {},
    salaries: source.salaries ?? {},
    employeeAdvances: source.employeeAdvances ?? {},
    commissionAuthorizations: source.commissionAuthorizations ?? {},
    advanceRequests: source.advanceRequests ?? {},
    batteryReports: source.batteryReports ?? {},
    businesses: source.businesses ?? {},
    businessEntries: source.businessEntries ?? {},
    settings: {
      ...DEFAULT_ERP_DATA.settings,
      ...source.settings,
    },
    meta: {
      ...DEFAULT_ERP_DATA.meta,
      ...source.meta,
    },
  }
}

function clearLegacySession() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY)
}

function getAuthOrThrow() {
  if (!auth) {
    throw new Error('Firebase Authentication is only available in the browser.')
  }

  return auth
}

function getDatabaseOrThrow() {
  if (!database) {
    throw new Error('Firebase Realtime Database is only available in the browser.')
  }

  return database
}

function normalizeProductInput(input: ProductInput) {
  return {
    name: input.name.trim(),
    category: input.category?.trim() ?? '',
    brand: input.brand?.trim() ?? '',
    sku: input.sku.trim().toUpperCase(),
    serialNumber: input.serialNumber?.trim() ?? '',
    warrantyMonths: Math.max(input.warrantyMonths ?? 0, 0),
    warehouseId: input.warehouseId,
    supplierId: input.supplierId?.trim() ?? '',
    purchasePrice: input.purchasePrice,
    sellingPrice: input.sellingPrice,
    wholesalePrice: input.wholesalePrice ?? input.sellingPrice,
    stockQty: input.stockQty,
    minStock: input.minStock,
    maxStock: Math.max(input.maxStock ?? 0, 0),
    description: input.description?.trim() ?? '',
    imageUrl: input.imageUrl?.trim() ?? '',
    imagePublicId: input.imagePublicId?.trim() ?? '',
  }
}

function normalizeWarehouseInput(input: WarehouseInput) {
  return {
    name: input.name.trim(),
    location: input.location.trim(),
  }
}

function normalizeCustomerInput(input: CustomerInput) {
  return {
    name: input.name.trim(),
    company: input.company?.trim() || 'Retail',
    phone: input.phone.trim(),
    email: input.email?.trim() ?? '',
    location: input.location?.trim() ?? '',
    due: Math.max(input.due ?? 0, 0),
    leadSource: input.leadSource ?? 'local-marketing',
    reminderCustomer: input.reminderCustomer ?? false,
    nid: input.nid?.trim() ?? '',
    tradeLicenseNo: input.tradeLicenseNo?.trim() ?? '',
    nomineeName: input.nomineeName?.trim() ?? '',
    nomineeNid: input.nomineeNid?.trim() ?? '',
    thana: input.thana?.trim() ?? '',
    district: input.district?.trim() ?? '',
    chequeNumber: input.chequeNumber?.trim() ?? '',
    bankName: input.bankName?.trim() ?? '',
    branchName: input.branchName?.trim() ?? '',
    nidCopyUrl: input.nidCopyUrl ?? '',
    nidCopyPublicId: input.nidCopyPublicId ?? '',
    tradeLicenseCopyUrl: input.tradeLicenseCopyUrl ?? '',
    tradeLicenseCopyPublicId: input.tradeLicenseCopyPublicId ?? '',
    passportPhotoUrl: input.passportPhotoUrl ?? '',
    passportPhotoPublicId: input.passportPhotoPublicId ?? '',
    bankDocumentUrl: input.bankDocumentUrl ?? '',
    bankDocumentPublicId: input.bankDocumentPublicId ?? '',
    dealerPhotoUrl: input.dealerPhotoUrl ?? '',
    dealerPhotoPublicId: input.dealerPhotoPublicId ?? '',
    signatureUrl: input.signatureUrl ?? '',
    signaturePublicId: input.signaturePublicId ?? '',
    extraPhotos: normalizeExtraPhotos(input.extraPhotos),
    zoneId: input.zoneId ?? '',
    creditLimit: Math.max(input.creditLimit ?? 0, 0),
    depotId: input.depotId ?? '',
  }
}

function normalizeSupplierInput(input: SupplierInput, existing?: SupplierRecord | null) {
  // Bank and document fields left out of the input (quick create, LC status changes) keep their stored value.
  const bankField = (value: string | undefined, current: string | undefined) => value?.trim() ?? current ?? ''

  return {
    name: input.name.trim(),
    company: input.company?.trim() || input.name.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() ?? '',
    location: input.location?.trim() ?? '',
    supplierType: input.supplierType ?? 'local',
    country: input.country?.trim() || 'Bangladesh',
    lcNumber: input.lcNumber?.trim() ?? '',
    lcStatus: input.lcStatus ?? 'not-required',
    productCost: Math.max(input.productCost ?? 0, 0),
    shippingCost: Math.max(input.shippingCost ?? 0, 0),
    customsDuty: Math.max(input.customsDuty ?? 0, 0),
    otherCost: Math.max(input.otherCost ?? 0, 0),
    currency: input.currency?.trim().toUpperCase() || 'BDT',
    notes: input.notes?.trim() ?? '',
    suppliedProducts: Array.from(new Set((input.suppliedProducts ?? []).map((name) => name.trim()).filter(Boolean))),
    openingDue: Math.max(input.openingDue ?? existing?.openingDue ?? 0, 0),
    bankAccountName: bankField(input.bankAccountName, existing?.bankAccountName),
    bankAccountNumber: bankField(input.bankAccountNumber, existing?.bankAccountNumber),
    bankName: bankField(input.bankName, existing?.bankName),
    bankBranch: bankField(input.bankBranch, existing?.bankBranch),
    bankRoutingNumber: bankField(input.bankRoutingNumber, existing?.bankRoutingNumber),
    bankSwiftCode: bankField(input.bankSwiftCode, existing?.bankSwiftCode).toUpperCase(),
    mobileBankingNumber: bankField(input.mobileBankingNumber, existing?.mobileBankingNumber),
    nid: bankField(input.nid, existing?.nid),
    tradeLicenseNo: bankField(input.tradeLicenseNo, existing?.tradeLicenseNo),
    nomineeName: bankField(input.nomineeName, existing?.nomineeName),
    nomineeNid: bankField(input.nomineeNid, existing?.nomineeNid),
    chequeNumber: bankField(input.chequeNumber, existing?.chequeNumber),
    supplierPhotoUrl: bankField(input.supplierPhotoUrl, existing?.supplierPhotoUrl),
    supplierPhotoPublicId: bankField(input.supplierPhotoPublicId, existing?.supplierPhotoPublicId),
    bankDocumentUrl: bankField(input.bankDocumentUrl, existing?.bankDocumentUrl),
    bankDocumentPublicId: bankField(input.bankDocumentPublicId, existing?.bankDocumentPublicId),
    nidCopyUrl: bankField(input.nidCopyUrl, existing?.nidCopyUrl),
    nidCopyPublicId: bankField(input.nidCopyPublicId, existing?.nidCopyPublicId),
    tradeLicenseCopyUrl: bankField(input.tradeLicenseCopyUrl, existing?.tradeLicenseCopyUrl),
    tradeLicenseCopyPublicId: bankField(input.tradeLicenseCopyPublicId, existing?.tradeLicenseCopyPublicId),
    passportPhotoUrl: bankField(input.passportPhotoUrl, existing?.passportPhotoUrl),
    passportPhotoPublicId: bankField(input.passportPhotoPublicId, existing?.passportPhotoPublicId),
    signatureUrl: bankField(input.signatureUrl, existing?.signatureUrl),
    signaturePublicId: bankField(input.signaturePublicId, existing?.signaturePublicId),
  }
}

export function ERPProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ERPData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null)
  const [authReady, setAuthReady] = useState(false)
  // Which session the token is for. Until its claims are read, nothing is loaded, so a dealer's
  // session never tries (and fails) to open the ERP data.
  const [portalClaim, setPortalClaim] = useState<{ uid: string; portal: boolean } | null>(null)
  const currentUserId = authUser?.uid ?? null
  const claimResolved = !authUser || portalClaim?.uid === authUser.uid
  const isPortalUser = Boolean(authUser && portalClaim?.uid === authUser.uid && portalClaim.portal)

  useEffect(() => {
    if (!authUser) {
      setPortalClaim(null)
      return
    }

    let cancelled = false
    authUser
      .getIdTokenResult()
      .then((result) => {
        if (!cancelled) setPortalClaim({ uid: authUser.uid, portal: result.claims.portal === true })
      })
      .catch(() => {
        if (!cancelled) setPortalClaim({ uid: authUser.uid, portal: false })
      })

    return () => {
      cancelled = true
    }
  }, [authUser])

  useEffect(() => {
    clearLegacySession()

    if (!auth) {
      setAuthReady(true)
      return
    }

    // In-memory persistence keeps auto-login off: closing or reloading the tab
    // drops the session and the user lands back on the sign-in screen.
    void setPersistence(auth, inMemoryPersistence)

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setAuthUser(user)
      setAuthReady(true)
    })

    // Keeps `authUser` pointing at a token the database rules will still accept.
    const unsubscribeToken = onIdTokenChanged(auth, (user) => setAuthUser(user))

    return () => {
      unsubscribeAuth()
      unsubscribeToken()
    }
  }, [])

  useEffect(() => {
    if (!authReady) {
      return
    }

    if (!authUser) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    if (!claimResolved) {
      setLoading(true)
      return
    }

    // Dealers and suppliers cannot read the ERP data; the portal pages load their own sheet.
    if (isPortalUser) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)

    let unsubscribe = () => undefined

    try {
      const db = getDatabaseOrThrow()
      const erpRef = ref(db, 'erp')

      unsubscribe = onValue(
        erpRef,
        (snapshot) => {
          setData(normalizeERPData(snapshot.val() as ERPData | null))
          setLoading(false)
        },
        (reason) => {
          setError(reason.message)
          setLoading(false)
        }
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Firebase Realtime Database is unavailable.')
      setLoading(false)
    }

    return () => unsubscribe()
  }, [authReady, authUser, claimResolved, isPortalUser])

  const users = useMemo(() => {
    return [...toArray(data?.users)].sort((left, right) => left.name.localeCompare(right.name))
  }, [data?.users])

  const currentUser = useMemo(
    () => users.find((user) => user.id === currentUserId) ?? null,
    [currentUserId, users]
  )

  const currentPermissions = useMemo(() => {
    const permissions = new Set(getPermissions(data, currentUser))
    // Users an admin picked as attendance handlers get attendance access whatever their role.
    if (currentUser && data?.settings.attendanceHandlerIds?.includes(currentUser.id)) {
      ATTENDANCE_HANDLER_PERMISSIONS.forEach((permission) => permissions.add(permission))
    }
    // Likewise, the users an admin put in charge of inventory run stock and the warehouses.
    if (currentUser && data?.settings.inventoryManagerIds?.includes(currentUser.id)) {
      INVENTORY_MANAGER_PERMISSIONS.forEach((permission) => permissions.add(permission))
    }
    return Array.from(permissions)
  }, [currentUser, data])
  const canTakeAttendance = currentPermissions.includes('attendance.edit')
  const needsApproval = useMemo(() => changesNeedApprovalFor(data?.roles, currentUser), [currentUser, data?.roles])
  const zoneViewOnly = useMemo(() => isZoneInCharge(currentUser, toArray(data?.zones)), [currentUser, data?.zones])

  /** Stops a zone in charge from changing client data, whichever screen the change comes from. */
  function viewOnlyForZone<Args extends unknown[], Result>(action: (...args: Args) => Promise<Result>) {
    return async (...args: Args) => {
      if (zoneViewOnly) {
        throw new Error('You can only view the client data of your zone. Changes are not allowed.')
      }
      return action(...args)
    }
  }

  // A Firebase account is not enough on its own: the matching ERP record has to
  // exist and still be active, otherwise we drop the session immediately.
  useEffect(() => {
    if (!authUser || !data) {
      return
    }

    const record = data.users[authUser.uid]

    if (!record) {
      setError('This account is not set up in the ERP. Ask an administrator to add you.')
      void signOut(getAuthOrThrow())
      return
    }

    if (record.status !== 'active') {
      setError('This account is inactive.')
      void signOut(getAuthOrThrow())
    }
  }, [authUser, data])

  // Clients and suppliers opened before system codes existed get one, oldest first, the
  // first time an admin opens the ERP; new ones get theirs when they are saved.
  useEffect(() => {
    if (!data || !currentUser || !userRoleIds(currentUser).includes('admin')) {
      return
    }

    const updates: Record<string, string> = {}
    const assign = (path: 'customers' | 'suppliers', records: Array<{ id: string; code?: string; createdAt: string }>, prefix: string) => {
      const coded = records.filter((record) => record.code)
      for (const record of records.filter((item) => !item.code).sort((left, right) => (left.createdAt ?? '').localeCompare(right.createdAt ?? ''))) {
        const code = nextPartyCode(coded, prefix)
        coded.push({ ...record, code })
        updates[`${path}/${record.id}/code`] = code
      }
    }
    assign('customers', Object.values(data.customers), CUSTOMER_CODE_PREFIX)
    assign('suppliers', Object.values(data.suppliers), SUPPLIER_CODE_PREFIX)

    if (Object.keys(updates).length > 0) {
      void update(ref(getDatabaseOrThrow(), 'erp'), updates).catch(() => undefined)
    }
  }, [currentUser, data])

  useEffect(() => {
    if (!data) {
      return
    }

    const now = Date.now()
    const overdueOrders = Object.values(data.orders).filter(
      (order) => order.due > 0 && !order.overdueNotified && new Date(order.paymentDueDate).getTime() < now
    )

    if (overdueOrders.length === 0) {
      return
    }

    let cancelled = false

    async function flagOverdueOrders() {
      const db = getDatabaseOrThrow()

      for (const order of overdueOrders) {
        if (cancelled) {
          return
        }

        await update(ref(db, `erp/orders/${order.id}`), { overdueNotified: true })
        await writeNotification(
          'Payment overdue',
          `${order.customerName}'s payment of ${order.due} for ${order.billNumber} is past the due date.`,
          'critical',
          ['admin', 'accountant']
        )
      }
    }

    void flagOverdueOrders()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.orders])

  async function login(identifier: string, password: string) {
    const trimmed = identifier.trim()

    if (!trimmed) {
      throw new Error('Enter your email address or phone number.')
    }

    // The server finds the account for an email or phone number and checks the password, so
    // the browser never learns which email belongs to a phone number. It also records the login.
    let response: Response
    try {
      response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: trimmed, password }),
      })
    } catch {
      throw new Error('Network error. Check your connection and try again.')
    }

    const result = (await response.json().catch(() => null)) as { token?: string; portal?: boolean; error?: string } | null
    if (!response.ok || !result?.token) {
      throw new Error(result?.error ?? 'Unable to log in.')
    }

    await signInWithCustomToken(getAuthOrThrow(), result.token)
    return { portal: result.portal === true }
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const signedInUser = getAuthOrThrow().currentUser
    if (!signedInUser) {
      throw new Error('You need to log in first.')
    }

    const response = await fetch(isPortalUser ? '/api/portal/password' : '/api/account/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await signedInUser.getIdToken()}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    const result = (await response.json().catch(() => null)) as { token?: string; error?: string } | null
    if (!response.ok || !result?.token) {
      throw new Error(result?.error ?? 'Unable to change the password.')
    }

    // A new password ends the old session; carry on with a fresh one.
    await signInWithCustomToken(getAuthOrThrow(), result.token)
    await writeActivity('password_changed', 'admin', `${currentUser?.name ?? 'A user'} changed their password.`)
  }

  async function fetchLoginHistory(userId: string) {
    const signedInUser = getAuthOrThrow().currentUser
    if (!signedInUser) {
      throw new Error('You need to log in first.')
    }

    const response = await fetch(`/api/admin/users/logins?userId=${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${await signedInUser.getIdToken()}` },
    })
    const result = (await response.json().catch(() => null)) as { entries?: LoginHistoryEntry[]; error?: string } | null
    if (!response.ok) {
      throw new Error(result?.error ?? 'Unable to load the login history.')
    }
    return result?.entries ?? []
  }

  async function logout() {
    clearLegacySession()
    await signOut(getAuthOrThrow())
  }

  async function authorizedFetch<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}) {
    const signedInUser = getAuthOrThrow().currentUser
    if (!signedInUser) {
      throw new Error('You need to log in first.')
    }

    const response = await fetch(path, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${await signedInUser.getIdToken()}`,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    const result = (await response.json().catch(() => null)) as (T & { error?: string }) | null
    if (!response.ok) {
      throw new Error(result?.error ?? 'Something went wrong. Please try again.')
    }
    return result as T
  }

  /**
   * Sends the dealer or supplier a bank-style alert (portal inbox and WhatsApp) for a row just
   * added to their sheet. It runs in the background: a failed alert never undoes the entry.
   */
  function notifyTransaction(kind: PortalTransactionKind, id: string) {
    void authorizedFetch('/api/admin/portal/transaction', { method: 'POST', body: { kind, id } }).catch((reason) => {
      console.warn('Sheet alert was not sent:', reason)
    })
  }

  /** Attaches the caller's ID token so the API route can authorize the request. */
  async function callUserApi(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', payload: Record<string, unknown>) {
    const signedInUser = getAuthOrThrow().currentUser

    if (!signedInUser) {
      throw new Error('You need to log in first.')
    }

    const response = await fetch('/api/admin/users', {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await signedInUser.getIdToken()}`,
      },
      body: JSON.stringify(payload),
    })

    const result = (await response.json().catch(() => null)) as { error?: string; user?: UserRecord } | null

    if (!response.ok) {
      throw new Error(result?.error ?? 'Unable to save user.')
    }

    return result
  }

  async function writeActivity(action: string, module: string, message: string) {
    if (!currentUser) {
      return
    }

    const db = getDatabaseOrThrow()
    const activityId = createId('activity')
    await update(ref(db, 'erp/activities'), {
      [activityId]: {
        id: activityId,
        action,
        module,
        message,
        userId: currentUser.id,
        userName: currentUser.name,
        createdAt: new Date().toISOString(),
      },
    })
  }

  async function writeNotification(
    title: string,
    body: string,
    level: 'info' | 'warning' | 'critical',
    roles?: string[]
  ) {
    const db = getDatabaseOrThrow()
    const notificationId = createId('notification')
    await update(ref(db, 'erp/notifications'), {
      [notificationId]: {
        id: notificationId,
        title,
        body,
        level,
        read: false,
        createdAt: new Date().toISOString(),
        roles: roles || null,
      },
    })
  }

  async function saveProduct(input: ProductInput, productId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const normalized = normalizeProductInput(input)

    if (!normalized.name) {
      throw new Error('Product name is required.')
    }

    if (!normalized.sku) {
      throw new Error('SKU or model code is required.')
    }

    if (!data.warehouses[normalized.warehouseId]) {
      throw new Error('Select a valid warehouse.')
    }

    if (normalized.supplierId && !data.suppliers[normalized.supplierId]) {
      throw new Error('Selected supplier was not found.')
    }

    const db = getDatabaseOrThrow()
    const existingProduct = productId ? data.products[productId] : null
    const id = existingProduct?.id ?? createId('product')
    const now = new Date().toISOString()
    const product = {
      id,
      ...normalized,
      ...(existingProduct?.zonePrices ? { zonePrices: existingProduct.zonePrices } : {}),
      status: getProductStatus(normalized.stockQty, normalized.minStock),
      createdAt: existingProduct?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/products'), { [id]: product })
    await writeActivity(
      existingProduct ? 'product_updated' : 'product_created',
      'inventory',
      existingProduct
        ? `Updated ${product.name} inventory details.`
        : `Added ${product.name} with ${product.stockQty} units in stock.`
    )

    if (!existingProduct) {
      await writeNotification(
        'Product added',
        `${product.name} has been added to inventory by ${currentUser?.name ?? 'Admin'}.`,
        'info',
        ['admin', 'store_manager', 'sales_person']
      )
    } else {
      if (existingProduct.stockQty !== product.stockQty) {
        await writeNotification(
          'Stock adjusted',
          `${product.name} stock level was adjusted from ${existingProduct.stockQty} to ${product.stockQty} by ${currentUser?.name ?? 'Admin'}.`,
          'warning',
          ['admin', 'store_manager']
        )
      } else {
        await writeNotification(
          'Product details updated',
          `${product.name} details were updated by ${currentUser?.name ?? 'Admin'}.`,
          'info',
          ['admin', 'store_manager']
        )
      }
    }

    if (product.stockQty <= product.minStock) {
      await writeNotification(
        'Low stock alert',
        `${product.name} is already at or below its minimum stock (${product.stockQty}/${product.minStock}).`,
        'warning',
        ['admin', 'store_manager']
      )
    }

    return id
  }

  async function deleteProduct(productId: string) {
    if (!data) {
      return
    }

    const product = data.products[productId]
    if (!product) {
      throw new Error('Product not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`products/${productId}`]: null,
    })
    await writeActivity('product_deleted', 'inventory', `Deleted ${product.name} from inventory.`)
    await writeNotification(
      'Product deleted',
      `${product.name} was deleted from inventory by ${currentUser?.name ?? 'Admin'}.`,
      'warning',
      ['admin', 'store_manager']
    )
  }

  async function saveWarehouse(input: WarehouseInput, warehouseId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const normalized = normalizeWarehouseInput(input)

    if (!normalized.name) {
      throw new Error('Warehouse name is required.')
    }

    if (!normalized.location) {
      throw new Error('Warehouse location is required.')
    }

    const db = getDatabaseOrThrow()
    const existingWarehouse = warehouseId ? data.warehouses[warehouseId] : null
    const id = existingWarehouse?.id ?? createId('warehouse')
    const warehouse = {
      id,
      ...normalized,
    }

    await update(ref(db, 'erp/warehouses'), { [id]: warehouse })
    await writeActivity(
      existingWarehouse ? 'warehouse_updated' : 'warehouse_created',
      'warehouse',
      existingWarehouse
        ? `Updated ${warehouse.name} warehouse details.`
        : `Added ${warehouse.name} warehouse.`
    )

    return id
  }

  async function saveCustomer(input: CustomerInput, customerId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const existingCustomer = customerId ? data.customers[customerId] : null
    const normalized = normalizeCustomerInput({
      ...input,
      leadSource: input.leadSource ?? existingCustomer?.leadSource ?? 'local-marketing',
      reminderCustomer: input.reminderCustomer ?? existingCustomer?.reminderCustomer ?? false,
      email: input.email ?? existingCustomer?.email ?? '',
      nid: input.nid ?? existingCustomer?.nid ?? '',
      tradeLicenseNo: input.tradeLicenseNo ?? existingCustomer?.tradeLicenseNo ?? '',
      nomineeName: input.nomineeName ?? existingCustomer?.nomineeName ?? '',
      nomineeNid: input.nomineeNid ?? existingCustomer?.nomineeNid ?? '',
      thana: input.thana ?? existingCustomer?.thana ?? '',
      district: input.district ?? existingCustomer?.district ?? '',
      chequeNumber: input.chequeNumber ?? existingCustomer?.chequeNumber ?? '',
      bankName: input.bankName ?? existingCustomer?.bankName ?? '',
      branchName: input.branchName ?? existingCustomer?.branchName ?? '',
      nidCopyUrl: input.nidCopyUrl ?? existingCustomer?.nidCopyUrl ?? '',
      nidCopyPublicId: input.nidCopyPublicId ?? existingCustomer?.nidCopyPublicId ?? '',
      tradeLicenseCopyUrl: input.tradeLicenseCopyUrl ?? existingCustomer?.tradeLicenseCopyUrl ?? '',
      tradeLicenseCopyPublicId: input.tradeLicenseCopyPublicId ?? existingCustomer?.tradeLicenseCopyPublicId ?? '',
      passportPhotoUrl: input.passportPhotoUrl ?? existingCustomer?.passportPhotoUrl ?? '',
      passportPhotoPublicId: input.passportPhotoPublicId ?? existingCustomer?.passportPhotoPublicId ?? '',
      bankDocumentUrl: input.bankDocumentUrl ?? existingCustomer?.bankDocumentUrl ?? '',
      bankDocumentPublicId: input.bankDocumentPublicId ?? existingCustomer?.bankDocumentPublicId ?? '',
      dealerPhotoUrl: input.dealerPhotoUrl ?? existingCustomer?.dealerPhotoUrl ?? '',
      dealerPhotoPublicId: input.dealerPhotoPublicId ?? existingCustomer?.dealerPhotoPublicId ?? '',
      signatureUrl: input.signatureUrl ?? existingCustomer?.signatureUrl ?? '',
      signaturePublicId: input.signaturePublicId ?? existingCustomer?.signaturePublicId ?? '',
      extraPhotos: input.extraPhotos ?? existingCustomer?.extraPhotos ?? {},
      zoneId: input.zoneId ?? existingCustomer?.zoneId ?? '',
      creditLimit: input.creditLimit ?? existingCustomer?.creditLimit ?? 0,
      depotId: input.depotId ?? existingCustomer?.depotId ?? '',
    })

    if (!normalized.name) {
      throw new Error('Customer name is required.')
    }

    if (!normalized.phone) {
      throw new Error('Customer phone number is required.')
    }

    if (needsApproval) {
      await requestChange('customer', existingCustomer ? 'update' : 'create', existingCustomer?.id ?? '', normalized.name, input)
      return ''
    }

    const db = getDatabaseOrThrow()
    const id = existingCustomer?.id ?? createId('customer')
    const now = new Date().toISOString()
    const customer = {
      id,
      code: existingCustomer?.code || nextPartyCode(Object.values(data.customers), CUSTOMER_CODE_PREFIX),
      ...normalized,
      ...(existingCustomer?.commitments ? { commitments: existingCustomer.commitments } : {}),
      ...(existingCustomer?.prices ? { prices: existingCustomer.prices } : {}),
      createdAt: existingCustomer?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/customers'), { [id]: customer })
    await writeActivity(
      existingCustomer ? 'customer_updated' : 'customer_created',
      'customers',
      existingCustomer ? `Updated ${customer.name} CRM details.` : `Added customer ${customer.name} (${customer.code}).`
    )

    return id
  }

  async function deleteCustomer(customerId: string) {
    if (!data) {
      return
    }

    const customer = data.customers[customerId]
    if (!customer) {
      throw new Error('Customer not found.')
    }

    const hasOrders = Object.values(data.orders).some((order) => order.customerId === customerId)
    if (hasOrders) {
      throw new Error('Customers with purchase history cannot be deleted.')
    }

    if (needsApproval) {
      await requestChange('customer', 'delete', customerId, customer.name)
      return
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`customers/${customerId}`]: null,
    })
    await writeActivity('customer_deleted', 'customers', `Deleted customer ${customer.name}.`)
  }

  async function saveCustomerCommitment(customerId: string, input: CustomerCommitmentInput, commitmentId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const customer = data.customers[customerId]
    if (!customer) {
      throw new Error('Customer not found.')
    }

    const note = input.note.trim()
    if (!note) {
      throw new Error('Commitment details are required.')
    }

    const existing = commitmentId ? customer.commitments?.[commitmentId] : undefined
    // A zone in charge may only add commitments for their own zone's clients, and each one
    // waits for the Authorizer and then the Chairman before it counts.
    if (zoneViewOnly) {
      if (existing) {
        throw new Error('You can only add new commitments. Changes are not allowed.')
      }
      if (!visibleData?.customers[customerId]) {
        throw new Error('You can only add commitments for the clients of your zone.')
      }
    }
    const id = existing?.id ?? createId('commitment')
    const now = new Date().toISOString()
    const commitment: CustomerCommitment = {
      ...existing,
      id,
      note,
      dueDate: input.dueDate ?? existing?.dueDate ?? '',
      status: input.status ?? existing?.status ?? 'pending',
      approvalStage: existing ? existing.approvalStage ?? 'approved' : zoneViewOnly ? 'authorizer' : 'approved',
      showOnPdf: input.showOnPdf ?? existing?.showOnPdf ?? true,
      imageUrl: input.imageUrl ?? existing?.imageUrl ?? '',
      imagePublicId: input.imagePublicId ?? existing?.imagePublicId ?? '',
      createdBy: existing?.createdBy ?? currentUser?.name ?? '',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, `erp/customers/${customerId}/commitments`), { [id]: commitment })
    await writeActivity(
      existing ? 'customer_commitment_updated' : 'customer_commitment_created',
      'customers',
      existing
        ? `Updated a commitment for ${customer.name}.`
        : `Added a commitment for ${customer.name}: ${note}`
    )
    if (commitment.approvalStage === 'authorizer') {
      await writeNotification(
        'Commitment waiting for authorization',
        `${currentUser?.name ?? 'A zone in charge'} made a commitment to ${customer.name}: ${note}. Submit it to the Chairman or reject it from the client's details.`,
        'warning',
        ['authorizer', 'admin']
      )
    }
  }

  async function reviewCustomerCommitment(customerId: string, commitmentId: string, decision: 'approve' | 'reject') {
    if (!data || !currentUser) {
      throw new Error('You need to log in before reviewing commitments.')
    }

    const customer = data.customers[customerId]
    const existing = customer?.commitments?.[commitmentId]
    if (!customer || !existing) {
      throw new Error('Commitment not found.')
    }

    const stage = existing.approvalStage
    if (stage !== 'authorizer' && stage !== 'chairman') {
      throw new Error('This commitment has already been reviewed.')
    }
    if (!canActAtStage(currentUser, stage)) {
      throw new Error(stage === 'authorizer' ? 'Only the Authorizer can review this commitment.' : 'Only the Chairman can approve this commitment.')
    }
    // The Authorizer only reviews the clients of the zones they are assigned.
    if (!visibleData?.customers[customerId]) {
      throw new Error('This client is not in your zone.')
    }

    const now = new Date().toISOString()
    const reviewer = currentUser.name
    const changes: Partial<CustomerCommitment> =
      decision === 'reject'
        ? { approvalStage: 'rejected', rejectedBy: reviewer, rejectedAt: now }
        : stage === 'authorizer'
          ? { approvalStage: 'chairman', authorizedBy: reviewer, authorizedAt: now }
          : { approvalStage: 'approved', approvedBy: reviewer, approvedAt: now }

    const db = getDatabaseOrThrow()
    await update(ref(db, `erp/customers/${customerId}/commitments/${commitmentId}`), { ...changes, updatedAt: now })

    const action =
      decision === 'reject' ? 'Rejected' : stage === 'authorizer' ? 'Submitted to the Chairman' : 'Approved'
    await writeActivity('customer_commitment_reviewed', 'customers', `${action} a commitment for ${customer.name}: ${existing.note}`)
    if (decision === 'approve' && stage === 'authorizer') {
      await writeNotification(
        'Commitment waiting for approval',
        `${reviewer} submitted a commitment to ${customer.name} for your approval: ${existing.note}`,
        'warning',
        ['chairman', 'admin']
      )
    }
  }

  async function deleteCustomerCommitment(customerId: string, commitmentId: string) {
    if (!data) {
      return
    }

    const customer = data.customers[customerId]
    if (!customer?.commitments?.[commitmentId]) {
      throw new Error('Commitment not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, `erp/customers/${customerId}/commitments`), { [commitmentId]: null })
    await writeActivity('customer_commitment_deleted', 'customers', `Removed a commitment for ${customer.name}.`)
  }

  async function saveZone(input: ZoneInput, zoneId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const name = input.name.trim()
    if (!name) {
      throw new Error('Zone name is required.')
    }

    const existingZone = zoneId ? data.zones[zoneId] : null
    const duplicate = Object.values(data.zones).find(
      (zone) => zone.id !== existingZone?.id && zone.name.trim().toLowerCase() === name.toLowerCase()
    )
    if (duplicate) {
      throw new Error(`A zone named ${duplicate.name} already exists.`)
    }

    const id = existingZone?.id ?? createId('zone')
    const now = new Date().toISOString()
    const zone: ZoneRecord = {
      id,
      name,
      thanas: Array.from(
        new Map(
          (input.thanas ?? existingZone?.thanas ?? []).map((area) => [`${area.district}|${area.thana}`, area])
        ).values()
      ),
      districts: Array.from(new Set(input.districts ?? existingZone?.districts ?? [])),
      managerIds: Array.from(new Set(input.managerIds ?? existingZone?.managerIds ?? [])),
      ...(existingZone?.priceExcludedCustomerIds ? { priceExcludedCustomerIds: existingZone.priceExcludedCustomerIds } : {}),
      createdAt: existingZone?.createdAt ?? now,
      updatedAt: now,
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp/zones'), { [id]: zone })
    await writeActivity(
      existingZone ? 'zone_updated' : 'zone_created',
      'zones',
      existingZone ? `Updated ${zone.name} zone.` : `Added ${zone.name} zone.`
    )

    return id
  }

  async function deleteZone(zoneId: string) {
    if (!data) {
      return
    }

    const zone = data.zones[zoneId]
    if (!zone) {
      throw new Error('Zone not found.')
    }

    // Dealers pinned to this zone are left without one.
    const updates: Record<string, null | string> = { [`zones/${zoneId}`]: null }
    for (const customer of Object.values(data.customers)) {
      if (customer.zoneId === zoneId) {
        updates[`customers/${customer.id}/zoneId`] = ''
      }
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), updates)
    await writeActivity('zone_deleted', 'zones', `Deleted ${zone.name} zone.`)
  }

  async function saveDepot(input: DepotInput, depotId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const name = input.name.trim()
    if (!name) {
      throw new Error('Depot name is required.')
    }
    const ownerName = input.ownerName.trim()
    if (!ownerName) {
      throw new Error('Depot owner name is required.')
    }
    const phone = input.phone.trim()
    if (!phone) {
      throw new Error('Depot phone number is required.')
    }

    const existingDepot = depotId ? data.depots[depotId] : null
    const duplicate = Object.values(data.depots).find(
      (depot) => depot.id !== existingDepot?.id && depot.name.trim().toLowerCase() === name.toLowerCase()
    )
    if (duplicate) {
      throw new Error(`A depot named ${duplicate.name} already exists.`)
    }

    const id = existingDepot?.id ?? createId('depot')
    const address = input.address?.trim() ?? ''
    // The depot's dealers get their deliveries from its own warehouse, kept in step with the depot.
    const warehouseId = existingDepot?.warehouseId && data.warehouses[existingDepot.warehouseId] ? existingDepot.warehouseId : createId('warehouse')
    const now = new Date().toISOString()
    const depot: DepotRecord = {
      id,
      name,
      ownerName,
      phone,
      address,
      zoneId: input.zoneId ?? existingDepot?.zoneId ?? '',
      ownerUserId: input.ownerUserId ?? existingDepot?.ownerUserId ?? '',
      warehouseId,
      ...(existingDepot?.prices ? { prices: existingDepot.prices } : {}),
      notes: input.notes?.trim() ?? existingDepot?.notes ?? '',
      createdAt: existingDepot?.createdAt ?? now,
      updatedAt: now,
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`depots/${id}`]: depot,
      [`warehouses/${warehouseId}`]: { id: warehouseId, name: `${name} Depot`, location: address },
    })
    await writeActivity(
      existingDepot ? 'depot_updated' : 'depot_created',
      'customers',
      existingDepot ? `Updated ${depot.name} depot.` : `Added ${depot.name} depot owned by ${depot.ownerName}.`
    )

    return id
  }

  async function deleteDepot(depotId: string) {
    if (!data) {
      return
    }

    const depot = data.depots[depotId]
    if (!depot) {
      throw new Error('Depot not found.')
    }

    // Its dealers go back to ordinary dealers. The warehouse stays, since deliveries and stock may point at it.
    const updates: Record<string, null | string> = { [`depots/${depotId}`]: null }
    for (const customer of Object.values(data.customers)) {
      if (customer.depotId === depotId) {
        updates[`customers/${customer.id}/depotId`] = ''
      }
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), updates)
    await writeActivity('depot_deleted', 'customers', `Deleted ${depot.name} depot.`)
  }

  async function setDealersDepot(customerIds: string[], depotId: string) {
    if (!data) {
      return
    }

    const depot = depotId ? data.depots[depotId] : null
    if (depotId && !depot) {
      throw new Error('Save the depot before adding dealers to it.')
    }

    const now = new Date().toISOString()
    const updates: Record<string, string> = {}
    const names: string[] = []
    for (const customerId of customerIds) {
      const customer = data.customers[customerId]
      if (!customer) continue
      updates[`customers/${customerId}/depotId`] = depotId
      updates[`customers/${customerId}/updatedAt`] = now
      names.push(customer.name)
    }
    if (!names.length) {
      throw new Error('Select at least one dealer.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), updates)
    await writeActivity(
      depot ? 'depot_dealers_added' : 'depot_dealers_removed',
      'customers',
      depot ? `Added ${names.join(', ')} to ${depot.name} depot.` : `Took ${names.join(', ')} out of their depot.`
    )
  }

  async function saveDepotPrices(depotId: string, prices: Record<string, number | null>) {
    const depot = data?.depots[depotId]
    if (!depot) {
      throw new Error('Depot not found.')
    }

    const updates: Record<string, number | null> = {}
    Object.entries(prices).forEach(([productId, price]) => {
      if (!data.products[productId]) return
      updates[`depots/${depotId}/prices/${productId}`] = price === null ? null : Math.max(price, 0)
    })

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), updates)
    await writeActivity('depot_prices_updated', 'inventory', `Updated product prices for ${depot.name} depot.`)
  }

  async function saveSupplier(input: SupplierInput, supplierId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const existingSupplier = supplierId ? data.suppliers[supplierId] : null
    const normalized = normalizeSupplierInput(input, existingSupplier)

    if (!normalized.name) {
      throw new Error('Supplier name is required.')
    }

    if (!normalized.phone) {
      throw new Error('Supplier phone number is required.')
    }

    if (needsApproval) {
      await requestChange('supplier', existingSupplier ? 'update' : 'create', existingSupplier?.id ?? '', normalized.name, input)
      return ''
    }

    const db = getDatabaseOrThrow()
    const id = existingSupplier?.id ?? createId('supplier')
    const now = new Date().toISOString()
    const supplier = {
      id,
      code: existingSupplier?.code || nextPartyCode(Object.values(data.suppliers), SUPPLIER_CODE_PREFIX),
      ...normalized,
      createdAt: existingSupplier?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/suppliers'), { [id]: supplier })
    await writeActivity(
      existingSupplier ? 'supplier_updated' : 'supplier_created',
      'suppliers',
      existingSupplier
        ? `Updated ${supplier.name} supplier and import details.`
        : `Added supplier ${supplier.name} (${supplier.code}).`
    )

    return id
  }

  async function deleteSupplier(supplierId: string) {
    if (!data) {
      return
    }

    const supplier = data.suppliers[supplierId]
    if (!supplier) {
      throw new Error('Supplier not found.')
    }

    const hasProducts = Object.values(data.products).some((product) => product.supplierId === supplierId)
    const hasPurchases = Object.values(data.purchases).some((purchase) => purchase.supplierId === supplierId)
    if (hasProducts || hasPurchases) {
      throw new Error('Suppliers with product or purchase history cannot be deleted.')
    }

    if (needsApproval) {
      await requestChange('supplier', 'delete', supplierId, supplier.name)
      return
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`suppliers/${supplierId}`]: null,
    })
    await writeActivity('supplier_deleted', 'suppliers', `Deleted supplier ${supplier.name}.`)
  }

  async function deleteWarehouse(warehouseId: string) {
    if (!data) {
      return
    }

    const warehouse = data.warehouses[warehouseId]
    if (!warehouse) {
      throw new Error('Warehouse not found.')
    }

    const assignedProducts = Object.values(data.products).filter((product) => product.warehouseId === warehouseId)
    if (assignedProducts.length > 0) {
      throw new Error('Move or delete the products in this warehouse before removing it.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`warehouses/${warehouseId}`]: null,
    })
    await writeActivity('warehouse_deleted', 'warehouse', `Deleted ${warehouse.name} warehouse.`)
  }

  async function recordPurchase(input: PurchaseInput) {
    if (!data) {
      return
    }

    const db = getDatabaseOrThrow()
    const product = data.products[input.productId]
    const supplier = data.suppliers[input.supplierId]
    if (!product || !supplier) {
      throw new Error('Product or supplier not found.')
    }

    const purchaseId = createId('purchase')
    const nextStock = product.stockQty + input.quantity
    const now = new Date().toISOString()

    await update(ref(db, 'erp'), {
      [`purchases/${purchaseId}`]: {
        id: purchaseId,
        productId: product.id,
        productName: product.name,
        supplierId: supplier.id,
        supplierName: supplier.name,
        quantity: input.quantity,
        unitCost: input.unitCost,
        currency: input.currency,
        total: input.quantity * input.unitCost,
        status: 'received',
        createdAt: now,
      },
      [`products/${product.id}/stockQty`]: nextStock,
      [`products/${product.id}/purchasePrice`]: input.unitCost,
      [`products/${product.id}/status`]: getProductStatus(nextStock, product.minStock),
      [`products/${product.id}/updatedAt`]: now,
    })

    notifyTransaction('purchase', purchaseId)
    await writeActivity('purchase_received', 'inventory', `Restocked ${product.name} by ${input.quantity} units.`)
    await writeNotification(
      'Purchase recorded',
      `Restocked ${product.name} by ${input.quantity} units from ${supplier.name} by ${currentUser?.name ?? 'Admin'}.`,
      'info',
      ['admin', 'store_manager', 'accountant']
    )
  }

  /** `seller` books the order under someone else, e.g. the staff member whose order request an admin approved. */
  async function createOrder(input: OrderInput, seller?: { id: string; name: string }) {
    if (!data || !currentUser) {
      return
    }
    const salesPerson = seller ?? currentUser

    const db = getDatabaseOrThrow()
    const customer = data.customers[input.customerId]
    if (!customer) {
      throw new Error('Customer not found.')
    }

    if (!input.items.length) {
      throw new Error('Add at least one product.')
    }

    const requestedByProduct = new Map<string, number>()
    const orderItems = input.items.map((item) => {
      const product = data.products[item.productId]
      if (!product) throw new Error('Product not found.')
      if (item.quantity <= 0) throw new Error(`Quantity for ${product.name} must be greater than zero.`)
      if (item.unitPrice < 0) throw new Error(`Price for ${product.name} cannot be negative.`)
      requestedByProduct.set(product.id, (requestedByProduct.get(product.id) ?? 0) + item.quantity)
      return {
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        purchasePrice: product.purchasePrice,
      }
    })

    requestedByProduct.forEach((quantity, productId) => {
      const product = data.products[productId]
      if (product.stockQty < quantity) throw new Error(`Insufficient stock for ${product.name}.`)
    })

    const subtotal = orderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    const discount = Math.min(Math.max(input.discount ?? 0, 0), subtotal)
    const total = subtotal - discount
    if (input.paid < 0) {
      throw new Error('Paid amount cannot be negative.')
    }

    const orderId = createId('order')
    const paid = Math.min(Math.max(input.paid, 0), total)
    const due = total - paid

    const creditLimit = customer.creditLimit ?? 0
    const overCreditLimit = creditLimit > 0 && (customer.due ?? 0) + due > creditLimit
    if (overCreditLimit && data.settings.blockOverLimitOrders) {
      throw new Error(`This order takes ${customer.name} over their credit limit, and over-limit orders are blocked.`)
    }

    const employee = input.employeeId ? data.employees[input.employeeId] : null
    if (input.employeeId && !employee) {
      throw new Error('Employee not found.')
    }
    const now = new Date().toISOString()
    const orderDate = input.orderDate?.trim() || now
    const defaultDueDate = new Date(orderDate)
    defaultDueDate.setDate(defaultDueDate.getDate() + 15)

    const updates: Record<string, unknown> = {
      [`orders/${orderId}`]: {
        id: orderId,
        billNumber: input.billNumber?.trim() || `INV-${Date.now().toString().slice(-8)}`,
        customerId: customer.id,
        customerName: customer.name,
        salesPersonId: salesPerson.id,
        salesPersonName: salesPerson.name,
        status: 'pending',
        paymentStatus: due === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
        total,
        subtotal,
        discount,
        paid,
        due,
        deliveryDate: input.deliveryDate,
        paymentDueDate: input.paymentDueDate?.trim() || defaultDueDate.toISOString(),
        dueReference: due > 0 ? input.dueReference || 'owner' : '',
        overdueNotified: false,
        employeeId: employee?.id ?? '',
        employeeName: employee?.name ?? '',
        courierName: input.courierName?.trim() ?? '',
        overCreditLimit,
        createdAt: orderDate,
        items: orderItems,
      },
      [`customers/${customer.id}/due`]: (data.customers[customer.id]?.due ?? 0) + due,
    }

    requestedByProduct.forEach((quantity, productId) => {
      const product = data.products[productId]
      const nextStock = product.stockQty - quantity
      updates[`products/${product.id}/stockQty`] = nextStock
      updates[`products/${product.id}/status`] = getProductStatus(nextStock, product.minStock)
      updates[`products/${product.id}/updatedAt`] = now
    })

    await update(ref(db, 'erp'), updates)
    notifyTransaction('order', orderId)

    await writeActivity('order_created', 'sales', `Created order for ${customer.name} with ${orderItems.length} product line(s).`)
    await writeNotification(
      'New sales order',
      `Order ${orderId} created for ${customer.name} by ${currentUser?.name ?? 'Admin'}. Awaiting fulfillment.`,
      'info',
      ['admin', 'sales_person', 'accountant']
    )

    if (overCreditLimit) {
      await writeNotification(
        'Over-limit order',
        `Order for ${customer.name} went over their credit limit of ${creditLimit.toLocaleString()} (submitted by ${currentUser.name}).`,
        'warning',
        ['admin', 'accountant']
      )
    }

    for (const [productId, quantity] of requestedByProduct) {
      const product = data.products[productId]
      const nextStock = product.stockQty - quantity
      if (nextStock > product.minStock) continue
      await writeNotification(
        'Low stock alert',
        `${product.name} needs replenishment after the latest sale (${nextStock}/${product.minStock}).`,
        'warning',
        ['admin', 'store_manager']
      )
    }

    return orderId
  }

  async function setCustomerCreditLimit(customerId: string, creditLimit: number) {
    if (!data?.customers[customerId]) {
      throw new Error('Customer not found.')
    }

    const db = getDatabaseOrThrow()
    const customer = data.customers[customerId]
    const limit = Math.max(Number.isFinite(creditLimit) ? creditLimit : 0, 0)
    await update(ref(db, `erp/customers/${customerId}`), { creditLimit: limit, updatedAt: new Date().toISOString() })
    await writeActivity('customer_credit_limit', 'customers', `Set ${customer.name}'s credit limit to ${limit.toLocaleString()}.`)
  }

  async function saveZonePrices(zoneId: string, prices: Record<string, number | null>) {
    if (!data?.zones[zoneId]) {
      throw new Error('Zone not found.')
    }

    const db = getDatabaseOrThrow()
    const updates: Record<string, number | null> = {}
    Object.entries(prices).forEach(([productId, price]) => {
      if (!data.products[productId]) return
      updates[`products/${productId}/zonePrices/${zoneId}`] = price === null ? null : Math.max(price, 0)
    })

    await update(ref(db, 'erp'), updates)
    await writeActivity('zone_prices_updated', 'inventory', `Updated product prices for zone ${data.zones[zoneId].name}.`)
  }

  async function saveGeneralPrices(prices: Record<string, number>) {
    requireAdminUser('change prices')
    if (!data) {
      return
    }

    const now = new Date().toISOString()
    const updates: Record<string, number | string> = {}
    let changed = 0
    Object.entries(prices).forEach(([productId, price]) => {
      const product = data.products[productId]
      if (!product || !(price >= 0) || price === product.wholesalePrice) return
      updates[`products/${productId}/wholesalePrice`] = price
      updates[`products/${productId}/updatedAt`] = now
      changed += 1
    })
    if (changed === 0) {
      return
    }

    await update(ref(getDatabaseOrThrow(), 'erp'), updates)
    await writeActivity('general_prices_updated', 'inventory', `Changed the price of ${changed} product${changed === 1 ? '' : 's'} for every dealer.`)
  }

  async function saveDealerPrices(customerId: string, prices: Record<string, number | null>) {
    requireAdminUser('change prices')
    const customer = data?.customers[customerId]
    if (!data || !customer) {
      throw new Error('Dealer not found.')
    }

    const updates: Record<string, number | null> = {}
    Object.entries(prices).forEach(([productId, price]) => {
      if (!data.products[productId]) return
      updates[`customers/${customerId}/prices/${productId}`] = price === null ? null : Math.max(price, 0)
    })

    await update(ref(getDatabaseOrThrow(), 'erp'), updates)
    await writeActivity('dealer_prices_updated', 'inventory', `Updated the dealer prices of ${customer.name}.`)
  }

  async function saveZonePriceExclusions(zoneId: string, customerIds: string[]) {
    requireAdminUser('change prices')
    const zone = data?.zones[zoneId]
    if (!data || !zone) {
      throw new Error('Zone not found.')
    }

    const valid = Array.from(new Set(customerIds.filter((id) => data.customers[id])))
    await update(ref(getDatabaseOrThrow(), `erp/zones/${zoneId}`), { priceExcludedCustomerIds: valid, updatedAt: new Date().toISOString() })
    await writeActivity(
      'zone_price_exclusions_updated',
      'inventory',
      valid.length
        ? `${valid.length} dealer${valid.length === 1 ? '' : 's'} of ${zone.name} now keep the general price.`
        : `Every dealer of ${zone.name} now follows its zone prices.`
    )
  }

  async function updateSettings(input: Partial<SettingsRecord>) {
    if (!currentUser || !userRoleIds(currentUser).includes('admin')) {
      throw new Error('Only an admin can change these settings.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp/settings'), input)
    await writeActivity('settings_updated', 'settings', `Updated settings: ${Object.keys(input).join(', ')}.`)
  }

  async function updateOrderStatus(orderId: string, status: OrderRecord['status']) {
    if (!data) {
      return
    }

    const db = getDatabaseOrThrow()
    const order = data.orders[orderId]
    if (!order) {
      return
    }

    await update(ref(db, `erp/orders/${orderId}`), { status })
    await writeActivity('order_status_changed', 'sales', `Moved order ${orderId} to ${status}.`)
    await writeNotification(
      'Order status updated',
      `Order ${orderId} status was updated to "${status}" by ${currentUser?.name ?? 'Admin'}.`,
      'info',
      ['admin', 'sales_person', 'accountant']
    )
  }

  async function createTask(input: TaskInput) {
    if (!data || !currentUser) {
      return
    }

    const db = getDatabaseOrThrow()
    const assignee = data.users[input.assigneeId]
    if (!assignee) {
      throw new Error('Assignee not found.')
    }

    const taskId = createId('task')
    const now = new Date().toISOString()

    await update(ref(db, 'erp/tasks'), {
      [taskId]: {
        id: taskId,
        title: input.title,
        description: input.description,
        module: input.module,
        status: 'pending',
        priority: input.priority,
        assigneeId: assignee.id,
        assigneeName: assignee.name,
        dueDate: input.dueDate,
        createdBy: currentUser.id,
        createdAt: now,
      },
    })

    await writeActivity('task_created', 'operations', `Assigned "${input.title}" to ${assignee.name}.`)
    await writeNotification(
      'New task assigned',
      `Task "${input.title}" was assigned to ${assignee.name} by ${currentUser?.name ?? 'Admin'}.`,
      'info',
      ['admin', assignee.roleId]
    )
  }

  async function createUser(input: UserInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before creating users.')
    }

    // The API route re-checks this server-side; this is only for a fast, clear error.
    if (!hasPermissionCheck(data, currentUser, 'users.edit')) {
      throw new Error('You do not have permission to create users.')
    }

    const created = await callUserApi('POST', {
      name: input.name,
      loginId: input.loginId,
      email: input.email,
      phone: input.phone,
      password: input.password,
      roleId: input.roleId,
      title: input.title,
      zoneIds: input.zoneIds ?? [],
      areaKeys: input.areaKeys ?? [],
      reportsTo: input.reportsTo ?? '',
      extraRoleIds: input.extraRoleIds ?? [],
    })

    await writeActivity(
      'user_created',
      'admin',
      `Created user ${input.name.trim()} with ${data.roles[input.roleId]?.name ?? input.roleId} access.`
    )
    await writeNotification(
      'New user registered',
      `User ${input.name.trim()} was registered as ${data.roles[input.roleId]?.name ?? input.roleId} by ${currentUser.name}.`,
      'info',
      ['admin']
    )
    await notifyRoleRequests(created?.user, [])
  }

  async function updateUser(userId: string, input: UserInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before updating users.')
    }

    if (!hasPermissionCheck(data, currentUser, 'users.edit')) {
      throw new Error('You do not have permission to update users.')
    }

    const previousRequests = data.users[userId]?.pendingRoleIds ?? []
    const updated = await callUserApi('PATCH', {
      userId,
      name: input.name,
      loginId: input.loginId,
      email: input.email,
      phone: input.phone,
      password: input.password,
      roleId: input.roleId,
      title: input.title,
      zoneIds: input.zoneIds ?? [],
      areaKeys: input.areaKeys ?? [],
      reportsTo: input.reportsTo ?? '',
      extraRoleIds: input.extraRoleIds ?? [],
    })

    await writeActivity('user_updated', 'admin', `Updated user ${input.name.trim()}.`)
    await notifyRoleRequests(updated?.user, previousRequests)
  }

  /** Lets the admins know a user was put forward for roles that wait for their approval. */
  async function notifyRoleRequests(user: UserRecord | undefined, previousRequests: string[]) {
    const requested = (user?.pendingRoleIds ?? []).filter((roleId) => !previousRequests.includes(roleId))
    if (!user || !requested.length || !data) return

    const names = requested.map((roleId) => data.roles[roleId]?.name ?? roleId).join(', ')
    await writeActivity('role_requested', 'admin', `Requested ${names} for ${user.name}.`)
    await writeNotification(
      'Role approval needed',
      `${currentUser?.name ?? 'Someone'} asked to give ${user.name} the ${names} role. Approve or reject it under User & Role Management.`,
      'warning',
      ['admin']
    )
  }

  async function reviewRoleRequest(userId: string, roleId: string, decision: 'approve' | 'reject') {
    if (!data || !currentUser) {
      throw new Error('You need to log in before reviewing role requests.')
    }

    // The API route re-checks this server-side.
    if (currentUser.roleId !== 'admin') {
      throw new Error('Only an admin can approve or reject role requests.')
    }

    const user = data.users[userId]
    await callUserApi('PUT', { userId, roleId, decision })
    await writeActivity(
      decision === 'approve' ? 'role_request_approved' : 'role_request_rejected',
      'admin',
      `${decision === 'approve' ? 'Approved' : 'Rejected'} the ${data.roles[roleId]?.name ?? roleId} role for ${user?.name ?? userId}.`
    )
  }

  async function deleteUser(userId: string) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before deleting users.')
    }

    if (!hasPermissionCheck(data, currentUser, 'users.delete')) {
      throw new Error('You do not have permission to delete users.')
    }

    if (userId === currentUser.id) {
      throw new Error('You cannot delete your own account.')
    }

    const existing = data.users[userId]
    if (!existing) {
      throw new Error('User not found.')
    }

    await callUserApi('DELETE', { userId })
    await writeActivity('user_deleted', 'admin', `Deleted user ${existing.name}.`)
  }


  async function createRole(input: RoleInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before creating roles.')
    }

    if (!hasPermissionCheck(data, currentUser, 'roles.edit')) {
      throw new Error('You do not have permission to create roles.')
    }

    const name = input.name.trim()
    if (!name) {
      throw new Error('Role name is required.')
    }

    const nameExists = Object.values(data.roles).some(
      (role) => role.name.trim().toLowerCase() === name.toLowerCase()
    )
    if (nameExists) {
      throw new Error('A role with that name already exists.')
    }

    const validPermissionIds = new Set(Object.keys(data.permissions))
    const permissions = input.permissions.filter((permission) => validPermissionIds.has(permission))
    const zoneIds = Array.from(new Set((input.zoneIds ?? []).filter((zoneId) => data.zones[zoneId])))

    const db = getDatabaseOrThrow()
    const id = createId('role')
    const role: RoleRecord = {
      id,
      name,
      description: input.description?.trim() ?? '',
      permissions,
      zoneIds,
      dataScope: input.dataScope === 'assigned' ? 'assigned' : 'all',
      requiresApproval: Boolean(input.requiresApproval),
    }

    await update(ref(db, 'erp/roles'), { [id]: role })
    await writeActivity('role_created', 'admin', `Created role ${role.name} with ${permissions.length} permission(s).`)
  }

  async function updateRole(roleId: string, input: RoleInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before updating roles.')
    }

    if (!hasPermissionCheck(data, currentUser, 'roles.edit')) {
      throw new Error('You do not have permission to update roles.')
    }

    const existing = data.roles[roleId]
    if (!existing) {
      throw new Error('Role not found.')
    }

    const name = input.name.trim()
    if (!name) {
      throw new Error('Role name is required.')
    }

    const nameExists = Object.values(data.roles).some(
      (role) => role.id !== roleId && role.name.trim().toLowerCase() === name.toLowerCase()
    )
    if (nameExists) {
      throw new Error('A role with that name already exists.')
    }

    const validPermissionIds = new Set(Object.keys(data.permissions))
    const permissions = input.permissions.filter((permission) => validPermissionIds.has(permission))
    // The admin role always sees every zone.
    const zoneIds = roleId === 'admin' ? [] : Array.from(new Set((input.zoneIds ?? []).filter((zoneId) => data.zones[zoneId])))

    const db = getDatabaseOrThrow()
    const updatedRole: RoleRecord = {
      ...existing,
      name,
      description: input.description?.trim() ?? '',
      permissions,
      zoneIds,
      // The admin role always sees everything.
      dataScope: roleId !== 'admin' && input.dataScope === 'assigned' ? 'assigned' : 'all',
      requiresApproval: roleId !== 'admin' && Boolean(input.requiresApproval),
    }

    await update(ref(db, `erp/roles/${roleId}`), updatedRole)
    await writeActivity('role_updated', 'admin', `Updated role ${updatedRole.name}.`)
  }

  async function deleteRole(roleId: string, reassignRoleId?: string) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before deleting roles.')
    }

    if (!hasPermissionCheck(data, currentUser, 'roles.delete')) {
      throw new Error('You do not have permission to delete roles.')
    }

    if (roleId === 'admin') {
      throw new Error('The Admin role cannot be deleted.')
    }

    const existing = data.roles[roleId]
    if (!existing) {
      throw new Error('Role not found.')
    }

    const assignedUsers = Object.values(data.users).filter((user) => user.roleId === roleId)
    if (assignedUsers.length > 0) {
      if (!reassignRoleId || reassignRoleId === roleId || !data.roles[reassignRoleId]) {
        throw new Error(
          `Choose a role to move the ${assignedUsers.length} user(s) currently assigned to ${existing.name} to.`
        )
      }
    }

    const db = getDatabaseOrThrow()
    const updates: Record<string, unknown> = { [`roles/${roleId}`]: null }
    for (const user of assignedUsers) {
      updates[`users/${user.id}/roleId`] = reassignRoleId
    }

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'role_deleted',
      'admin',
      assignedUsers.length > 0
        ? `Deleted role ${existing.name} and moved ${assignedUsers.length} user(s) to ${data.roles[reassignRoleId!]?.name}.`
        : `Deleted role ${existing.name}.`
    )
  }

  async function updateTaskStatus(taskId: string, status: TaskRecord['status']) {
    const db = getDatabaseOrThrow()
    await update(ref(db, `erp/tasks/${taskId}`), { status })
    await writeActivity('task_updated', 'operations', `Updated task ${taskId} to ${status}.`)
  }

  async function markNotificationRead(notificationId: string) {
    const db = getDatabaseOrThrow()
    await update(ref(db, `erp/notifications/${notificationId}`), { read: true })
  }

  async function markAllNotificationsRead(notificationIds: string[]) {
    if (notificationIds.length === 0) {
      return
    }
    const db = getDatabaseOrThrow()
    const updates: Record<string, boolean> = {}
    for (const id of notificationIds) {
      updates[`erp/notifications/${id}/read`] = true
    }
    await update(ref(db), updates)
  }

  async function saveExpense(input: ExpenseInput, expenseId?: string) {
    if (!data || !currentUser) {
      return
    }

    const category = input.category.trim()
    if (!category) {
      throw new Error('Expense category is required.')
    }

    if (input.amount <= 0) {
      throw new Error('Expense amount must be greater than zero.')
    }

    const existingExpense = expenseId ? data.expenses[expenseId] : null
    if (needsApproval) {
      await requestChange('expense', existingExpense ? 'update' : 'create', existingExpense?.id ?? '', category, input)
      return
    }

    const db = getDatabaseOrThrow()
    const id = existingExpense?.id ?? createId('expense')
    const now = new Date().toISOString()
    const expense = {
      id,
      category,
      amount: input.amount,
      note: input.note?.trim() ?? '',
      date: input.date?.trim() || now,
      createdBy: existingExpense?.createdBy ?? currentUser.id,
      createdByName: existingExpense?.createdByName ?? currentUser.name,
      createdAt: existingExpense?.createdAt ?? now,
    }

    await update(ref(db, 'erp/expenses'), { [id]: expense })
    await writeActivity(
      existingExpense ? 'expense_updated' : 'expense_created',
      'finance',
      existingExpense ? `Updated ${category} expense entry.` : `Recorded ${category} expense of ${expense.amount}.`
    )
  }

  async function saveInvestor(input: InvestorInput, investorId?: string) {
    if (!data) return
    const name = input.name.trim()
    const mobile = input.mobile.trim()
    if (!name) throw new Error('Investor name is required.')
    if (!mobile) throw new Error('Investor mobile number is required.')
    if (input.amount <= 0) throw new Error('Investment amount must be greater than zero.')

    const existing = investorId ? data.investors[investorId] : null
    const id = existing?.id ?? createId('investor')
    const now = new Date().toISOString()
    const investor = {
      id,
      name,
      location: input.location?.trim() ?? '',
      mobile,
      products: input.products?.trim() ?? '',
      amount: input.amount,
      note: input.note?.trim() ?? '',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await update(ref(getDatabaseOrThrow(), 'erp/investors'), { [id]: investor })
    await writeActivity(existing ? 'investor_updated' : 'investor_created', 'finance', `${existing ? 'Updated' : 'Added'} investor ${name}.`)
  }

  async function submitExpense(input: ExpenseInput) {
    if (!data || !currentUser) {
      return
    }

    const category = input.category.trim()
    if (!category) {
      throw new Error('Select an expense category.')
    }
    if (EMPLOYEE_EXPENSE_CATEGORIES.includes(category) && !input.expenseBy?.trim()) {
      throw new Error(`Select the employee this ${category} is for.`)
    }

    const isTa = category === TA_CATEGORY
    const taType = isTa ? (input.taType ?? 'fixed') : undefined
    const taEntries =
      taType === 'actual'
        ? (input.taEntries ?? []).map((entry) => ({
            date: entry.date,
            from: entry.from.trim(),
            to: entry.to.trim(),
            reason: entry.reason.trim(),
            person: entry.person.trim(),
            vehicle: entry.vehicle.trim(),
            amount: entry.amount,
          }))
        : []
    if (taType === 'actual') {
      if (!taEntries.length) {
        throw new Error('Add at least one day to the actual TA form.')
      }
      if (taEntries.some((entry) => !entry.date || !entry.from || !entry.to || !entry.reason || !entry.vehicle || !(entry.amount > 0))) {
        throw new Error('Every TA trip needs from, to, reason, vehicle and an amount.')
      }
    }
    const amount = taType === 'actual' ? taEntries.reduce((sum, entry) => sum + entry.amount, 0) : input.amount

    if (!(amount > 0)) {
      throw new Error('Amount must be greater than zero.')
    }
    if (!input.documentUrl) {
      throw new Error('Attach a picture of the voucher.')
    }
    const expenseBy = input.expenseBy?.trim() || currentUser.name

    const db = getDatabaseOrThrow()
    const id = createId('expense')
    const now = new Date().toISOString()

    await update(ref(db, 'erp/expenses'), {
      [id]: {
        id,
        category,
        amount,
        note: input.note?.trim() ?? '',
        date: input.date?.trim() || now,
        expenseBy,
        documentUrl: input.documentUrl ?? '',
        documentPublicId: input.documentPublicId ?? '',
        ...(taType ? { taType, taEntries } : {}),
        ...(input.employeeId ? { employeeId: input.employeeId } : {}),
        ...(input.daMonth ? { daMonth: input.daMonth } : {}),
        status: 'pending',
        createdBy: currentUser.id,
        createdByName: currentUser.name,
        createdAt: now,
      },
    })

    const label = taType ? `${category} (${taType})` : category
    await writeActivity('expense_submitted', 'finance', `Submitted a ${amount.toLocaleString()} ${label} expense for approval.`)
    await writeNotification(
      'Expense awaiting approval',
      `${currentUser.name} submitted a ${amount.toLocaleString()} ${label} expense (by ${expenseBy}).`,
      'info',
      ['admin', 'accountant']
    )
  }

  async function reviewExpense(expenseId: string, decision: 'approve' | 'reject') {
    if (!data || !currentUser) {
      return
    }
    if (!userRoleIds(currentUser).includes('admin')) {
      throw new Error('Only an admin can approve expenses.')
    }

    const expense = data.expenses[expenseId]
    if (!expense) {
      throw new Error('Expense not found.')
    }
    if (expense.status !== 'pending') {
      throw new Error('This expense has already been reviewed.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    await update(ref(db, `erp/expenses/${expenseId}`), {
      status: decision === 'approve' ? 'approved' : 'rejected',
      reviewedById: currentUser.id,
      reviewedByName: currentUser.name,
      reviewedAt: now,
    })
    await writeActivity(
      decision === 'approve' ? 'expense_approved' : 'expense_rejected',
      'finance',
      `${decision === 'approve' ? 'Approved' : 'Rejected'} the ${expense.amount.toLocaleString()} ${expense.category} expense.`
    )
    await writeAuditEntry({
      kind: 'expense',
      refId: expenseId,
      decision: decision === 'approve' ? 'approved' : 'rejected',
      party: expense.expenseBy || expense.createdByName,
      summary: [expense.category, expense.note].filter(Boolean).join(' · '),
      amount: expense.amount,
      submittedByName: expense.createdByName,
      submittedByRole: roleNameOf(expense.createdBy),
      submittedAt: expense.createdAt,
      edits: expense.edits,
    })
  }

  async function markAttendance(day: string, marks: Record<string, AttendanceStatus | null>) {
    if (!data || !currentUser) {
      return
    }
    if (!canTakeAttendance) {
      throw new Error('You do not have access to take attendance. Ask an admin.')
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new Error('Pick a valid date.')
    }
    if (day > dayKey()) {
      throw new Error('Attendance cannot be taken for a future date.')
    }

    // Handlers limited to a zone only mark the employees they can see.
    const visibleEmployees = scopeDataToUserZones(data, currentUser).employees
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = {}
    for (const [employeeId, status] of Object.entries(marks)) {
      if (!visibleEmployees[employeeId]) continue
      updates[`${day}/${employeeId}`] =
        status === null ? null : { status, markedById: currentUser.id, markedByName: currentUser.name, markedAt: now }
    }
    if (!Object.keys(updates).length) {
      return
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp/attendance'), updates)
    await writeActivity('attendance_marked', 'employees', `Took attendance for ${Object.keys(updates).length} employee(s) on ${day}.`)
  }

  async function deleteExpense(expenseId: string) {
    if (!data) {
      return
    }

    const expense = data.expenses[expenseId]
    if (!expense) {
      throw new Error('Expense not found.')
    }

    if (needsApproval) {
      await requestChange('expense', 'delete', expenseId, expense.category)
      return
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`expenses/${expenseId}`]: null })
    await writeActivity('expense_deleted', 'finance', `Deleted ${expense.category} expense entry.`)
  }

  async function saveSeller(input: SellerInput, sellerId?: string) {
    if (!data) {
      return
    }

    const name = input.name.trim()
    if (!name) {
      throw new Error('Seller name is required.')
    }

    const phone = input.phone.trim()
    if (!phone) {
      throw new Error('Seller phone number is required.')
    }

    const db = getDatabaseOrThrow()
    const existingSeller = sellerId ? data.sellers[sellerId] : null
    const id = existingSeller?.id ?? createId('seller')
    const now = new Date().toISOString()
    const seller = {
      id,
      name,
      phone,
      location: input.location?.trim() ?? '',
      notes: input.notes?.trim() ?? '',
      createdAt: existingSeller?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/sellers'), { [id]: seller })
    await writeActivity(
      existingSeller ? 'seller_updated' : 'seller_created',
      'sellers',
      existingSeller ? `Updated ${seller.name} seller details.` : `Added seller ${seller.name}.`
    )
  }

  async function deleteSeller(sellerId: string) {
    if (!data) {
      return
    }

    const seller = data.sellers[sellerId]
    if (!seller) {
      throw new Error('Seller not found.')
    }

    const hasTransactions = Object.values(data.sellerTransactions).some(
      (transaction) => transaction.sellerId === sellerId
    )
    if (hasTransactions) {
      throw new Error('Sellers with ledger history cannot be deleted.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`sellers/${sellerId}`]: null })
    await writeActivity('seller_deleted', 'sellers', `Deleted seller ${seller.name}.`)
  }

  async function recordSellerTransaction(input: SellerTransactionInput) {
    if (!data) {
      return
    }

    const seller = data.sellers[input.sellerId]
    if (!seller) {
      throw new Error('Seller not found.')
    }

    const db = getDatabaseOrThrow()
    const transactionId = createId('seller_txn')
    const now = new Date().toISOString()

    await update(ref(db, 'erp/sellerTransactions'), {
      [transactionId]: {
        id: transactionId,
        sellerId: seller.id,
        sellerName: seller.name,
        date: input.date?.trim() || now,
        itemsTaken: input.itemsTaken?.trim() ?? '',
        takenValue: Math.max(input.takenValue ?? 0, 0),
        cashGiven: Math.max(input.cashGiven ?? 0, 0),
        goodsBroughtDescription: input.goodsBroughtDescription?.trim() ?? '',
        iReceiveAmount: Math.max(input.iReceiveAmount ?? 0, 0),
        theyReceiveAmount: Math.max(input.theyReceiveAmount ?? 0, 0),
        createdAt: now,
      },
    })

    await writeActivity('seller_transaction_recorded', 'sellers', `Recorded a ledger entry for ${seller.name}.`)
  }

  async function deleteSellerTransaction(transactionId: string) {
    if (!data) {
      return
    }

    const transaction = data.sellerTransactions[transactionId]
    if (!transaction) {
      throw new Error('Transaction not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`sellerTransactions/${transactionId}`]: null })
    await writeActivity(
      'seller_transaction_deleted',
      'sellers',
      `Removed a ledger entry for ${transaction.sellerName}.`
    )
  }

  async function recordCreditLedgerEntry(input: CreditLedgerEntryInput) {
    if (!data) {
      return
    }

    const customer = data.customers[input.customerId]
    if (!customer) {
      throw new Error('Customer not found.')
    }

    // A zone in charge's entry waits for their zone's Authorizer, then the Chairman.
    if (zoneViewOnly) {
      await submitLedgerEntryRequest(customer, input)
      return
    }

    if (needsApproval) {
      await requestChange('credit_entry', 'create', '', customer.name, input)
      return
    }

    const db = getDatabaseOrThrow()
    const entryId = createId('credit_entry')
    const now = new Date().toISOString()

    await update(ref(db, 'erp/creditLedgerEntries'), {
      [entryId]: {
        id: entryId,
        customerId: customer.id,
        customerName: customer.name,
        date: input.date?.trim() || now,
        particulars: input.particulars.trim(),
        qty: Math.max(input.qty ?? 0, 0),
        unitPrice: Math.max(input.unitPrice ?? 0, 0),
        debit: Math.max(input.debit ?? 0, 0),
        credit: Math.max(input.credit ?? 0, 0),
        createdAt: now,
      },
    })

    notifyTransaction('ledger_entry', entryId)
    await writeActivity('credit_entry_recorded', 'customers', `Recorded a credit sheet entry for ${customer.name}.`)
  }

  async function submitLedgerEntryRequest(customer: CustomerRecord, input: CreditLedgerEntryInput) {
    if (!data || !currentUser) {
      return
    }
    if (!visibleData?.customers[customer.id]) {
      throw new Error('You can only add ledger entries for the clients of your zone.')
    }
    const particulars = input.particulars.trim()
    if (!particulars) {
      throw new Error('Particulars are required.')
    }
    const debit = Math.max(input.debit ?? 0, 0)
    const credit = Math.max(input.credit ?? 0, 0)
    if (!(debit > 0 || credit > 0)) {
      throw new Error('Amount must be greater than zero.')
    }

    const db = getDatabaseOrThrow()
    const id = createId('ledger_request')
    const now = new Date().toISOString()
    const request: LedgerEntryRequestRecord = {
      id,
      customerId: customer.id,
      customerName: customer.name,
      date: input.date?.trim() || now,
      particulars,
      qty: Math.max(input.qty ?? 0, 0),
      unitPrice: Math.max(input.unitPrice ?? 0, 0),
      debit,
      credit,
      status: 'pending',
      zoneId: customerZoneId(customer, toArray(data.zones)),
      submittedById: currentUser.id,
      submittedByName: currentUser.name,
      createdAt: now,
      updatedAt: now,
    }
    await update(ref(db, 'erp/ledgerEntryRequests'), { [id]: request })

    const amount = Math.max(debit, credit).toLocaleString()
    await writeActivity('ledger_entry_submitted', 'customers', `Submitted a ${amount} ledger entry for ${customer.name} for approval.`)
    await writeNotification(
      'Ledger entry awaiting the Authorizer',
      `${currentUser.name} added a ledger entry for ${customer.name}: ${particulars} (${debit > 0 ? 'debit' : 'credit'} ${amount}).`,
      'info',
      ['authorizer', 'admin']
    )
  }

  /** The Authorizer accepts it and sends it to the Chairman; the Chairman's approval writes it to the client's ledger. */
  async function reviewLedgerEntryRequest(requestId: string, decision: 'approve' | 'reject') {
    if (!data || !currentUser) {
      return
    }

    const request = data.ledgerEntryRequests[requestId]
    if (!request) {
      throw new Error('Ledger entry not found.')
    }
    const stage = requireApprovalStage(request, 'ledger entry')
    const amount = Math.max(request.debit, request.credit)
    if (stage === 'authorizer' && decision === 'approve') {
      await recordAuthorization('ledgerEntryRequests', requestId, `the ${amount.toLocaleString()} ledger entry for ${request.customerName}`)
      return
    }

    const customer = data.customers[request.customerId]
    if (decision === 'approve' && !customer) {
      throw new Error('This client no longer exists. Reject the entry instead.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const entryId = decision === 'approve' ? createId('credit_entry') : ''
    const updates: Record<string, unknown> = {
      [`ledgerEntryRequests/${requestId}/status`]: decision === 'approve' ? 'approved' : 'rejected',
      [`ledgerEntryRequests/${requestId}/reviewedById`]: currentUser.id,
      [`ledgerEntryRequests/${requestId}/reviewedByName`]: currentUser.name,
      [`ledgerEntryRequests/${requestId}/reviewedAt`]: now,
      [`ledgerEntryRequests/${requestId}/updatedAt`]: now,
    }
    if (entryId && customer) {
      updates[`ledgerEntryRequests/${requestId}/entryId`] = entryId
      updates[`creditLedgerEntries/${entryId}`] = {
        id: entryId,
        customerId: customer.id,
        customerName: customer.name,
        date: request.date,
        particulars: request.particulars,
        qty: request.qty,
        unitPrice: request.unitPrice,
        debit: request.debit,
        credit: request.credit,
        createdAt: now,
      }
    }

    await update(ref(db, 'erp'), updates)
    if (entryId) notifyTransaction('ledger_entry', entryId)
    await writeActivity(
      decision === 'approve' ? 'ledger_entry_approved' : 'ledger_entry_rejected',
      'customers',
      `${decision === 'approve' ? 'Approved' : 'Rejected'} the ${amount.toLocaleString()} ledger entry for ${request.customerName}.`
    )
    await writeAuditEntry({
      kind: 'change',
      refId: requestId,
      decision: decision === 'approve' ? 'approved' : 'rejected',
      party: request.customerName,
      summary: [`Ledger entry: ${request.particulars}`, request.authorizedByName && `Authorized by ${request.authorizedByName}`].filter(Boolean).join(' · '),
      amount,
      submittedByName: request.submittedByName,
      submittedByRole: roleNameOf(request.submittedById),
      submittedAt: request.createdAt,
    })
    if (decision === 'reject') {
      await writeNotification(
        'Ledger entry rejected',
        `${currentUser.name} rejected the ledger entry for ${request.customerName}: ${request.particulars}.`,
        'warning',
        ['admin']
      )
    }
  }

  async function submitDeposit(input: DepositInput) {
    if (!data || !currentUser) {
      return
    }

    const customer = data.customers[input.customerId]
    if (!customer) {
      throw new Error('Customer not found.')
    }
    if (!(input.amount > 0)) {
      throw new Error('Amount must be greater than zero.')
    }
    if (!input.method.trim()) {
      throw new Error('Select a payment method.')
    }

    const db = getDatabaseOrThrow()
    const depositId = createId('deposit')
    const now = new Date().toISOString()

    await update(ref(db, 'erp/deposits'), {
      [depositId]: {
        id: depositId,
        customerId: customer.id,
        customerName: customer.name,
        date: input.date?.trim() || now,
        amount: input.amount,
        method: input.method.trim(),
        note: input.note?.trim() ?? '',
        status: 'pending',
        zoneId: customerZoneId(customer, toArray(data.zones)),
        submittedById: currentUser.id,
        submittedByName: currentUser.name,
        createdAt: now,
        updatedAt: now,
      },
    })

    await writeActivity('deposit_submitted', 'customers', `Submitted a ${input.amount.toLocaleString()} deposit for ${customer.name}.`)
    await writeNotification(
      'Deposit awaiting the Authorizer',
      `${currentUser.name} submitted a ${input.amount.toLocaleString()} deposit (${input.method.trim()}) for ${customer.name}.`,
      'info',
      ['authorizer', 'admin', 'accountant']
    )
  }

  async function reviewDeposit(depositId: string, decision: 'approve' | 'reject') {
    if (!data || !currentUser) {
      return
    }

    const deposit = data.deposits[depositId]
    if (!deposit) {
      throw new Error('Deposit not found.')
    }
    const stage = requireApprovalStage(deposit, 'deposit')
    if (stage === 'authorizer' && decision === 'approve') {
      await recordAuthorization('deposits', depositId, `the ${deposit.amount.toLocaleString()} deposit for ${deposit.customerName}`)
      return
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = {
      [`deposits/${depositId}/status`]: decision === 'approve' ? 'approved' : 'rejected',
      [`deposits/${depositId}/reviewedById`]: currentUser.id,
      [`deposits/${depositId}/reviewedByName`]: currentUser.name,
      [`deposits/${depositId}/reviewedAt`]: now,
      [`deposits/${depositId}/updatedAt`]: now,
    }

    const customer = data.customers[deposit.customerId]
    // The approved deposit lands on the dealer's sheet as a ledger entry.
    const entryId = decision === 'approve' && customer ? createId('credit_entry') : ''
    if (entryId && customer) {
      updates[`customers/${customer.id}/due`] = Math.max((customer.due ?? 0) - deposit.amount, 0)
      updates[`creditLedgerEntries/${entryId}`] = {
        id: entryId,
        customerId: customer.id,
        customerName: customer.name,
        date: deposit.date,
        particulars: [`Deposit (${deposit.method})`, deposit.note].filter(Boolean).join(' — '),
        qty: 0,
        unitPrice: 0,
        debit: 0,
        credit: deposit.amount,
        createdAt: now,
      }
    }

    await update(ref(db, 'erp'), updates)
    if (entryId) notifyTransaction('ledger_entry', entryId)
    await writeActivity(
      decision === 'approve' ? 'deposit_approved' : 'deposit_rejected',
      'customers',
      `${decision === 'approve' ? 'Approved' : 'Rejected'} the ${deposit.amount.toLocaleString()} deposit for ${deposit.customerName}.`
    )
    await writeAuditEntry({
      kind: 'deposit',
      refId: depositId,
      decision: decision === 'approve' ? 'approved' : 'rejected',
      party: deposit.customerName,
      summary: [deposit.method, deposit.note, deposit.authorizedByName && `Authorized by ${deposit.authorizedByName}`].filter(Boolean).join(' · '),
      amount: deposit.amount,
      submittedByName: deposit.submittedByName,
      submittedByRole: roleNameOf(deposit.submittedById),
      submittedAt: deposit.createdAt,
      edits: deposit.edits,
    })
  }

  async function submitComplaint(input: ComplaintInput) {
    if (!data || !currentUser) {
      return
    }

    const customer = data.customers[input.customerId]
    if (!customer) {
      throw new Error('Dealer not found.')
    }
    const product = data.products[input.productId]
    if (!product) {
      throw new Error('Product not found.')
    }
    if (!input.problem.trim()) {
      throw new Error('Describe the problem.')
    }
    if (!input.endCustomerName.trim() || !input.endCustomerPhone.trim()) {
      throw new Error('Enter the customer name and phone number.')
    }

    const db = getDatabaseOrThrow()
    const complaintId = createId('complaint')
    const now = new Date().toISOString()

    await update(ref(db, 'erp/complaints'), {
      [complaintId]: {
        id: complaintId,
        customerId: customer.id,
        customerName: customer.name,
        productId: product.id,
        productName: product.name,
        guaranteeDate: input.guaranteeDate.trim(),
        serialNumber: input.serialNumber.trim(),
        problem: input.problem.trim(),
        endCustomerName: input.endCustomerName.trim(),
        endCustomerPhone: input.endCustomerPhone.trim(),
        endCustomerAddress: input.endCustomerAddress.trim(),
        status: 'pending',
        submittedById: currentUser.id,
        submittedByName: currentUser.name,
        createdAt: now,
        updatedAt: now,
      },
    })

    await writeActivity('complaint_submitted', 'support', `Submitted a complaint for ${product.name} (${customer.name}).`)
    await writeNotification(
      'Complaint awaiting approval',
      `${currentUser.name} submitted a complaint for ${product.name} from ${customer.name}.`,
      'info',
      ['admin']
    )
  }

  async function reviewComplaint(complaintId: string, decision: 'approve' | 'reject') {
    if (!data || !currentUser) {
      return
    }
    if (!userRoleIds(currentUser).includes('admin')) {
      throw new Error('Only an admin can approve complaints.')
    }

    const complaint = data.complaints[complaintId]
    if (!complaint) {
      throw new Error('Complaint not found.')
    }
    if (complaint.status !== 'pending') {
      throw new Error('This complaint has already been reviewed.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    await update(ref(db, `erp/complaints/${complaintId}`), {
      status: decision === 'approve' ? 'approved' : 'rejected',
      reviewedById: currentUser.id,
      reviewedByName: currentUser.name,
      reviewedAt: now,
      updatedAt: now,
    })
    await writeActivity(
      decision === 'approve' ? 'complaint_approved' : 'complaint_rejected',
      'support',
      `${decision === 'approve' ? 'Approved' : 'Rejected'} the complaint for ${complaint.productName} (${complaint.customerName}).`
    )
  }

  async function submitReplacement(input: ReplacementInput) {
    if (!data || !currentUser) {
      return
    }

    const customer = data.customers[input.customerId]
    if (!customer) {
      throw new Error('Dealer not found.')
    }
    const product = data.products[input.productId]
    if (!product) {
      throw new Error('Product not found.')
    }
    if (!input.guaranteeDate) {
      throw new Error('Enter the guarantee date.')
    }
    if (!input.problem.trim()) {
      throw new Error('Describe the problem.')
    }
    const quantity = Math.floor(Number(input.quantity ?? 1))
    if (!(quantity >= 1)) {
      throw new Error('Quantity must be at least 1.')
    }

    const db = getDatabaseOrThrow()
    const replacementId = createId('replacement')
    const now = new Date().toISOString()

    await update(ref(db, 'erp/replacements'), {
      [replacementId]: {
        id: replacementId,
        customerId: customer.id,
        customerName: customer.name,
        productId: product.id,
        productName: product.name,
        guaranteeDate: input.guaranteeDate,
        serialNumber: input.serialNumber?.trim() ?? '',
        problem: input.problem.trim(),
        note: input.note?.trim() ?? '',
        quantity,
        courierName: input.courierName?.trim() ?? '',
        status: 'pending',
        submittedById: currentUser.id,
        submittedByName: currentUser.name,
        createdAt: now,
        updatedAt: now,
      },
    })

    await writeActivity('replacement_submitted', 'support', `Submitted a replacement request for ${product.name} (${customer.name}).`)
    await writeNotification(
      'Replacement awaiting approval',
      `${currentUser.name} submitted a replacement request for ${product.name} from ${customer.name}.`,
      'info',
      ['admin']
    )
  }

  async function reviewReplacement(replacementId: string, decision: 'approve' | 'reject') {
    if (!data || !currentUser) {
      return
    }
    if (!userRoleIds(currentUser).includes('admin')) {
      throw new Error('Only an admin can approve replacements.')
    }

    const replacement = data.replacements[replacementId]
    if (!replacement) {
      throw new Error('Replacement request not found.')
    }
    if (replacement.status !== 'pending') {
      throw new Error('This replacement request has already been reviewed.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    await update(ref(db, `erp/replacements/${replacementId}`), {
      status: decision === 'approve' ? 'approved' : 'rejected',
      reviewedById: currentUser.id,
      reviewedByName: currentUser.name,
      reviewedAt: now,
      updatedAt: now,
    })
    await writeActivity(
      decision === 'approve' ? 'replacement_approved' : 'replacement_rejected',
      'support',
      `${decision === 'approve' ? 'Approved' : 'Rejected'} the replacement for ${replacement.productName} (${replacement.customerName}).`
    )
  }

  async function submitReplacementReturn(input: ReplacementReturnInput) {
    if (!data || !currentUser) {
      return
    }

    const customer = data.customers[input.customerId]
    if (!customer) {
      throw new Error('Dealer not found.')
    }
    const product = data.products[input.productId]
    if (!product) {
      throw new Error('Product not found.')
    }
    if (!input.date) {
      throw new Error('Enter the return date.')
    }
    const quantity = Math.floor(Number(input.quantity ?? 1))
    if (!(quantity >= 1)) {
      throw new Error('Quantity must be at least 1.')
    }

    const db = getDatabaseOrThrow()
    const returnId = createId('replacement_return')
    const now = new Date().toISOString()

    await update(ref(db, 'erp/replacementReturns'), {
      [returnId]: {
        id: returnId,
        customerId: customer.id,
        customerName: customer.name,
        productId: product.id,
        productName: product.name,
        date: input.date,
        note: input.note?.trim() ?? '',
        quantity,
        courierName: input.courierName?.trim() ?? '',
        status: 'pending',
        submittedById: currentUser.id,
        submittedByName: currentUser.name,
        createdAt: now,
        updatedAt: now,
      },
    })

    await writeActivity('replacement_return_submitted', 'support', `Submitted a replacement return for ${product.name} (${customer.name}).`)
    await writeNotification(
      'Replacement return awaiting approval',
      `${currentUser.name} submitted a replacement return for ${product.name} from ${customer.name}.`,
      'info',
      ['admin']
    )
  }

  async function reviewReplacementReturn(returnId: string, decision: 'approve' | 'reject') {
    if (!data || !currentUser) {
      return
    }
    if (!userRoleIds(currentUser).includes('admin')) {
      throw new Error('Only an admin can approve replacement returns.')
    }

    const item = data.replacementReturns[returnId]
    if (!item) {
      throw new Error('Replacement return not found.')
    }
    if (item.status !== 'pending') {
      throw new Error('This replacement return has already been reviewed.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    await update(ref(db, `erp/replacementReturns/${returnId}`), {
      status: decision === 'approve' ? 'approved' : 'rejected',
      reviewedById: currentUser.id,
      reviewedByName: currentUser.name,
      reviewedAt: now,
      updatedAt: now,
    })
    await writeActivity(
      decision === 'approve' ? 'replacement_return_approved' : 'replacement_return_rejected',
      'support',
      `${decision === 'approve' ? 'Approved' : 'Rejected'} the replacement return for ${item.productName} (${item.customerName}).`
    )
  }

  function bankAccountLabel(accountId: string) {
    const account = data?.bankAccounts[accountId]
    return account ? `${account.bankName} — ${account.accountName} (${account.accountNumber})` : ''
  }

  async function saveBankAccount(input: BankAccountInput, accountId?: string) {
    if (!data || !currentUser) {
      return
    }
    if (!userRoleIds(currentUser).includes('admin')) {
      throw new Error('Only an admin can manage bank accounts.')
    }

    const bankName = input.bankName.trim()
    const accountName = input.accountName.trim()
    const accountNumber = input.accountNumber.trim()
    if (!bankName || !accountName || !accountNumber) {
      throw new Error('Bank name, account holder name, and account number are required.')
    }

    const existing = accountId ? data.bankAccounts[accountId] : null
    if (accountId && !existing) {
      throw new Error('Bank account not found.')
    }

    const db = getDatabaseOrThrow()
    const id = existing?.id ?? createId('bank')
    const now = new Date().toISOString()
    await update(ref(db, 'erp/bankAccounts'), {
      [id]: {
        id,
        side: input.side,
        bankName,
        accountName,
        accountNumber,
        branch: input.branch?.trim() ?? '',
        routingNumber: input.routingNumber?.trim() ?? '',
        supplierId: input.side === 'receiver' ? input.supplierId ?? '' : '',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      },
    })
    await writeActivity(
      existing ? 'bank_account_updated' : 'bank_account_created',
      'finance',
      `${existing ? 'Updated' : 'Added'} bank account ${bankName} (${accountNumber}).`
    )
  }

  async function deleteBankAccount(accountId: string) {
    if (!data || !currentUser) {
      return
    }
    if (!userRoleIds(currentUser).includes('admin')) {
      throw new Error('Only an admin can manage bank accounts.')
    }

    const account = data.bankAccounts[accountId]
    if (!account) {
      throw new Error('Bank account not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp/bankAccounts'), { [accountId]: null })
    await writeActivity('bank_account_deleted', 'finance', `Removed bank account ${account.bankName} (${account.accountNumber}).`)
  }

  async function submitSupplierPayment(input: SupplierPaymentInput) {
    if (!data || !currentUser) {
      return
    }

    const supplier = data.suppliers[input.supplierId]
    if (!supplier) {
      throw new Error('Supplier not found.')
    }
    if (!(input.amount > 0)) {
      throw new Error('Amount must be greater than zero.')
    }
    if (!input.purpose.trim()) {
      throw new Error('Enter the purpose of the payment.')
    }

    const isBank = input.method === 'bank'
    const fromAccountId = isBank ? input.fromAccountId ?? '' : ''
    const isCashDeposit = fromAccountId === 'cash'
    const toAccountId = isBank ? input.toAccountId ?? '' : ''
    if (isBank) {
      if (!isCashDeposit && !data.bankAccounts[fromAccountId]) {
        throw new Error('Select the bank the payment is sent from.')
      }
      if (!data.bankAccounts[toAccountId]) {
        throw new Error('Select the receiving bank.')
      }
      if (!input.sendingType?.trim()) {
        throw new Error('Select the sending type.')
      }
    } else if (!input.cashReceiver?.trim()) {
      throw new Error('Enter who received the cash.')
    }
    if ((!isBank || isCashDeposit) && !input.proofUrl) {
      throw new Error('Attach a deposit proof (voucher or slip).')
    }

    const db = getDatabaseOrThrow()
    const paymentId = createId('supplier_payment')
    const now = new Date().toISOString()

    await update(ref(db, 'erp/supplierPayments'), {
      [paymentId]: {
        id: paymentId,
        supplierId: supplier.id,
        supplierName: supplier.name,
        date: input.date?.trim() || now,
        method: input.method,
        fromAccountId,
        fromLabel: isCashDeposit ? 'Cash deposit' : bankAccountLabel(fromAccountId),
        toAccountId,
        toLabel: bankAccountLabel(toAccountId),
        sendingType: isBank ? input.sendingType?.trim() ?? '' : '',
        cashReceiver: isBank ? '' : input.cashReceiver?.trim() ?? '',
        proofUrl: input.proofUrl ?? '',
        proofPublicId: input.proofPublicId ?? '',
        amount: input.amount,
        purpose: input.purpose.trim(),
        note: input.note?.trim() ?? '',
        status: 'pending',
        submittedById: currentUser.id,
        submittedByName: currentUser.name,
        createdAt: now,
        updatedAt: now,
      },
    })

    await writeActivity('supplier_payment_submitted', 'suppliers', `Submitted a ${input.amount.toLocaleString()} payment to ${supplier.name}.`)
    await writeNotification(
      'Supplier payment awaiting approval',
      `${currentUser.name} submitted a ${input.amount.toLocaleString()} ${isBank ? 'bank' : 'cash'} payment to ${supplier.name}.`,
      'info',
      ['admin', 'accountant']
    )
  }

  async function reviewSupplierPayment(paymentId: string, decision: 'approve' | 'reject') {
    if (!data || !currentUser) {
      return
    }
    if (!userRoleIds(currentUser).includes('admin')) {
      throw new Error('Only an admin can approve supplier payments.')
    }

    const payment = data.supplierPayments[paymentId]
    if (!payment) {
      throw new Error('Payment not found.')
    }
    if (payment.status !== 'pending') {
      throw new Error('This payment has already been reviewed.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    await update(ref(db, `erp/supplierPayments/${paymentId}`), {
      status: decision === 'approve' ? 'approved' : 'rejected',
      reviewedById: currentUser.id,
      reviewedByName: currentUser.name,
      reviewedAt: now,
      updatedAt: now,
    })
    if (decision === 'approve') notifyTransaction('supplier_payment', paymentId)
    await writeActivity(
      decision === 'approve' ? 'supplier_payment_approved' : 'supplier_payment_rejected',
      'suppliers',
      `${decision === 'approve' ? 'Approved' : 'Rejected'} the ${payment.amount.toLocaleString()} payment to ${payment.supplierName}.`
    )
    await writeAuditEntry({
      kind: 'supplier_payment',
      refId: paymentId,
      decision: decision === 'approve' ? 'approved' : 'rejected',
      party: payment.supplierName,
      summary: [payment.method === 'bank' ? `Bank${payment.sendingType ? ` (${payment.sendingType})` : ''}` : 'Cash', payment.purpose].filter(Boolean).join(' · '),
      amount: payment.amount,
      submittedByName: payment.submittedByName,
      submittedByRole: roleNameOf(payment.submittedById),
      submittedAt: payment.createdAt,
      edits: payment.edits,
    })
  }

  function roleNameOf(userId: string) {
    const user = data?.users[userId]
    return user ? userRoleNames(data?.roles, user) : ''
  }

  function editSummaries(edits: SubmissionEdit[] | undefined) {
    return (edits ?? []).map((edit) => `Edited by ${edit.byName}${edit.byRole ? ` (${edit.byRole})` : ''}: ${edit.changes.map((change) => change.field).join(', ')}`)
  }

  /** Adds a reviewed submission to the Daily Audit, stamped with the reviewing admin. */
  async function writeAuditEntry(
    entry: Omit<AuditEntryRecord, 'id' | 'day' | 'reviewedByName' | 'reviewedByRole' | 'reviewedAt' | 'edits'> & { edits?: SubmissionEdit[] }
  ) {
    if (!currentUser) {
      return
    }

    const db = getDatabaseOrThrow()
    const id = createId('audit')
    const now = new Date()
    await update(ref(db, 'erp/auditLog'), {
      [id]: {
        ...entry,
        id,
        day: dayKey(now),
        reviewedByName: currentUser.name,
        reviewedByRole: roleNameOf(currentUser.id),
        reviewedAt: now.toISOString(),
        edits: editSummaries(entry.edits),
      },
    })
  }

  /** Files a change that waits for an admin, for users whose role needs approval. */
  async function requestChange(
    kind: ChangeRequestKind,
    action: ChangeRequestAction,
    targetId: string,
    targetName: string,
    input?: ChangeRequestRecord['input']
  ) {
    if (!currentUser) {
      throw new Error('You need to log in first.')
    }

    const db = getDatabaseOrThrow()
    const id = createId('change')
    const now = new Date().toISOString()
    const request: ChangeRequestRecord = {
      id,
      kind,
      action,
      targetId,
      targetName,
      // The database refuses undefined values, which optional form fields leave behind.
      ...(input ? { input: JSON.parse(JSON.stringify(input)) } : {}),
      status: 'pending',
      submittedById: currentUser.id,
      submittedByName: currentUser.name,
      createdAt: now,
      updatedAt: now,
    }

    const what = `${CHANGE_ACTION_LABELS[action]} ${CHANGE_KIND_LABELS[kind]}`
    await update(ref(db, 'erp/changeRequests'), { [id]: request })
    await writeActivity('change_requested', 'approvals', `Asked to ${what} ${targetName}.`)
    await writeNotification('Change awaiting approval', `${currentUser.name} asked to ${what} ${targetName}.`, 'info', ['admin'])
  }

  /** Approving applies the requested change as the admin; rejecting leaves everything as it was. */
  async function reviewChangeRequest(requestId: string, decision: 'approve' | 'reject') {
    const reviewer = requireAdminUser('approve changes')
    if (!data) {
      return
    }

    const request = data.changeRequests[requestId]
    if (!request) {
      throw new Error('Change request not found.')
    }
    if (request.status !== 'pending') {
      throw new Error('This change has already been reviewed.')
    }

    const what = `${CHANGE_ACTION_LABELS[request.action]} ${CHANGE_KIND_LABELS[request.kind]}`
    const input = request.input
    let amount = 0
    if (decision === 'approve') {
      const targets: Record<ChangeRequestKind, Record<string, unknown>> = {
        customer: data.customers,
        supplier: data.suppliers,
        credit_entry: data.creditLedgerEntries,
        expense: data.expenses,
      }
      if (request.action !== 'create' && !targets[request.kind][request.targetId]) {
        throw new Error(`This ${CHANGE_KIND_LABELS[request.kind]} no longer exists. Reject the change instead.`)
      }

      // These apply the change directly, because an admin's changes never wait for approval.
      if (request.kind === 'customer') {
        if (request.action === 'delete') await deleteCustomer(request.targetId)
        else await saveCustomer(input as CustomerInput, request.targetId || undefined)
      } else if (request.kind === 'supplier') {
        if (request.action === 'delete') await deleteSupplier(request.targetId)
        else await saveSupplier(input as SupplierInput, request.targetId || undefined)
      } else if (request.kind === 'credit_entry') {
        if (request.action === 'delete') {
          const entry = data.creditLedgerEntries[request.targetId]
          amount = Math.max(entry.debit, entry.credit)
          await deleteCreditLedgerEntry(request.targetId)
        } else {
          const entry = input as CreditLedgerEntryInput
          amount = Math.max(entry.debit ?? 0, entry.credit ?? 0)
          await recordCreditLedgerEntry(entry)
        }
      } else if (request.action === 'delete') {
        amount = data.expenses[request.targetId].amount
        await deleteExpense(request.targetId)
      } else {
        amount = (input as ExpenseInput).amount
        await saveExpense(input as ExpenseInput, request.targetId || undefined)
      }
    }

    const now = new Date().toISOString()
    await update(ref(getDatabaseOrThrow(), `erp/changeRequests/${requestId}`), {
      status: decision === 'approve' ? 'approved' : 'rejected',
      reviewedById: reviewer.id,
      reviewedByName: reviewer.name,
      reviewedAt: now,
      updatedAt: now,
    })
    await writeActivity(
      decision === 'approve' ? 'change_approved' : 'change_rejected',
      'approvals',
      `${decision === 'approve' ? 'Approved' : 'Rejected'} ${request.submittedByName}'s request to ${what} ${request.targetName}.`
    )
    await writeAuditEntry({
      kind: 'change',
      refId: requestId,
      decision: decision === 'approve' ? 'approved' : 'rejected',
      party: request.targetName,
      summary: `${what[0].toUpperCase()}${what.slice(1)}`,
      amount,
      submittedByName: request.submittedByName,
      submittedByRole: roleNameOf(request.submittedById),
      submittedAt: request.createdAt,
    })
  }

  function requireAdminUser(action: string) {
    if (!currentUser || !userRoleIds(currentUser).includes('admin')) {
      throw new Error(`Only an admin can ${action}.`)
    }
    return currentUser
  }

  /**
   * The stage a deposit or order-form order is at, once the signed-in user is allowed to act on
   * it there: the Authorizer of the dealer's zone first, then the Chairman (an admin can do either).
   */
  function requireApprovalStage(record: { status: string; authorizedAt?: string; customerId: string }, noun: string) {
    if (!data || !currentUser) {
      throw new Error('ERP data not loaded yet.')
    }
    const stage = approvalStage(record)
    if (!stage) {
      throw new Error(`This ${noun} has already been reviewed.`)
    }
    if (!canActAtStage(currentUser, stage)) {
      throw new Error(stage === 'authorizer' ? `This ${noun} is waiting for the Authorizer.` : `This ${noun} is waiting for the Chairman's final approval.`)
    }
    if (stage === 'authorizer' && !userRoleIds(currentUser).includes('admin')) {
      const zones = toArray(data.zones)
      const scope = accessScopeFor(currentUser, zones, effectiveRole(data.roles, currentUser), toArray(data.users), toArray(data.depots))
      const customer = data.customers[record.customerId]
      if (scope && (!customer || !customerInScope(customer, zones, scope))) {
        throw new Error(`This ${noun} is from a zone you do not authorize.`)
      }
    }
    return stage
  }

  /** The Authorizer accepts a deposit or order; it then waits for the Chairman. */
  async function recordAuthorization(section: 'deposits' | 'orderRequests' | 'ledgerEntryRequests', id: string, what: string) {
    if (!currentUser) return
    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    await update(ref(db, `erp/${section}/${id}`), {
      authorizedById: currentUser.id,
      authorizedByName: currentUser.name,
      authorizedAt: now,
      updatedAt: now,
    })
    await writeActivity(
      section === 'deposits' ? 'deposit_authorized' : section === 'ledgerEntryRequests' ? 'ledger_entry_authorized' : 'order_request_authorized',
      section === 'orderRequests' ? 'sales' : 'customers',
      `Authorized ${what}; sent to the Chairman for final approval.`
    )
    await writeNotification('Awaiting Chairman approval', `${currentUser.name} authorized ${what}.`, 'info', ['chairman', 'admin'])
  }

  /** Prices the lines of an order request and works out its due and credit-limit standing. */
  function priceOrderRequest(customer: CustomerRecord, items: OrderRequestEdit['items'], paidInput: number) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }
    if (!items.length) {
      throw new Error('Add at least one product.')
    }

    const orderItems = items.map((item) => {
      const product = data.products[item.productId]
      if (!product) throw new Error('Product not found.')
      if (!(item.quantity > 0)) throw new Error(`Quantity for ${product.name} must be greater than zero.`)
      if (item.unitPrice < 0) throw new Error(`Price for ${product.name} cannot be negative.`)
      return {
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        purchasePrice: product.purchasePrice,
      }
    })
    const total = orderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    const paid = Math.min(Math.max(paidInput, 0), total)
    const due = total - paid
    const creditLimit = customer.creditLimit ?? 0
    const overCreditLimit = creditLimit > 0 && (customer.due ?? 0) + due > creditLimit
    return { items: orderItems, total, paid, due, overCreditLimit }
  }

  async function submitOrderRequest(input: OrderInput) {
    if (!data || !currentUser) {
      return
    }

    const customer = data.customers[input.customerId]
    if (!customer) {
      throw new Error('Customer not found.')
    }
    const employee = input.employeeId ? data.employees[input.employeeId] : null
    if (input.employeeId && !employee) {
      throw new Error('Employee not found.')
    }

    const priced = priceOrderRequest(customer, input.items, input.paid)
    if (priced.overCreditLimit && data.settings.blockOverLimitOrders) {
      throw new Error(`This order takes ${customer.name} over their credit limit, and over-limit orders are blocked.`)
    }

    const db = getDatabaseOrThrow()
    const id = createId('order_request')
    const now = new Date().toISOString()
    await update(ref(db, 'erp/orderRequests'), {
      [id]: {
        id,
        customerId: customer.id,
        customerName: customer.name,
        employeeId: employee?.id ?? '',
        employeeName: employee?.name ?? '',
        ...priced,
        orderDate: input.orderDate?.trim() || now,
        deliveryDate: input.deliveryDate,
        courierName: input.courierName?.trim() ?? '',
        status: 'pending',
        zoneId: customerZoneId(customer, toArray(data.zones)),
        submittedById: currentUser.id,
        submittedByName: currentUser.name,
        submittedByRole: roleNameOf(currentUser.id),
        createdAt: now,
        updatedAt: now,
      },
    })

    await writeActivity('order_request_submitted', 'sales', `Submitted an order of ${priced.total.toLocaleString()} for ${customer.name} for approval.`)
    await writeNotification(
      priced.overCreditLimit ? 'Over-limit order awaiting the Authorizer' : 'Order awaiting the Authorizer',
      `${currentUser.name} submitted a ${priced.total.toLocaleString()} order for ${customer.name}${priced.overCreditLimit ? ' over their credit limit' : ''}.`,
      priced.overCreditLimit ? 'warning' : 'info',
      ['authorizer', 'admin']
    )
  }

  async function editOrderRequest(requestId: string, edit: OrderRequestEdit) {
    const editor = requireAdminUser('edit orders')
    const request = data?.orderRequests[requestId]
    if (!data || !request) {
      throw new Error('Order not found.')
    }
    if (request.status !== 'pending') {
      throw new Error('Only orders awaiting approval can be edited.')
    }
    const customer = data.customers[request.customerId]
    if (!customer) {
      throw new Error('Customer not found.')
    }

    const priced = priceOrderRequest(customer, edit.items, edit.paid)
    const changes: SubmissionEdit['changes'] = []
    const productIds = new Set([...request.items.map((item) => item.productId), ...priced.items.map((item) => item.productId)])
    productIds.forEach((productId) => {
      const before = request.items.find((item) => item.productId === productId)
      const after = priced.items.find((item) => item.productId === productId)
      const name = after?.productName ?? before?.productName ?? productId
      if (!before || !after) {
        changes.push({
          field: `${name}`,
          from: before ? `${before.quantity} × ${before.unitPrice}` : 'not in order',
          to: after ? `${after.quantity} × ${after.unitPrice}` : 'removed',
        })
        return
      }
      if (before.quantity !== after.quantity) changes.push({ field: `${name} quantity`, from: String(before.quantity), to: String(after.quantity) })
      if (before.unitPrice !== after.unitPrice) changes.push({ field: `${name} price`, from: String(before.unitPrice), to: String(after.unitPrice) })
    })
    if (request.paid !== priced.paid) changes.push({ field: 'Paid', from: String(request.paid), to: String(priced.paid) })
    if (request.deliveryDate.slice(0, 10) !== edit.deliveryDate.slice(0, 10)) {
      changes.push({ field: 'Delivery date', from: request.deliveryDate.slice(0, 10), to: edit.deliveryDate.slice(0, 10) })
    }
    if (request.courierName !== edit.courierName.trim()) changes.push({ field: 'Courier', from: request.courierName, to: edit.courierName.trim() })
    if (!changes.length) {
      throw new Error('Nothing was changed.')
    }

    const now = new Date().toISOString()
    const db = getDatabaseOrThrow()
    await update(ref(db, `erp/orderRequests/${requestId}`), {
      ...priced,
      deliveryDate: edit.deliveryDate,
      courierName: edit.courierName.trim(),
      edits: [...(request.edits ?? []), { byId: editor.id, byName: editor.name, byRole: roleNameOf(editor.id), at: now, changes }],
      updatedAt: now,
    })
    await writeActivity('order_request_edited', 'sales', `Edited the order for ${request.customerName}: ${changes.map((change) => change.field).join(', ')}.`)
  }

  async function reviewOrderRequest(requestId: string, decision: 'approve' | 'reject') {
    const request = data?.orderRequests[requestId]
    if (!request || !currentUser) {
      throw new Error('Order not found.')
    }
    const stage = requireApprovalStage(request, 'order')
    if (stage === 'authorizer' && decision === 'approve') {
      await recordAuthorization('orderRequests', requestId, `the ${request.total.toLocaleString()} order for ${request.customerName}`)
      return
    }
    const reviewer = currentUser

    // The order itself (stock, due, customer history, credit sheet) only exists once approved.
    const orderId =
      decision === 'approve'
        ? await createOrder(
            {
              customerId: request.customerId,
              employeeId: request.employeeId || undefined,
              items: request.items.map((item) => ({ productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice })),
              paid: request.paid,
              orderDate: request.orderDate,
              deliveryDate: request.deliveryDate,
              courierName: request.courierName,
            },
            { id: request.submittedById, name: request.submittedByName }
          )
        : undefined

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    await update(ref(db, `erp/orderRequests/${requestId}`), {
      status: decision === 'approve' ? 'approved' : 'rejected',
      reviewedById: reviewer.id,
      reviewedByName: reviewer.name,
      reviewedAt: now,
      orderId: orderId ?? '',
      updatedAt: now,
    })
    await writeAuditEntry({
      kind: 'order',
      refId: orderId || requestId,
      decision: decision === 'approve' ? 'approved' : 'rejected',
      party: request.customerName,
      summary: `${request.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ')}${request.courierName ? ` · ${request.courierName}` : ''}${request.authorizedByName ? ` · Authorized by ${request.authorizedByName}` : ''}`,
      amount: request.total,
      submittedByName: request.submittedByName,
      submittedByRole: request.submittedByRole,
      submittedAt: request.createdAt,
      edits: request.edits,
    })
    await writeActivity(
      decision === 'approve' ? 'order_request_approved' : 'order_request_rejected',
      'sales',
      `${decision === 'approve' ? 'Approved' : 'Rejected'} the ${request.total.toLocaleString()} order for ${request.customerName}.`
    )
  }

  /** The approved order behind a delivery; orders that never went through approval cannot be delivered here. */
  function approvedOrderFor(orderId: string) {
    const order = data?.orders[orderId]
    const request = toArray(data?.orderRequests).find((item) => item.orderId === orderId && item.status === 'approved')
    if (!order || !request) {
      throw new Error('Only approved orders can be delivered.')
    }
    return { order, request }
  }

  function resolveDeliveryParties(input: DeliveryPostInput, order: OrderRecord) {
    const warehouse = data?.warehouses[input.warehouseId]
    if (!warehouse) {
      throw new Error('Choose the warehouse the goods leave from.')
    }
    // A depot's dealers are delivered from their depot.
    const depotId = data?.customers[order.customerId]?.depotId
    const depot = depotId ? data?.depots[depotId] : null
    if (depot && data?.warehouses[depot.warehouseId] && warehouse.id !== depot.warehouseId) {
      throw new Error(`${order.customerName} is a dealer of ${depot.name} depot, so this order is delivered from ${data.warehouses[depot.warehouseId].name}.`)
    }
    const deliveryMan = data?.employees[input.deliveryManId]
    if (!deliveryMan) {
      throw new Error('Choose the delivery man.')
    }
    return { warehouse, deliveryMan }
  }

  async function postDelivery(orderId: string, input: DeliveryPostInput) {
    if (!currentUser) {
      return
    }
    const { order } = approvedOrderFor(orderId)
    if (order.delivery) {
      throw new Error('This order has already been posted for delivery.')
    }
    const { warehouse, deliveryMan } = resolveDeliveryParties(input, order)

    const now = new Date().toISOString()
    const delivery: OrderDelivery = {
      status: 'posted',
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      deliveryManId: deliveryMan.id,
      deliveryManName: deliveryMan.name,
      courierName: input.courierName.trim(),
      trackingNumber: '',
      vehicle: '',
      deliveryCharge: 0,
      note: '',
      documentUrl: '',
      documentPublicId: '',
      postedById: currentUser.id,
      postedByName: currentUser.name,
      postedAt: now,
      submittedById: '',
      submittedByName: '',
      submittedAt: '',
      updatedAt: now,
    }
    const db = getDatabaseOrThrow()
    await update(ref(db, `erp/orders/${orderId}`), {
      delivery,
      status: 'shipped',
      courierName: delivery.courierName || order.courierName || '',
    })
    await writeActivity(
      'delivery_posted',
      'sales',
      `Posted ${order.billNumber} for ${order.customerName} from ${warehouse.name} with ${deliveryMan.name}${delivery.courierName ? ` via ${delivery.courierName}` : ''}.`
    )
  }

  async function updateDeliveryDetails(orderId: string, input: DeliveryDetailsInput) {
    if (!currentUser) {
      return
    }
    const { order } = approvedOrderFor(orderId)
    if (!order.delivery) {
      throw new Error('Post this order for delivery first.')
    }
    if (order.delivery.status === 'submitted') {
      throw new Error('A submitted delivery can no longer be changed.')
    }
    if (!(input.deliveryCharge >= 0)) {
      throw new Error('Delivery charge cannot be negative.')
    }
    const { warehouse, deliveryMan } = resolveDeliveryParties(input, order)

    const db = getDatabaseOrThrow()
    const courierName = input.courierName.trim()
    await update(ref(db, `erp/orders/${orderId}`), {
      'delivery/warehouseId': warehouse.id,
      'delivery/warehouseName': warehouse.name,
      'delivery/deliveryManId': deliveryMan.id,
      'delivery/deliveryManName': deliveryMan.name,
      'delivery/courierName': courierName,
      'delivery/trackingNumber': input.trackingNumber.trim(),
      'delivery/vehicle': input.vehicle.trim(),
      'delivery/deliveryCharge': input.deliveryCharge,
      'delivery/note': input.note.trim(),
      'delivery/updatedAt': new Date().toISOString(),
      courierName: courierName || order.courierName || '',
    })
    await writeActivity('delivery_updated', 'sales', `Updated the delivery details of ${order.billNumber} (${order.customerName}).`)
  }

  async function submitDelivery(orderId: string, document: { url: string; publicId: string }) {
    if (!currentUser) {
      return
    }
    const { order, request } = approvedOrderFor(orderId)
    const delivery = order.delivery
    if (!delivery) {
      throw new Error('Post this order for delivery first.')
    }
    if (delivery.status === 'submitted') {
      throw new Error('This delivery has already been submitted.')
    }
    if (!document.url) {
      throw new Error('Add the delivery document before submitting.')
    }

    const now = new Date().toISOString()
    const db = getDatabaseOrThrow()
    // The document lives on the order, so the dealer's credit sheet shows it next to the bill.
    await update(ref(db, `erp/orders/${orderId}`), {
      'delivery/status': 'submitted',
      'delivery/documentUrl': document.url,
      'delivery/documentPublicId': document.publicId,
      'delivery/submittedById': currentUser.id,
      'delivery/submittedByName': currentUser.name,
      'delivery/submittedAt': now,
      'delivery/updatedAt': now,
      status: 'completed',
    })
    await writeAuditEntry({
      kind: 'delivery',
      refId: orderId,
      decision: 'approved',
      party: order.customerName,
      summary: [
        order.billNumber,
        `from ${delivery.warehouseName}`,
        `by ${delivery.deliveryManName}`,
        delivery.courierName && `via ${delivery.courierName}`,
        delivery.trackingNumber && `tracking ${delivery.trackingNumber}`,
      ]
        .filter(Boolean)
        .join(' · '),
      amount: order.total,
      submittedByName: delivery.postedByName,
      submittedByRole: roleNameOf(delivery.postedById),
      submittedAt: delivery.postedAt || request.reviewedAt || now,
    })
    await writeActivity('delivery_submitted', 'sales', `Submitted the delivery document for ${order.billNumber} (${order.customerName}).`)
  }

  /** Admin edits of a pending deposit, supplier payment or expense; every changed field is kept in its edit history. */
  async function editSubmission(kind: EditableSubmissionKind, id: string, patch: SubmissionPatch) {
    const editor = requireAdminUser('edit submissions')
    const record = data?.[kind][id] as (SubmissionPatch & { status?: string; edits?: SubmissionEdit[]; taType?: string }) | undefined
    if (!record) {
      throw new Error('Submission not found.')
    }
    if (record.status !== 'pending') {
      throw new Error('Only submissions awaiting approval can be edited.')
    }
    if (patch.amount !== undefined && !(patch.amount > 0)) {
      throw new Error('Amount must be greater than zero.')
    }
    if (patch.amount !== undefined && record.taType === 'actual' && patch.amount !== record.amount) {
      throw new Error('An actual TA amount is the sum of its trips and cannot be edited here.')
    }

    const changes: SubmissionEdit['changes'] = []
    const values: Record<string, string | number> = {}
    ;(Object.keys(patch) as Array<keyof SubmissionPatch>).forEach((field) => {
      const raw = patch[field]
      if (raw === undefined) return
      const next = typeof raw === 'string' ? raw.trim() : raw
      const before = record[field] ?? ''
      const same = field === 'date' ? String(before).slice(0, 10) === String(next).slice(0, 10) : before === next
      if (same) return
      values[field] = next
      changes.push({
        field: SUBMISSION_FIELD_LABELS[field],
        from: field === 'date' ? String(before).slice(0, 10) : String(before),
        to: field === 'date' ? String(next).slice(0, 10) : String(next),
      })
    })
    if (!changes.length) {
      throw new Error('Nothing was changed.')
    }

    const now = new Date().toISOString()
    const db = getDatabaseOrThrow()
    await update(ref(db, `erp/${kind}/${id}`), {
      ...values,
      edits: [...(record.edits ?? []), { byId: editor.id, byName: editor.name, byRole: roleNameOf(editor.id), at: now, changes }],
      ...(kind === 'expenses' ? {} : { updatedAt: now }),
    })
    await writeActivity('submission_edited', 'finance', `Edited a pending ${SUBMISSION_KIND_LABELS[kind]}: ${changes.map((change) => change.field).join(', ')}.`)
  }

  async function deleteCreditLedgerEntry(entryId: string) {
    if (!data) {
      return
    }

    const entry = data.creditLedgerEntries[entryId]
    if (!entry) {
      throw new Error('Ledger entry not found.')
    }

    if (needsApproval) {
      await requestChange('credit_entry', 'delete', entryId, entry.customerName)
      return
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`creditLedgerEntries/${entryId}`]: null })
    await writeActivity('credit_entry_deleted', 'customers', `Removed a credit sheet entry for ${entry.customerName}.`)
  }

  async function saveCourier(input: CourierInput, courierId?: string) {
    if (!data) {
      return
    }

    const customerName = input.customerName.trim()
    if (!customerName) {
      throw new Error('Customer name is required.')
    }

    const courierName = input.courierName.trim()
    if (!courierName) {
      throw new Error('Courier name is required.')
    }

    const db = getDatabaseOrThrow()
    const existingCourier = courierId ? data.couriers[courierId] : null
    const id = existingCourier?.id ?? createId('courier')
    const now = new Date().toISOString()
    const courier = {
      id,
      customerId: input.customerId ?? existingCourier?.customerId ?? '',
      customerName,
      billNumber: input.billNumber?.trim() || existingCourier?.billNumber || `SHP-${Date.now().toString().slice(-8)}`,
      courierName,
      productDescription: input.productDescription.trim(),
      quantity: Math.max(input.quantity ?? 0, 0),
      codAmount: Math.max(input.codAmount ?? 0, 0),
      sentDate: input.sentDate?.trim() || existingCourier?.sentDate || now,
      status: existingCourier?.status ?? 'in-transit',
      createdAt: existingCourier?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/couriers'), { [id]: courier })
    await writeActivity(
      existingCourier ? 'courier_updated' : 'courier_created',
      'courier',
      existingCourier
        ? `Updated courier shipment for ${courier.customerName}.`
        : `Sent ${courier.productDescription} to ${courier.customerName} via ${courier.courierName}.`
    )
  }

  async function updateCourierStatus(courierId: string, status: CourierRecord['status']) {
    if (!data) {
      return
    }

    const courier = data.couriers[courierId]
    if (!courier) {
      return
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, `erp/couriers/${courierId}`), { status, updatedAt: new Date().toISOString() })
    await writeActivity('courier_status_changed', 'courier', `Marked ${courier.customerName}'s shipment as ${status}.`)

    if (status === 'delivered' || status === 'cod-collected') {
      await writeNotification(
        'Courier update',
        `${courier.customerName}'s shipment (${courier.billNumber}) is now ${status.replace('-', ' ')}.`,
        'info',
        ['admin', 'sales_person', 'accountant']
      )
    }
  }

  async function deleteCourier(courierId: string) {
    if (!data) {
      return
    }

    const courier = data.couriers[courierId]
    if (!courier) {
      throw new Error('Courier record not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`couriers/${courierId}`]: null })
    await writeActivity('courier_deleted', 'courier', `Deleted courier shipment for ${courier.customerName}.`)
  }

  async function saveDamageProduct(input: DamageProductInput, damageProductId?: string) {
    if (!data) {
      return
    }

    const productName = input.productName.trim()
    if (!productName) {
      throw new Error('Product name is required.')
    }

    const zone = input.zone.trim()
    if (!zone) {
      throw new Error('Zone is required.')
    }

    const db = getDatabaseOrThrow()
    const existing = damageProductId ? data.damageProducts[damageProductId] : null
    const id = existing?.id ?? createId('dmg')
    const now = new Date().toISOString()
    const damageProduct = {
      id,
      productName,
      quantity: Math.max(input.quantity ?? 0, 0),
      zone,
      reportedDate: input.reportedDate?.trim() || existing?.reportedDate || now,
      sentDate: existing?.sentDate ?? '',
      receivedDate: existing?.receivedDate ?? '',
      reason: input.reason?.trim() || existing?.reason || '',
      notes: input.notes?.trim() || existing?.notes || '',
      status: existing?.status ?? 'pending',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/damageProducts'), { [id]: damageProduct })
    await writeActivity(
      existing ? 'damage_product_updated' : 'damage_product_reported',
      'damage_products',
      existing
        ? `Updated damage report for ${damageProduct.productName}.`
        : `Reported damage for ${damageProduct.quantity} x ${damageProduct.productName} in ${damageProduct.zone} zone.`
    )
  }

  async function updateDamageProductStatus(damageProductId: string, status: DamageProductRecord['status']) {
    if (!data) {
      return
    }

    const damageProduct = data.damageProducts[damageProductId]
    if (!damageProduct) {
      return
    }

    const now = new Date().toISOString()
    const dateFields: Partial<DamageProductRecord> = {}
    if (status === 'sent-to-office' && !damageProduct.sentDate) {
      dateFields.sentDate = now
    }
    if (status === 'received' && !damageProduct.receivedDate) {
      dateFields.receivedDate = now
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, `erp/damageProducts/${damageProductId}`), { status, updatedAt: now, ...dateFields })
    await writeActivity(
      'damage_product_status_changed',
      'damage_products',
      `Marked ${damageProduct.productName} (${damageProduct.zone}) as ${status.replace(/-/g, ' ')}.`
    )

    if (status === 'sent-to-office') {
      await writeNotification(
        'Damage product update',
        `${damageProduct.quantity} x ${damageProduct.productName} from ${damageProduct.zone} zone is on the way to the main office.`,
        'info',
        ['admin', 'store_manager']
      )
    }
  }

  async function deleteDamageProduct(damageProductId: string) {
    if (!data) {
      return
    }

    const damageProduct = data.damageProducts[damageProductId]
    if (!damageProduct) {
      throw new Error('Damage product record not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`damageProducts/${damageProductId}`]: null })
    await writeActivity('damage_product_deleted', 'damage_products', `Deleted damage report for ${damageProduct.productName}.`)
  }

  async function saveLead(input: LeadInput, leadId?: string) {
    if (!data) {
      return
    }

    const shopName = input.shopName.trim()
    if (!shopName) {
      throw new Error('Shop name is required.')
    }

    const phone = input.phone.trim()
    if (!phone) {
      throw new Error('Phone number is required.')
    }

    const db = getDatabaseOrThrow()
    const existing = leadId ? data.leads[leadId] : null
    const id = existing?.id ?? createId('lead')
    const now = new Date().toISOString()
    const lead = {
      id,
      shopName,
      ownerName: input.ownerName.trim(),
      businessType: input.businessType,
      address: input.address.trim(),
      phone,
      whatsapp: input.whatsapp?.trim() ?? '',
      bannerPhotoUrl: input.bannerPhotoUrl ?? '',
      bannerPhotoPublicId: input.bannerPhotoPublicId ?? '',
      visitingCardUrl: input.visitingCardUrl ?? '',
      visitingCardPublicId: input.visitingCardPublicId ?? '',
      reputation: input.reputation?.trim() ?? '',
      potential: input.potential,
      notes: input.notes?.trim() ?? '',
      zoneId: input.zoneId ?? '',
      createdById: existing?.createdById ?? currentUser?.id ?? '',
      createdByName: existing?.createdByName ?? currentUser?.name ?? '',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/leads'), { [id]: lead })
    await writeActivity(
      existing ? 'lead_updated' : 'lead_created',
      'leads',
      existing ? `Updated lead ${lead.shopName}.` : `Added lead ${lead.shopName} (${lead.potential} potential).`
    )
  }

  async function deleteLead(leadId: string) {
    if (!data) {
      return
    }

    const lead = data.leads[leadId]
    if (!lead) {
      throw new Error('Lead not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`leads/${leadId}`]: null })
    await writeActivity('lead_deleted', 'leads', `Deleted lead ${lead.shopName}.`)
  }

  async function saveEmployee(input: EmployeeInput, employeeId?: string, options?: { submitForApproval?: boolean }) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const name = input.name.trim()
    if (!name) {
      throw new Error('Employee name is required.')
    }

    const phone = input.phone.trim()
    if (!phone) {
      throw new Error('Employee phone number is required.')
    }

    const designation = input.designation.trim()
    if (!designation) {
      throw new Error('Designation is required.')
    }

    if (!input.joiningDate) {
      throw new Error('Joining date is required.')
    }

    const db = getDatabaseOrThrow()
    const existingEmployee = employeeId ? data.employees[employeeId] : null
    const id = existingEmployee?.id ?? createId('employee')
    const now = new Date().toISOString()
    const isAdmin = currentUser?.roleId === 'admin'
    // Only an admin sets pay. Anyone else submits the joining form and it waits for approval;
    // an admin's own new entry is approved as it is saved.
    const approvalStatus =
      existingEmployee?.approvalStatus ?? (isAdmin && !options?.submitForApproval ? 'approved' : 'pending')
    // A pending form gets its pay when an admin approves it.
    const canSetPay = isAdmin && approvalStatus === 'approved'
    const compensationType = input.compensationType ?? existingEmployee?.compensationType ?? 'salary'
    const salaryBased = compensationType === 'salary'
    const pay = (value: number | undefined, current: number | undefined) =>
      canSetPay ? Math.max(value ?? current ?? 0, 0) : current ?? 0
    const salaryPay = (value: number | undefined, current: number | undefined) => (salaryBased ? pay(value, current) : 0)

    const userId = input.userId !== undefined ? input.userId.trim() : existingEmployee?.userId ?? ''
    const linkedElsewhere = userId
      ? Object.values(data.employees).find((other) => other.id !== id && other.userId === userId)
      : null
    if (linkedElsewhere) {
      throw new Error(`That login is already linked to ${linkedElsewhere.name}.`)
    }

    const employee: EmployeeRecord = {
      id,
      employeeCode:
        existingEmployee?.employeeCode ||
        (approvalStatus === 'approved' ? nextEmployeeCode(Object.values(data.employees)) : ''),
      joiningLetterIssuedAt: existingEmployee?.joiningLetterIssuedAt ?? '',
      name,
      address: input.address?.trim() ?? existingEmployee?.address ?? '',
      phone,
      designation,
      joiningDate: input.joiningDate,
      zoneId: input.zoneId ?? existingEmployee?.zoneId ?? '',
      area: input.area?.trim() ?? existingEmployee?.area ?? '',
      fatherName: input.fatherName?.trim() ?? existingEmployee?.fatherName ?? '',
      motherName: input.motherName?.trim() ?? existingEmployee?.motherName ?? '',
      dateOfBirth: input.dateOfBirth ?? existingEmployee?.dateOfBirth ?? '',
      nid: input.nid?.trim() ?? existingEmployee?.nid ?? '',
      experience: input.experience?.trim() ?? existingEmployee?.experience ?? '',
      compensationType,
      approvalStatus,
      submittedBy: existingEmployee?.submittedBy || currentUser?.id || '',
      approvedBy: existingEmployee?.approvedBy || (approvalStatus === 'approved' && isAdmin ? currentUser?.id ?? '' : ''),
      approvedAt: existingEmployee?.approvedAt || (approvalStatus === 'approved' ? now : ''),
      probationMonths: Math.max(
        input.probationMonths ?? existingEmployee?.probationMonths ?? DEFAULT_PROBATION_MONTHS,
        0
      ),
      employmentStatus: input.employmentStatus ?? existingEmployee?.employmentStatus ?? 'active',
      baseSalary: salaryPay(input.baseSalary, existingEmployee?.baseSalary),
      taDa: salaryPay(input.taDa, existingEmployee?.taDa),
      // DA follows attendance, so commission-based staff can earn it too.
      daPerDay: pay(input.daPerDay, existingEmployee?.daPerDay),
      houseRent: salaryPay(input.houseRent, existingEmployee?.houseRent),
      mobileBill: salaryPay(input.mobileBill, existingEmployee?.mobileBill),
      monthlyUnitTarget: Math.max(
        input.monthlyUnitTarget ?? existingEmployee?.monthlyUnitTarget ?? DEFAULT_MONTHLY_UNIT_TARGET,
        0
      ),
      monthlyAmountTarget: Math.max(
        input.monthlyAmountTarget ?? existingEmployee?.monthlyAmountTarget ?? DEFAULT_MONTHLY_AMOUNT_TARGET,
        0
      ),
      commissionPerUnit: canSetPay
        ? Math.max(input.commissionPerUnit ?? existingEmployee?.commissionPerUnit ?? DEFAULT_COMMISSION_PER_UNIT, 0)
        : existingEmployee?.commissionPerUnit ?? 0,
      userId,
      notes: input.notes?.trim() ?? existingEmployee?.notes ?? '',
      createdAt: existingEmployee?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/employees'), { [id]: employee })
    await writeActivity(
      existingEmployee ? 'employee_updated' : approvalStatus === 'pending' ? 'employee_submitted' : 'employee_created',
      'employees',
      existingEmployee
        ? `Updated ${employee.name}'s employee profile.`
        : approvalStatus === 'pending'
          ? `Submitted a joining form for ${employee.name} (${employee.designation}) for approval.`
          : `Added employee ${employee.name} (${employee.designation}).`
    )

    if (!existingEmployee) {
      await writeNotification(
        approvalStatus === 'pending' ? 'Joining form awaiting approval' : 'New employee added',
        approvalStatus === 'pending'
          ? `${currentUser?.name ?? 'A user'} submitted ${employee.name}'s joining form as ${employee.designation}. Set the pay and approve it.`
          : `${employee.name} joined as ${employee.designation}. Probation ends after ${employee.probationMonths} month(s).`,
        approvalStatus === 'pending' ? 'warning' : 'info',
        ['admin']
      )
    }

    return id
  }

  /** An admin sets the pay on a pending joining form and approves it, or rejects it. */
  async function reviewEmployee(employeeId: string, decision: 'approve' | 'reject', input?: EmployeeApprovalInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before reviewing joining forms.')
    }

    if (currentUser.roleId !== 'admin') {
      throw new Error('Only an admin can approve or reject joining forms.')
    }

    const employee = data.employees[employeeId]
    if (!employee) {
      throw new Error('Employee not found.')
    }

    const now = new Date().toISOString()
    let next: EmployeeRecord

    if (decision === 'reject') {
      next = { ...employee, approvalStatus: 'rejected', approvedBy: currentUser.id, approvedAt: now, updatedAt: now }
    } else {
      if (!input) {
        throw new Error('Set the pay before approving.')
      }

      const salaryBased = input.compensationType === 'salary'
      const amount = (value?: number) => (salaryBased ? Math.max(value ?? 0, 0) : 0)
      const commissionPerUnit = Math.max(input.commissionPerUnit ?? 0, 0)

      if (salaryBased && amount(input.baseSalary) <= 0) {
        throw new Error('Enter a salary greater than zero for a salary-based employee.')
      }

      if (!salaryBased && commissionPerUnit <= 0) {
        throw new Error('Enter the commission for a commission-based employee.')
      }

      next = {
        ...employee,
        employeeCode: employee.employeeCode || nextEmployeeCode(Object.values(data.employees)),
        joiningLetterIssuedAt: employee.joiningLetterIssuedAt || now,
        compensationType: input.compensationType,
        baseSalary: amount(input.baseSalary),
        taDa: amount(input.taDa),
        daPerDay: Math.max(input.daPerDay ?? 0, 0),
        houseRent: amount(input.houseRent),
        mobileBill: amount(input.mobileBill),
        commissionPerUnit,
        monthlyUnitTarget: Math.max(input.monthlyUnitTarget ?? employee.monthlyUnitTarget, 0),
        monthlyAmountTarget: Math.max(input.monthlyAmountTarget ?? employee.monthlyAmountTarget, 0),
        notes: input.notes?.trim() ?? employee.notes,
        approvalStatus: 'approved',
        approvedBy: currentUser.id,
        approvedAt: now,
        updatedAt: now,
      }
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp/employees'), { [employeeId]: next })
    await writeActivity(
      decision === 'approve' ? 'employee_approved' : 'employee_rejected',
      'employees',
      decision === 'approve'
        ? `Approved ${employee.name}'s joining form as ${next.employeeCode} and issued the joining letter.`
        : `Rejected ${employee.name}'s joining form.`
    )
    const submitter = data.users[employee.submittedBy]
    await writeAuditEntry({
      kind: 'employee',
      refId: employeeId,
      decision: decision === 'approve' ? 'approved' : 'rejected',
      party: employee.name,
      summary: [
        next.employeeCode,
        employee.designation,
        decision === 'approve'
          ? next.compensationType === 'salary'
            ? `Salary ${next.baseSalary.toLocaleString()} + allowances ${(next.taDa + next.houseRent + next.mobileBill).toLocaleString()}`
            : `Commission ${next.commissionPerUnit.toLocaleString()} per unit`
          : '',
      ]
        .filter(Boolean)
        .join(' · '),
      amount: decision === 'approve' ? next.baseSalary + next.taDa + next.houseRent + next.mobileBill : 0,
      submittedByName: submitter?.name ?? employee.submittedBy ?? '',
      submittedByRole: submitter ? roleNameOf(submitter.id) : '',
      submittedAt: employee.createdAt,
    })

    return next
  }

  async function issueJoiningLetter(employeeId: string) {
    if (!data || !currentUser) {
      throw new Error('You need to log in first.')
    }

    const employee = data.employees[employeeId]
    if (!employee) {
      throw new Error('Employee not found.')
    }

    if (employee.approvalStatus !== 'approved') {
      throw new Error('The joining letter is issued once the joining form is approved.')
    }

    if (employee.employeeCode && employee.joiningLetterIssuedAt) {
      return employee
    }

    const next: EmployeeRecord = {
      ...employee,
      employeeCode: employee.employeeCode || nextEmployeeCode(Object.values(data.employees)),
      joiningLetterIssuedAt: employee.joiningLetterIssuedAt || new Date().toISOString(),
    }
    const db = getDatabaseOrThrow()
    await update(ref(db, `erp/employees/${employeeId}`), {
      employeeCode: next.employeeCode,
      joiningLetterIssuedAt: next.joiningLetterIssuedAt,
    })
    await writeActivity('joining_letter_issued', 'employees', `Issued ${employee.name}'s joining letter (${next.employeeCode}).`)
    return next
  }

  async function deleteEmployee(employeeId: string) {
    if (!data) {
      return
    }

    const employee = data.employees[employeeId]
    if (!employee) {
      throw new Error('Employee not found.')
    }

    const hasTargets = Object.values(data.salesTargets).some((target) => target.employeeId === employeeId)
    const hasSalaries = Object.values(data.salaries).some((salary) => salary.employeeId === employeeId)
    if (hasTargets || hasSalaries) {
      throw new Error('Employees with sales or salary history cannot be deleted.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`employees/${employeeId}`]: null })
    await writeActivity('employee_deleted', 'employees', `Removed employee ${employee.name}.`)
  }

  /**
   * The month's salary record rebuilt from the live figures, with `changes` laid over the loaded
   * data (`null` removes a record) and `payment` added to its payments.
   */
  function salarySnapshot(
    employee: EmployeeRecord,
    month: string,
    changes: {
      salesTargets?: Record<string, SalesTargetRecord>
      employeeAdvances?: Record<string, EmployeeAdvanceRecord | null>
      commissionAuthorizations?: Record<string, CommissionAuthorizationRecord>
    } = {},
    payment?: SalaryPaymentEntry
  ): SalaryRecord {
    const source = data!
    const withChanges = <T,>(records: Record<string, T>, overrides: Record<string, T | null> = {}) =>
      Object.fromEntries(
        Object.entries({ ...records, ...overrides }).filter((entry): entry is [string, T] => entry[1] !== null)
      )
    const pay = computeMonthlyPay(
      {
        salesTargets: withChanges(source.salesTargets, changes.salesTargets),
        salaries: source.salaries,
        employeeAdvances: withChanges(source.employeeAdvances, changes.employeeAdvances),
        commissionAuthorizations: withChanges(source.commissionAuthorizations, changes.commissionAuthorizations),
      },
      employee,
      month
    )
    const existing = pay.salary
    const now = new Date().toISOString()
    const paidAmount = (existing?.paidAmount ?? 0) + (payment?.amount ?? 0)
    const dueAmount = Math.max(pay.netPayable - paidAmount, 0)

    return {
      id: existing?.id ?? createId('salary'),
      employeeId: employee.id,
      employeeName: employee.name,
      month,
      baseSalary: employee.baseSalary,
      commissionPerUnit: employee.commissionPerUnit,
      unitsSold: pay.unitsSold,
      commissionAmount: pay.commissionAmount,
      commissionEarned: pay.commissionEarned,
      amountCollected: pay.amountCollected,
      achievementPercent: pay.achievementPercent,
      holdStatus: pay.holdStatus,
      ownerAuthorized: pay.ownerAuthorized,
      advanceAmount: pay.advanceAmount,
      grossPayable: pay.grossPayable,
      paidAmount,
      dueAmount,
      paymentStatus: dueAmount <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
      payments: payment ? [...(existing?.payments ?? []), payment] : existing?.payments ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
  }

  /** Adds to the month's sales and collection totals, then re-syncs that month's salary record. */
  async function recordSale(input: RecordSaleInput) {
    if (!data || !currentUser) {
      return
    }

    const employee = data.employees[input.employeeId]
    if (!employee) {
      throw new Error('Employee not found.')
    }

    if (employee.approvalStatus !== 'approved') {
      throw new Error(`${employee.name}'s joining form has not been approved yet.`)
    }

    const units = Math.max(input.units ?? 0, 0)
    const amount = Math.max(input.amount ?? 0, 0)
    const collected = Math.max(input.collected ?? 0, 0)
    if (units <= 0 && amount <= 0 && collected <= 0) {
      throw new Error('Enter units sold, a sales amount, or the due money collected.')
    }

    const db = getDatabaseOrThrow()
    const month = input.month?.trim() || currentMonthKey()
    const existingTarget = Object.values(data.salesTargets).find(
      (target) => target.employeeId === input.employeeId && target.month === month
    )
    const now = new Date().toISOString()

    const target: SalesTargetRecord = {
      id: existingTarget?.id ?? createId('target'),
      employeeId: employee.id,
      employeeName: employee.name,
      month,
      unitTarget: existingTarget?.unitTarget ?? employee.monthlyUnitTarget,
      amountTarget: existingTarget?.amountTarget ?? employee.monthlyAmountTarget,
      commissionPerUnit: existingTarget?.commissionPerUnit ?? employee.commissionPerUnit,
      unitsSold: Math.max(existingTarget?.unitsSold ?? 0, 0) + units,
      amountSold: Math.max(existingTarget?.amountSold ?? 0, 0) + amount,
      amountCollected: Math.max(existingTarget?.amountCollected ?? 0, 0) + collected,
      createdAt: existingTarget?.createdAt ?? now,
      updatedAt: now,
    }

    const previousAchievement = existingTarget ? getTargetAchievement(existingTarget).achievementPercent : 0
    const nextAchievement = getTargetAchievement(target)
    const salary = salarySnapshot(employee, month, { salesTargets: { [target.id]: target } })

    await update(ref(db, 'erp'), {
      [`salesTargets/${target.id}`]: target,
      [`salaries/${salary.id}`]: salary,
    })

    await writeActivity(
      'sale_recorded',
      'sales_target',
      `Recorded ${units} unit(s) / ${amount} BDT sales and ${collected} BDT collected for ${employee.name} (${month}).`
    )

    if (nextAchievement.achievementPercent >= 80 && previousAchievement < 80) {
      await writeNotification(
        'Target achieved',
        `${employee.name} crossed 80% of the ${month} target — commission is now payable.`,
        'info',
        ['admin', 'accountant']
      )
    }
  }

  /** Adds a payment to the month's salary record, creating it from the live figures on the first payment. */
  async function saveSalaryPayment(input: SalaryPaymentInput) {
    if (!data || !currentUser) {
      return
    }

    const employee = data.employees[input.employeeId]
    if (!employee) {
      throw new Error('Employee not found.')
    }

    if (input.amount <= 0) {
      throw new Error('Payment amount must be greater than zero.')
    }

    const db = getDatabaseOrThrow()
    const month = input.month.trim() || currentMonthKey()
    const now = new Date().toISOString()

    const kind = input.kind ?? 'salary'
    const pay = computeMonthlyPay(data, employee, month)
    const due = kind === 'commission' ? pay.commissionDue : pay.salaryDue
    if (input.amount > due) {
      throw new Error(`Only ${due.toLocaleString()} BDT of ${employee.name}'s ${kind} for ${month} is left to pay.`)
    }
    // Commission is paid on the 16th–20th of the next month; only an admin can pay it at another time.
    if (kind === 'commission' && !inCommissionWindow(month, dayKey()) && !userRoleIds(currentUser).includes('admin')) {
      throw new Error(`Commission for ${month} is paid from ${pay.schedule.commissionFrom} to ${pay.schedule.commissionTo}. Ask an admin to pay it at another time.`)
    }

    const paymentEntry: SalaryPaymentEntry = {
      id: createId('salary_payment'),
      kind,
      amount: input.amount,
      method: input.method?.trim() || 'cash',
      note: input.note?.trim() ?? '',
      paidBy: currentUser.name,
      paidAt: now,
    }
    const salary = salarySnapshot(employee, month, {}, paymentEntry)

    await update(ref(db, 'erp'), { [`salaries/${salary.id}`]: salary })
    await writeActivity('salary_paid', 'salary', `Paid ${input.amount} BDT ${kind} to ${employee.name} for ${month}.`)
    await writeNotification(
      'Salary payment recorded',
      `${employee.name} was paid ${input.amount} BDT for ${month} by ${currentUser?.name ?? 'Admin'}.`,
      'info',
      ['admin', 'accountant']
    )
  }

  /** Records money an employee took before the month was over; it comes off that month's pay. */
  async function saveEmployeeAdvance(input: EmployeeAdvanceInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in first.')
    }

    if (!currentPermissions.includes('salary.edit')) {
      throw new Error('You do not have permission to record advances.')
    }

    const employee = data.employees[input.employeeId]
    if (!employee) {
      throw new Error('Employee not found.')
    }

    if (employee.approvalStatus !== 'approved') {
      throw new Error(`${employee.name}'s joining form has not been approved yet.`)
    }

    const amount = Number(input.amount)
    if (!(amount > 0)) {
      throw new Error('Advance amount must be greater than zero.')
    }

    if (!input.date) {
      throw new Error('Enter the date the advance was given.')
    }

    const now = new Date().toISOString()
    const advance: EmployeeAdvanceRecord = {
      id: createId('advance'),
      employeeId: employee.id,
      employeeName: employee.name,
      month: input.date.slice(0, 7),
      date: input.date,
      amount,
      method: input.method?.trim() || 'cash',
      note: input.note?.trim() ?? '',
      givenById: currentUser.id,
      givenByName: currentUser.name,
      createdAt: now,
    }
    const salary = salarySnapshot(employee, advance.month, { employeeAdvances: { [advance.id]: advance } })

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`employeeAdvances/${advance.id}`]: advance,
      [`salaries/${salary.id}`]: salary,
    })
    await writeActivity('advance_given', 'salary', `Gave ${employee.name} an advance of ${amount} BDT (${advance.month}).`)
  }

  async function deleteEmployeeAdvance(advanceId: string) {
    if (!data || !currentUser) {
      throw new Error('You need to log in first.')
    }

    if (!currentPermissions.includes('salary.edit')) {
      throw new Error('You do not have permission to remove advances.')
    }

    const advance = data.employeeAdvances[advanceId]
    if (!advance) {
      throw new Error('Advance not found.')
    }

    const employee = data.employees[advance.employeeId]
    const updates: Record<string, unknown> = { [`employeeAdvances/${advanceId}`]: null }
    if (employee) {
      const salary = salarySnapshot(employee, advance.month, { employeeAdvances: { [advanceId]: null } })
      updates[`salaries/${salary.id}`] = salary
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), updates)
    await writeActivity('advance_removed', 'salary', `Removed ${advance.employeeName}'s ${advance.amount} BDT advance (${advance.month}).`)
  }

  async function saveBatteryReport(input: BatteryReportInput, reportId?: string) {
    if (!data || !currentUser) {
      throw new Error('You need to log in first.')
    }
    if (!currentPermissions.includes('customers.edit')) {
      throw new Error('You do not have permission to write battery reports.')
    }

    const existing = reportId ? data.batteryReports[reportId] : undefined
    if (reportId && !existing) {
      throw new Error('Battery report not found.')
    }
    const customer = data.customers[input.customerId]
    if (!customer) {
      throw new Error('Select the dealer the battery came from.')
    }
    const product = data.products[input.productId]
    if (!product) {
      throw new Error('Select the battery model.')
    }
    if (!input.checkDate) {
      throw new Error('Enter the date of the check.')
    }

    const number = (value: number) => (Number.isFinite(Number(value)) ? Math.max(Number(value), 0) : 0)
    const now = new Date().toISOString()
    const highest = Object.values(data.batteryReports).reduce((max, report) => {
      const match = report.reportNo?.match(/(\d+)$/)
      return match ? Math.max(max, Number(match[1])) : max
    }, 0)
    const id = existing?.id ?? createId('battery_report')
    const report: BatteryReportRecord = {
      id,
      reportNo: existing?.reportNo ?? `BCR-${String(highest + 1).padStart(4, '0')}`,
      checkDate: input.checkDate,
      customerId: customer.id,
      customerName: customer.name,
      endCustomerName: input.endCustomerName.trim(),
      endCustomerPhone: input.endCustomerPhone.trim(),
      productId: product.id,
      productName: product.name,
      serialNumber: input.serialNumber.trim(),
      saleDate: input.saleDate,
      warrantyMonths: product.warrantyMonths ?? 0,
      ...(input.complaintId ? { complaintId: input.complaintId } : {}),
      ...(input.replacementId ? { replacementId: input.replacementId } : {}),
      ratedVoltage: number(input.ratedVoltage),
      ratedCapacityAh: number(input.ratedCapacityAh),
      openCircuitVoltage: number(input.openCircuitVoltage),
      loadVoltage: number(input.loadVoltage),
      measuredCca: number(input.measuredCca),
      ratedCca: number(input.ratedCca),
      internalResistance: number(input.internalResistance),
      specificGravity: input.specificGravity.trim(),
      afterChargeVoltage: number(input.afterChargeVoltage),
      condition: input.condition.length ? Array.from(new Set(input.condition)) : ['good'],
      fault: input.fault,
      verdict: input.verdict,
      remarks: input.remarks.trim(),
      checkedById: existing?.checkedById ?? currentUser.id,
      checkedByName: existing?.checkedByName ?? currentUser.name,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(getDatabaseOrThrow(), 'erp/batteryReports'), { [id]: report })
    await writeActivity(
      existing ? 'battery_report_updated' : 'battery_report_created',
      'support',
      `${existing ? 'Updated' : 'Wrote'} battery check report ${report.reportNo} for ${product.name} (${customer.name}).`
    )
    return id
  }

  async function deleteBatteryReport(reportId: string) {
    requireAdminUser('delete battery reports')
    const report = data?.batteryReports[reportId]
    if (!report) {
      throw new Error('Battery report not found.')
    }
    await update(ref(getDatabaseOrThrow(), 'erp/batteryReports'), { [reportId]: null })
    await writeActivity('battery_report_deleted', 'support', `Deleted battery check report ${report.reportNo}.`)
  }

  async function saveBusiness(input: BusinessInput, businessId?: string) {
    requireAdminUser('set up sub businesses')
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }
    const name = input.name.trim()
    if (!name) {
      throw new Error('Enter the business name.')
    }
    const existing = businessId ? data.businesses[businessId] : undefined
    const duplicate = Object.values(data.businesses).find((item) => item.id !== existing?.id && item.name.trim().toLowerCase() === name.toLowerCase())
    if (duplicate) {
      throw new Error(`A business named ${duplicate.name} already exists.`)
    }

    const now = new Date().toISOString()
    const id = existing?.id ?? createId('business')
    const business: BusinessRecord = {
      id,
      name,
      description: input.description?.trim() ?? existing?.description ?? '',
      openingCash: Math.max(Number(input.openingCash ?? existing?.openingCash ?? 0) || 0, 0),
      openingStockValue: Math.max(Number(input.openingStockValue ?? existing?.openingStockValue ?? 0) || 0, 0),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await update(ref(getDatabaseOrThrow(), 'erp/businesses'), { [id]: business })
    await writeActivity(existing ? 'business_updated' : 'business_created', 'finance', `${existing ? 'Updated' : 'Started'} sub business ${name}.`)
    return id
  }

  async function deleteBusiness(businessId: string) {
    requireAdminUser('remove sub businesses')
    const business = data?.businesses[businessId]
    if (!data || !business) {
      throw new Error('Business not found.')
    }
    if (Object.values(data.businessEntries).some((entry) => entry.businessId === businessId)) {
      throw new Error(`${business.name} has entries in its books and cannot be removed.`)
    }
    await update(ref(getDatabaseOrThrow(), 'erp/businesses'), { [businessId]: null })
    await writeActivity('business_deleted', 'finance', `Removed sub business ${business.name}.`)
  }

  function businessEntryAudit(entry: BusinessEntryRecord, decision: 'approved' | 'rejected') {
    return writeAuditEntry({
      kind: 'business',
      refId: entry.id,
      decision,
      party: entry.businessName,
      summary: [BUSINESS_ENTRY_LABELS[entry.kind], entry.party, entry.particulars].filter(Boolean).join(' · '),
      amount: entry.amount,
      submittedByName: entry.submittedByName,
      submittedByRole: roleNameOf(entry.submittedById),
      submittedAt: entry.createdAt,
    })
  }

  async function submitBusinessEntry(input: BusinessEntryInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in first.')
    }
    if (!currentPermissions.includes('finance.view')) {
      throw new Error('You do not have permission to add sub business entries.')
    }
    const business = data.businesses[input.businessId]
    if (!business) {
      throw new Error('Select the business.')
    }
    if (!input.date) {
      throw new Error('Enter the date.')
    }
    const particulars = input.particulars.trim()
    if (!particulars) {
      throw new Error('Describe the entry.')
    }

    const amount = Number(input.amount) || 0
    const stockValue = Math.max(Number(input.stockValue) || 0, 0)
    if (input.kind === 'stock_adjustment') {
      if (amount === 0) throw new Error('Enter the change in stock value.')
    } else if (input.kind === 'stock_purchase' || input.kind === 'sale') {
      if (amount < 0) throw new Error('Amount cannot be negative.')
      if (amount === 0 && stockValue === 0) throw new Error('Enter the amount and the stock value.')
    } else if (!(amount > 0)) {
      throw new Error('Amount must be greater than zero.')
    }

    const isAdmin = userRoleIds(currentUser).includes('admin')
    const now = new Date().toISOString()
    const entry: BusinessEntryRecord = {
      id: createId('business_entry'),
      businessId: business.id,
      businessName: business.name,
      kind: input.kind,
      date: input.date,
      amount,
      stockValue: input.kind === 'stock_purchase' || input.kind === 'sale' ? stockValue : 0,
      party: input.party?.trim() ?? '',
      particulars,
      status: isAdmin ? 'approved' : 'pending',
      submittedById: currentUser.id,
      submittedByName: currentUser.name,
      ...(isAdmin ? { reviewedById: currentUser.id, reviewedByName: currentUser.name, reviewedAt: now } : {}),
      createdAt: now,
      updatedAt: now,
    }

    await update(ref(getDatabaseOrThrow(), 'erp/businessEntries'), { [entry.id]: entry })
    await writeActivity('business_entry_submitted', 'finance', `${BUSINESS_ENTRY_LABELS[entry.kind]} of ${amount} for ${business.name}: ${particulars}.`)
    if (isAdmin) {
      await businessEntryAudit(entry, 'approved')
    } else {
      await writeNotification('Sub business entry awaiting approval', `${currentUser.name} added a ${BUSINESS_ENTRY_LABELS[entry.kind].toLowerCase()} to ${business.name}.`, 'info', ['admin'])
    }
  }

  async function reviewBusinessEntry(entryId: string, decision: 'approve' | 'reject') {
    const reviewer = requireAdminUser('approve sub business entries')
    const entry = data?.businessEntries[entryId]
    if (!entry) {
      throw new Error('Entry not found.')
    }
    if (entry.status !== 'pending') {
      throw new Error('This entry has already been reviewed.')
    }
    const now = new Date().toISOString()
    const next: BusinessEntryRecord = {
      ...entry,
      status: decision === 'approve' ? 'approved' : 'rejected',
      reviewedById: reviewer.id,
      reviewedByName: reviewer.name,
      reviewedAt: now,
      updatedAt: now,
    }
    await update(ref(getDatabaseOrThrow(), 'erp/businessEntries'), { [entryId]: next })
    await businessEntryAudit(next, decision === 'approve' ? 'approved' : 'rejected')
  }

  async function deleteBusinessEntry(entryId: string) {
    requireAdminUser('delete sub business entries')
    const entry = data?.businessEntries[entryId]
    if (!entry) {
      throw new Error('Entry not found.')
    }
    await update(ref(getDatabaseOrThrow(), 'erp/businessEntries'), { [entryId]: null })
    await writeActivity('business_entry_deleted', 'finance', `Deleted a ${BUSINESS_ENTRY_LABELS[entry.kind].toLowerCase()} of ${entry.amount} from ${entry.businessName}.`)
  }

  /** An employee asks for money ahead of payday in an emergency; the office decides the amount. */
  async function requestAdvance(input: AdvanceRequestInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in first.')
    }

    const employee = data.employees[input.employeeId]
    if (!employee) {
      throw new Error('Employee not found.')
    }
    if (employee.userId !== currentUser.id && !currentPermissions.includes('salary.edit')) {
      throw new Error('You can only request an advance for yourself.')
    }
    if (employee.approvalStatus !== 'approved') {
      throw new Error(`${employee.name}'s joining form has not been approved yet.`)
    }

    const amount = Number(input.amount)
    if (!(amount > 0)) {
      throw new Error('Enter the amount needed.')
    }
    const reason = input.reason.trim()
    if (!reason) {
      throw new Error('Explain the emergency.')
    }
    if (Object.values(data.advanceRequests).some((request) => request.employeeId === employee.id && request.status === 'pending')) {
      throw new Error(`${employee.name} already has an advance request waiting for the office.`)
    }

    const now = new Date().toISOString()
    const request: AdvanceRequestRecord = {
      id: createId('advance_request'),
      employeeId: employee.id,
      employeeName: employee.name,
      amount,
      reason,
      status: 'pending',
      submittedById: currentUser.id,
      submittedByName: currentUser.name,
      createdAt: now,
      updatedAt: now,
    }

    await update(ref(getDatabaseOrThrow(), 'erp/advanceRequests'), { [request.id]: request })
    await writeActivity('advance_requested', 'salary', `${employee.name} asked for an emergency advance of ${amount} BDT.`)
    await writeNotification('Emergency advance requested', `${employee.name} asked for ${amount} BDT: ${reason}`, 'warning', ['admin', 'accountant'])
  }

  /** Approving gives the employee the approved amount as an advance on this month's pay. */
  async function reviewAdvanceRequest(requestId: string, decision: 'approve' | 'reject', options: { amount?: number; method?: string; note?: string } = {}) {
    const reviewer = requireAdminUser('approve advances')
    const request = data?.advanceRequests[requestId]
    if (!data || !request) {
      throw new Error('Advance request not found.')
    }
    if (request.status !== 'pending') {
      throw new Error('This request has already been reviewed.')
    }

    const now = new Date().toISOString()
    const updates: Record<string, unknown> = {}
    let approvedAmount = 0
    let advanceId = ''

    if (decision === 'approve') {
      const employee = data.employees[request.employeeId]
      if (!employee) {
        throw new Error('Employee not found.')
      }
      approvedAmount = Number(options.amount ?? request.amount)
      if (!(approvedAmount > 0)) {
        throw new Error('Enter the amount to give.')
      }

      const date = dayKey()
      const advance: EmployeeAdvanceRecord = {
        id: createId('advance'),
        employeeId: employee.id,
        employeeName: employee.name,
        month: date.slice(0, 7),
        date,
        amount: approvedAmount,
        method: options.method?.trim() || 'cash',
        note: ['Emergency', request.reason, options.note?.trim()].filter(Boolean).join(' — '),
        givenById: reviewer.id,
        givenByName: reviewer.name,
        createdAt: now,
      }
      advanceId = advance.id
      const salary = salarySnapshot(employee, advance.month, { employeeAdvances: { [advance.id]: advance } })
      updates[`employeeAdvances/${advance.id}`] = advance
      updates[`salaries/${salary.id}`] = salary
    }

    updates[`advanceRequests/${requestId}`] = {
      ...request,
      status: decision === 'approve' ? 'approved' : 'rejected',
      ...(decision === 'approve' ? { approvedAmount, advanceId, method: options.method?.trim() || 'cash' } : {}),
      reviewNote: options.note?.trim() ?? '',
      reviewedById: reviewer.id,
      reviewedByName: reviewer.name,
      reviewedAt: now,
      updatedAt: now,
    }

    await update(ref(getDatabaseOrThrow(), 'erp'), updates)
    await writeAuditEntry({
      kind: 'advance',
      refId: requestId,
      decision: decision === 'approve' ? 'approved' : 'rejected',
      party: request.employeeName,
      summary: [request.reason, decision === 'approve' && approvedAmount !== request.amount ? `asked ${request.amount.toLocaleString()}` : '']
        .filter(Boolean)
        .join(' · '),
      amount: approvedAmount,
      submittedByName: request.submittedByName,
      submittedByRole: roleNameOf(request.submittedById),
      submittedAt: request.createdAt,
    })
    await writeActivity(
      decision === 'approve' ? 'advance_request_approved' : 'advance_request_rejected',
      'salary',
      decision === 'approve'
        ? `Approved ${approvedAmount} BDT emergency advance for ${request.employeeName}.`
        : `Refused ${request.employeeName}'s emergency advance request.`
    )
  }

  async function requestCommissionAuthorization(input: CommissionAuthorizationInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in first.')
    }

    const employee = data.employees[input.employeeId]
    if (!employee) {
      throw new Error('Employee not found.')
    }

    // The employee may apply for themselves; otherwise it takes someone who handles targets or payroll.
    const isSelf = Boolean(employee.userId && employee.userId === currentUser.id)
    const canApply =
      isSelf ||
      currentPermissions.includes('salary.view') ||
      currentPermissions.includes('sales_target.view') ||
      currentPermissions.includes('employees.edit')
    if (!canApply) {
      throw new Error('You do not have permission to apply for this employee.')
    }

    const reason = input.reason.trim()
    if (!reason) {
      throw new Error('Explain why the commission should be allowed.')
    }

    const month = input.month || currentMonthKey()
    const pay = computeMonthlyPay(data, employee, month)
    if (pay.achievementPercent >= 80) {
      throw new Error(`${employee.name} reached the target for this month; the commission is already payable.`)
    }

    const open = Object.values(data.commissionAuthorizations).find(
      (request) => request.employeeId === employee.id && request.month === month && request.status !== 'rejected'
    )
    if (open) {
      throw new Error(
        open.status === 'approved'
          ? 'The owner already authorized this month’s commission.'
          : 'A request for this month is already waiting for the owner.'
      )
    }

    const now = new Date().toISOString()
    const request: CommissionAuthorizationRecord = {
      id: createId('commission_auth'),
      employeeId: employee.id,
      employeeName: employee.name,
      month,
      reason,
      achievementPercent: pay.achievementPercent,
      status: 'pending',
      requestedById: currentUser.id,
      requestedByName: currentUser.name,
      requestedAt: now,
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp/commissionAuthorizations'), { [request.id]: request })
    await writeActivity(
      'commission_authorization_requested',
      'salary',
      `Asked the owner to authorize ${employee.name}'s ${month} commission (${pay.achievementPercent.toFixed(1)}% of target).`
    )
    await writeNotification(
      'Commission authorization requested',
      `${currentUser.name} asked to allow ${employee.name}'s commission for ${month} at ${pay.achievementPercent.toFixed(1)}% of target: ${reason}`,
      'warning',
      ['owner', 'admin']
    )
  }

  async function reviewCommissionAuthorization(requestId: string, decision: 'approve' | 'reject', note?: string) {
    if (!data || !currentUser) {
      throw new Error('You need to log in first.')
    }

    if (!canAuthorizeCommission(currentUser)) {
      throw new Error('Only the owner can authorize commission.')
    }

    const request = data.commissionAuthorizations[requestId]
    if (!request) {
      throw new Error('Request not found.')
    }

    if (request.status !== 'pending') {
      throw new Error('This request was already decided.')
    }

    const next: CommissionAuthorizationRecord = {
      ...request,
      status: decision === 'approve' ? 'approved' : 'rejected',
      reviewedById: currentUser.id,
      reviewedByName: currentUser.name,
      reviewedAt: new Date().toISOString(),
      reviewNote: note?.trim() ?? '',
    }
    const updates: Record<string, unknown> = { [`commissionAuthorizations/${requestId}`]: next }
    const employee = data.employees[request.employeeId]
    if (employee) {
      const salary = salarySnapshot(employee, request.month, { commissionAuthorizations: { [requestId]: next } })
      updates[`salaries/${salary.id}`] = salary
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), updates)
    await writeActivity(
      decision === 'approve' ? 'commission_authorized' : 'commission_authorization_rejected',
      'salary',
      `${decision === 'approve' ? 'Authorized' : 'Refused'} ${request.employeeName}'s ${request.month} commission below target.`
    )
    await writeNotification(
      decision === 'approve' ? 'Commission authorized by owner' : 'Commission request refused',
      `${currentUser.name} ${decision === 'approve' ? 'authorized' : 'refused'} ${request.employeeName}'s commission for ${request.month}.`,
      'info',
      ['admin', 'accountant']
    )
  }

  // Screens only get the customers (and their orders, ledger, parcels) of the signed-in
  // user's zones. The actions below keep working on the full data.
  const visibleData = useMemo(() => (data ? scopeDataToUserZones(data, currentUser) : data), [currentUser, data])

  const value = useMemo<ERPContextValue>(
    () => ({
      data: visibleData,
      loading,
      error,
      users,
      currentUser,
      currentPermissions,
      login,
      isPortalUser,
      authorizedFetch,
      logout,
      changePassword,
      fetchLoginHistory,
      createUser,
      updateUser,
      deleteUser,
      createRole,
      updateRole,
      deleteRole,
      reviewRoleRequest,
      hasPermission: (permission) => currentPermissions.includes(permission),
      changesNeedApproval: needsApproval,
      reviewChangeRequest,
      saveProduct,
      deleteProduct,
      saveCustomer: viewOnlyForZone(saveCustomer),
      deleteCustomer: viewOnlyForZone(deleteCustomer),
      saveCustomerCommitment,
      deleteCustomerCommitment: viewOnlyForZone(deleteCustomerCommitment),
      reviewCustomerCommitment,
      saveZone: viewOnlyForZone(saveZone),
      deleteZone: viewOnlyForZone(deleteZone),
      saveDepot: viewOnlyForZone(saveDepot),
      deleteDepot: viewOnlyForZone(deleteDepot),
      setDealersDepot: viewOnlyForZone(setDealersDepot),
      saveDepotPrices: viewOnlyForZone(saveDepotPrices),
      saveSupplier,
      deleteSupplier,
      saveWarehouse,
      deleteWarehouse,
      recordPurchase,
      createOrder: viewOnlyForZone(createOrder),
      updateOrderStatus: viewOnlyForZone(updateOrderStatus),
      setCustomerCreditLimit: viewOnlyForZone(setCustomerCreditLimit),
      saveZonePrices: viewOnlyForZone(saveZonePrices),
      saveGeneralPrices,
      saveDealerPrices: viewOnlyForZone(saveDealerPrices),
      saveZonePriceExclusions: viewOnlyForZone(saveZonePriceExclusions),
      updateSettings,
      submitDeposit: viewOnlyForZone(submitDeposit),
      reviewDeposit: viewOnlyForZone(reviewDeposit),
      submitComplaint: viewOnlyForZone(submitComplaint),
      reviewComplaint: viewOnlyForZone(reviewComplaint),
      submitReplacement: viewOnlyForZone(submitReplacement),
      reviewReplacement: viewOnlyForZone(reviewReplacement),
      submitReplacementReturn: viewOnlyForZone(submitReplacementReturn),
      reviewReplacementReturn: viewOnlyForZone(reviewReplacementReturn),
      submitExpense,
      reviewExpense,
      saveBankAccount,
      deleteBankAccount,
      submitSupplierPayment,
      reviewSupplierPayment,
      submitOrderRequest: viewOnlyForZone(submitOrderRequest),
      editOrderRequest: viewOnlyForZone(editOrderRequest),
      reviewOrderRequest: viewOnlyForZone(reviewOrderRequest),
      postDelivery: viewOnlyForZone(postDelivery),
      updateDeliveryDetails: viewOnlyForZone(updateDeliveryDetails),
      submitDelivery: viewOnlyForZone(submitDelivery),
      editSubmission: viewOnlyForZone(editSubmission),
      markAttendance,
      canTakeAttendance,
      createTask,
      updateTaskStatus,
      markNotificationRead,
      markAllNotificationsRead,
      saveExpense,
      saveInvestor,
      deleteExpense,
      saveSeller,
      deleteSeller,
      recordSellerTransaction,
      deleteSellerTransaction,
      // A zone in charge may add entries for their zone's clients; they wait for the Authorizer and the Chairman.
      recordCreditLedgerEntry,
      reviewLedgerEntryRequest: viewOnlyForZone(reviewLedgerEntryRequest),
      deleteCreditLedgerEntry: viewOnlyForZone(deleteCreditLedgerEntry),
      saveCourier: viewOnlyForZone(saveCourier),
      updateCourierStatus: viewOnlyForZone(updateCourierStatus),
      deleteCourier: viewOnlyForZone(deleteCourier),
      saveDamageProduct,
      updateDamageProductStatus,
      deleteDamageProduct,
      saveLead: viewOnlyForZone(saveLead),
      deleteLead: viewOnlyForZone(deleteLead),
      saveEmployee,
      reviewEmployee,
      issueJoiningLetter,
      deleteEmployee,
      recordSale: viewOnlyForZone(recordSale),
      saveSalaryPayment,
      saveEmployeeAdvance,
      deleteEmployeeAdvance,
      requestCommissionAuthorization: viewOnlyForZone(requestCommissionAuthorization),
      reviewCommissionAuthorization,
      requestAdvance,
      reviewAdvanceRequest,
      saveBatteryReport: viewOnlyForZone(saveBatteryReport),
      deleteBatteryReport: viewOnlyForZone(deleteBatteryReport),
      saveBusiness,
      deleteBusiness,
      submitBusinessEntry,
      reviewBusinessEntry,
      deleteBusinessEntry,
    }),
    [canTakeAttendance, currentPermissions, currentUser, data, error, isPortalUser, loading, needsApproval, users, visibleData, zoneViewOnly]
  )

  return <ERPContext.Provider value={value}>{children}</ERPContext.Provider>
}

export function useERP() {
  const context = useContext(ERPContext)

  if (!context) {
    throw new Error('useERP must be used inside ERPProvider.')
  }

  return context
}
