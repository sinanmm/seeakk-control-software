import { PrismaClient, EntitlementKey, EntitlementType, BillingInterval } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding SEEAKK Control Software initial data...');

  // 1. Seed System Roles
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    update: {},
    create: {
      name: 'SUPER_ADMIN',
      description: 'Unrestricted control over all customer companies, plans, billing, and system configurations.',
      isSystem: true,
    },
  });

  const billingAdminRole = await prisma.role.upsert({
    where: { name: 'BILLING_ADMIN' },
    update: {},
    create: {
      name: 'BILLING_ADMIN',
      description: 'Management of plans, subscriptions, invoices, payments, and financial reports.',
      isSystem: true,
    },
  });

  const supportAdminRole = await prisma.role.upsert({
    where: { name: 'SUPPORT_ADMIN' },
    update: {},
    create: {
      name: 'SUPPORT_ADMIN',
      description: 'Operational management of company status, grace periods, usage review, and limits.',
      isSystem: true,
    },
  });

  const viewerRole = await prisma.role.upsert({
    where: { name: 'VIEWER' },
    update: {},
    create: {
      name: 'VIEWER',
      description: 'Read-only access to companies, usage statistics, and reports.',
      isSystem: true,
    },
  });

  // 2. Seed Standard Permissions
  const permissions = [
    { code: 'companies:read', module: 'companies', description: 'View company profiles, usage, and status' },
    { code: 'companies:write', module: 'companies', description: 'Create and edit company profiles and settings' },
    { code: 'companies:status', module: 'companies', description: 'Change company operational status (e.g. suspend, activate)' },
    { code: 'plans:manage', module: 'plans', description: 'Create, update, and manage subscription plans' },
    { code: 'entitlements:override', module: 'entitlements', description: 'Configure custom company limit overrides' },
    { code: 'grace_period:manage', module: 'grace_period', description: 'Grant, extend, or revoke grace periods' },
    { code: 'billing:read', module: 'billing', description: 'View invoices, payments, and financial summaries' },
    { code: 'billing:manage', module: 'billing', description: 'Create invoices, record payments, and manage subscriptions' },
    { code: 'admins:manage', module: 'administration', description: 'Manage admin user accounts and roles' },
    { code: 'audit:read', module: 'administration', description: 'View system audit trail and activity history' },
  ];

  for (const perm of permissions) {
    const p = await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description, module: perm.module },
      create: perm,
    });

    // Assign all to SUPER_ADMIN
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdminRole.id,
          permissionId: p.id,
        },
      },
      update: {},
      create: {
        roleId: superAdminRole.id,
        permissionId: p.id,
      },
    });
  }

  // 3. Seed Default Super Admin
  const defaultPasswordHash = await bcrypt.hash('ControlAdmin2026!', 10);
  await prisma.adminUser.upsert({
    where: { email: 'admin@control.seeakk.internal' },
    update: {},
    create: {
      email: 'admin@control.seeakk.internal',
      name: 'Control Super Administrator',
      passwordHash: defaultPasswordHash,
      roleId: superAdminRole.id,
      isActive: true,
    },
  });

  // 4. Seed Standard Plans & Entitlements
  const starterPlan = await prisma.plan.upsert({
    where: { code: 'STARTER' },
    update: {},
    create: {
      code: 'STARTER',
      name: 'Starter Plan',
      description: 'Ideal for small sales teams initiating outreach operations.',
      billingInterval: BillingInterval.MONTHLY,
      price: 4999,
      currency: 'INR',
      isActive: true,
      sortOrder: 1,
      entitlements: {
        create: [
          { key: EntitlementKey.USERS, type: EntitlementType.NUMERIC, numericValue: 5 },
          { key: EntitlementKey.LEADS, type: EntitlementType.NUMERIC, numericValue: 2500 },
          { key: EntitlementKey.LEAD_IMPORTS, type: EntitlementType.NUMERIC, numericValue: 5 },
          { key: EntitlementKey.STORAGE_GB, type: EntitlementType.NUMERIC, numericValue: 10 },
          { key: EntitlementKey.API_ACCESS, type: EntitlementType.BOOLEAN, booleanValue: false },
        ],
      },
    },
  });

  const growthPlan = await prisma.plan.upsert({
    where: { code: 'GROWTH' },
    update: {},
    create: {
      code: 'GROWTH',
      name: 'Growth Plan',
      description: 'Accelerated outbound capabilities for scaling revenue organizations.',
      billingInterval: BillingInterval.MONTHLY,
      price: 14999,
      currency: 'INR',
      isActive: true,
      sortOrder: 2,
      entitlements: {
        create: [
          { key: EntitlementKey.USERS, type: EntitlementType.NUMERIC, numericValue: 20 },
          { key: EntitlementKey.LEADS, type: EntitlementType.NUMERIC, numericValue: 15000 },
          { key: EntitlementKey.LEAD_IMPORTS, type: EntitlementType.NUMERIC, numericValue: 25 },
          { key: EntitlementKey.STORAGE_GB, type: EntitlementType.NUMERIC, numericValue: 50 },
          { key: EntitlementKey.API_ACCESS, type: EntitlementType.BOOLEAN, booleanValue: true },
        ],
      },
    },
  });

  const enterprisePlan = await prisma.plan.upsert({
    where: { code: 'ENTERPRISE' },
    update: {},
    create: {
      code: 'ENTERPRISE',
      name: 'Enterprise Plan',
      description: 'Dedicated resources, high-volume limits, and bespoke SLA support.',
      billingInterval: BillingInterval.MONTHLY,
      price: 39999,
      currency: 'INR',
      isActive: true,
      sortOrder: 3,
      entitlements: {
        create: [
          { key: EntitlementKey.USERS, type: EntitlementType.NUMERIC, numericValue: 100 },
          { key: EntitlementKey.LEADS, type: EntitlementType.NUMERIC, numericValue: 100000 },
          { key: EntitlementKey.LEAD_IMPORTS, type: EntitlementType.NUMERIC, numericValue: 100 },
          { key: EntitlementKey.STORAGE_GB, type: EntitlementType.NUMERIC, numericValue: 250 },
          { key: EntitlementKey.API_ACCESS, type: EntitlementType.BOOLEAN, booleanValue: true },
          { key: EntitlementKey.CUSTOM_DOMAINS, type: EntitlementType.BOOLEAN, booleanValue: true },
          { key: EntitlementKey.DEDICATED_SUPPORT, type: EntitlementType.BOOLEAN, booleanValue: true },
        ],
      },
    },
  });

  console.log('Seeding completed successfully:');
  console.log(`- Super Admin: admin@control.seeakk.internal / ControlAdmin2026!`);
  console.log(`- Plans: ${starterPlan.code}, ${growthPlan.code}, ${enterprisePlan.code}`);
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
