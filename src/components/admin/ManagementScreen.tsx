"use client";

import {
  AccountBookOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlusOutlined,
  ProductOutlined,
  SearchOutlined,
  SettingOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Input, Progress, Row, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AdminShell } from './AdminShell';

const { Title, Text } = Typography;

type Section =
  | 'Admins'
  | 'Analytics'
  | 'Accounts'
  | 'Store'
  | 'Orders'
  | 'Wholesale'
  | 'Pages'
  | 'Settings'
  | 'User Order';

type RowData = {
  key: string;
  name: string;
  type: string;
  status: string;
  amount: string;
  updated: string;
};

const configs: Record<Section, {
  title: string;
  description: string;
  action: string;
  icon: React.ReactNode;
  tableTitle: string;
  chartTitle: string;
  rows: RowData[];
}> = {
  Admins: {
    title: 'Admin Management',
    description: 'Manage admin users, roles, permissions and account status.',
    action: 'Add Admin',
    icon: <TeamOutlined />,
    tableTitle: 'Admin List',
    chartTitle: 'Admin Activity',
    rows: [
      { key: '1', name: 'Rahat', type: 'Super Admin', status: 'Active', amount: 'Full Access', updated: 'Today' },
      { key: '2', name: 'Ritu', type: 'Manager', status: 'Active', amount: 'Inventory', updated: 'Yesterday' },
      { key: '3', name: 'Shuvo', type: 'Support', status: 'Inactive', amount: 'Orders', updated: 'Jun 30' },
    ],
  },
  Analytics: {
    title: 'Analytics Overview',
    description: 'Track orders, revenue, conversion and operational performance.',
    action: 'Export Analytics',
    icon: <BarChartOutlined />,
    tableTitle: 'Analytics Summary',
    chartTitle: 'Performance Trend',
    rows: [
      { key: '1', name: 'Website Visitors', type: 'Traffic', status: 'Growing', amount: '12,450', updated: 'Live' },
      { key: '2', name: 'Order Conversion', type: 'Sales', status: 'Stable', amount: '8.4%', updated: 'Today' },
      { key: '3', name: 'Campaign ROI', type: 'Marketing', status: 'Healthy', amount: '3.2x', updated: 'Today' },
    ],
  },
  Accounts: {
    title: 'Accounts',
    description: 'Monitor payments, expenses, balances and account entries.',
    action: 'Add Entry',
    icon: <AccountBookOutlined />,
    tableTitle: 'Account Entries',
    chartTitle: 'Cash Flow',
    rows: [
      { key: '1', name: 'Account Balance', type: 'Balance', status: 'Open', amount: '500000 TK', updated: 'Today' },
      { key: '2', name: 'Office Cost', type: 'Expense', status: 'Reviewed', amount: '0 TK', updated: 'Today' },
      { key: '3', name: 'Courier Payment', type: 'Payment', status: 'Pending', amount: '0 TK', updated: 'Today' },
    ],
  },
  Store: {
    title: 'Store Management',
    description: 'Manage categories, products, purchases, returns and inventory.',
    action: 'Add Product',
    icon: <ShopOutlined />,
    tableTitle: 'Store Items',
    chartTitle: 'Store Stock Trend',
    rows: [
      { key: '1', name: "Men's Jacket", type: 'Category', status: 'Active', amount: '257 pcs', updated: 'Today' },
      { key: '2', name: 'Punjabi', type: 'Category', status: 'Active', amount: '120 pcs', updated: 'Today' },
      { key: '3', name: 'Tracksuit', type: 'Category', status: 'Low Stock', amount: '0 pcs', updated: 'Today' },
    ],
  },
  Orders: {
    title: 'Orders',
    description: 'Process customer orders, shipment status and delivery updates.',
    action: 'Create Order',
    icon: <ShoppingCartOutlined />,
    tableTitle: 'Order List',
    chartTitle: 'Order Flow',
    rows: [
      { key: '1', name: 'ORD-1001', type: 'Online', status: 'Pending', amount: '2,500 TK', updated: 'Today' },
      { key: '2', name: 'ORD-1002', type: 'Store', status: 'Ready', amount: '1,200 TK', updated: 'Today' },
      { key: '3', name: 'ORD-1003', type: 'Courier', status: 'Shipped', amount: '3,900 TK', updated: 'Yesterday' },
    ],
  },
  Wholesale: {
    title: 'Wholesale',
    description: 'Manage wholesale customers, bulk orders and business payments.',
    action: 'New Wholesale',
    icon: <ProductOutlined />,
    tableTitle: 'Wholesale Orders',
    chartTitle: 'Wholesale Payment Trend',
    rows: [
      { key: '1', name: 'Dhaka Retail Hub', type: 'Bulk Order', status: 'Active', amount: '120000 TK', updated: 'Today' },
      { key: '2', name: 'Chittagong Partner', type: 'Dealer', status: 'Pending', amount: '85000 TK', updated: 'Jun 30' },
      { key: '3', name: 'Sylhet Zone', type: 'Wholesale', status: 'Completed', amount: '65000 TK', updated: 'Jun 28' },
    ],
  },
  Pages: {
    title: 'Pages',
    description: 'Create, publish and update website content pages.',
    action: 'Create Page',
    icon: <FileTextOutlined />,
    tableTitle: 'Website Pages',
    chartTitle: 'Content Updates',
    rows: [
      { key: '1', name: 'Home Page', type: 'Landing', status: 'Published', amount: 'Main', updated: 'Today' },
      { key: '2', name: 'About Us', type: 'Content', status: 'Published', amount: 'Public', updated: 'Yesterday' },
      { key: '3', name: 'Contact', type: 'Form', status: 'Draft', amount: 'Public', updated: 'Jun 30' },
    ],
  },
  Settings: {
    title: 'Settings',
    description: 'Configure shop profile, notifications, access and system preferences.',
    action: 'Save Settings',
    icon: <SettingOutlined />,
    tableTitle: 'Setting Modules',
    chartTitle: 'System Health',
    rows: [
      { key: '1', name: 'Business Profile', type: 'General', status: 'Configured', amount: 'Muaz Technology', updated: 'Today' },
      { key: '2', name: 'Notification Rules', type: 'System', status: 'Active', amount: '8 Rules', updated: 'Today' },
      { key: '3', name: 'User Access', type: 'Security', status: 'Reviewed', amount: '3 Roles', updated: 'Yesterday' },
    ],
  },
  'User Order': {
    title: 'User Order',
    description: 'View and manage user-wise orders, statuses and recent activity.',
    action: 'New User Order',
    icon: <ShoppingCartOutlined />,
    tableTitle: 'User Orders',
    chartTitle: 'User Order Trend',
    rows: [
      { key: '1', name: 'Rahat', type: 'Customer', status: 'Pending', amount: '0 Orders', updated: 'Today' },
      { key: '2', name: 'Ritu', type: 'Customer', status: 'Ready', amount: '0 Orders', updated: 'Today' },
      { key: '3', name: 'Shuvo', type: 'Customer', status: 'Completed', amount: '0 Orders', updated: 'Today' },
    ],
  },
};

const trendData = [
  { name: 'Sat', value: 12 },
  { name: 'Sun', value: 18 },
  { name: 'Mon', value: 14 },
  { name: 'Tue', value: 26 },
  { name: 'Wed', value: 22 },
  { name: 'Thu', value: 31 },
  { name: 'Fri', value: 28 },
];

function statusColor(status: string) {
  if (['Active', 'Growing', 'Healthy', 'Published', 'Configured', 'Completed', 'Shipped'].includes(status)) return 'green';
  if (['Pending', 'Draft', 'Ready', 'Stable', 'Reviewed', 'Open'].includes(status)) return 'gold';
  if (['Low Stock', 'Inactive'].includes(status)) return 'red';
  return 'blue';
}

export function ManagementScreen({ section }: { section: Section }) {
  const config = configs[section];

  const columns: ColumnsType<RowData> = [
    { title: 'NAME', dataIndex: 'name', render: (value) => <strong>{value}</strong> },
    { title: 'TYPE', dataIndex: 'type' },
    { title: 'STATUS', dataIndex: 'status', render: (value) => <Tag color={statusColor(value)}>{value}</Tag> },
    { title: 'VALUE', dataIndex: 'amount', render: (value) => <strong>{value}</strong> },
    { title: 'UPDATED', dataIndex: 'updated' },
    {
      title: 'ACTION',
      render: () => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} />
          <Button size="small" icon={<EditOutlined />} />
          <Button size="small" icon={<DeleteOutlined />} />
        </Space>
      ),
    },
  ];

  return (
    <AdminShell active={section === 'User Order' ? 'Orders' : section}>
      <section className="page-head management-head">
        <div>
          <Title level={3}>{config.title}</Title>
          <Text>{config.description}</Text>
          <div className="breadcrumb">Dashboard / {config.title}</div>
        </div>
        <Button type="primary" size="large" icon={<PlusOutlined />}>{config.action}</Button>
      </section>

      <Row gutter={[16, 16]} className="management-kpis">
        {[
          { label: 'Total', value: '128', icon: config.icon },
          { label: 'Active', value: '94', icon: <CheckCircleOutlined /> },
          { label: 'Pending', value: '18', icon: <ClockCircleOutlined /> },
          { label: 'Growth', value: '76%', icon: <BarChartOutlined /> },
        ].map((item) => (
          <Col xs={24} sm={12} lg={6} key={item.label}>
            <Card className="metric-tile">
              <span className="metric-bg" />
              <div className="metric-icon">{item.icon}</div>
              <div>
                <Text className="metric-label">{item.label}</Text>
                <strong>{item.value}</strong>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[18, 18]} className="mt-18">
        <Col xs={24} lg={15}>
          <Card className="chart-card" title={config.chartTitle}>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#2563eb" fill="#dbeafe" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card className="chart-card" title="Progress">
            <Space direction="vertical" size={18} className="w-full">
              <div>
                <Text strong>Completion</Text>
                <Progress percent={76} strokeColor="#2563eb" />
              </div>
              <div>
                <Text strong>Accuracy</Text>
                <Progress percent={88} strokeColor="#16a34a" />
              </div>
              <div>
                <Text strong>Pending Work</Text>
                <Progress percent={22} strokeColor="#f59e0b" />
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card className="report-card mt-18" title={config.tableTitle}>
        <div className="stock-toolbar">
          <Space>
            <Text>Show</Text>
            <Select defaultValue={10} options={[{ value: 10, label: '10' }, { value: 25, label: '25' }, { value: 50, label: '50' }]} />
            <Text>entries</Text>
          </Space>
          <Input prefix={<SearchOutlined />} placeholder={`Search ${config.title.toLowerCase()}...`} />
        </div>
        <Table
          size="small"
          rowKey="key"
          columns={columns}
          dataSource={config.rows}
          pagination={{ pageSize: 5 }}
          scroll={{ x: 820 }}
        />
      </Card>
    </AdminShell>
  );
}
